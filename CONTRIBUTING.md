# Guide développeur — XCore Market

Ce document explique comment naviguer dans le code, ajouter des fonctionnalités et comprendre les décisions d'architecture du projet.

---

## Table des matières

1. [Structure du projet](#structure-du-projet)
2. [Concepts clés du framework XCore](#concepts-clés-du-framework-xcore)
3. [Plugin xauth — comment ça marche](#plugin-xauth--comment-ça-marche)
4. [Plugin marketplace — comment ça marche](#plugin-marketplace--comment-ça-marche)
5. [Extension worker (Celery)](#extension-worker-celery)
6. [Pipeline de sécurité](#pipeline-de-sécurité)
7. [Ajouter une route](#ajouter-une-route)
8. [Ajouter une tâche Celery](#ajouter-une-tâche-celery)
9. [Ajouter une permission / un rôle](#ajouter-une-permission--un-rôle)
10. [Variables d'environnement](#variables-denvironnement)
11. [Commandes utiles](#commandes-utiles)
12. [Pièges connus](#pièges-connus)

---

## Structure du projet

```
xcore-market/
├── app/
│   ├── xauth/src/          # Plugin authentification
│   │   ├── models/         # SQLAlchemy : User, Role, Permission, Tenant, ...
│   │   ├── repositories/   # Accès DB bas niveau (pas de logique métier)
│   │   ├── services/       # Logique métier (auth, rbac, seed, ...)
│   │   ├── routes/         # FastAPI routers
│   │   ├── schemas/        # Pydantic I/O
│   │   ├── backend.py      # Implémentation AuthBackend (décode JWT → AuthPayload)
│   │   └── main.py         # Plugin.on_load() — point d'entrée XCore
│   │
│   └── marketplace/src/    # Plugin marketplace
│       ├── models/         # Plugin, PluginVersion, Category, Submission, Rating
│       ├── services/       # PluginService, SubmissionService, RatingService, ...
│       ├── routes/         # plugins, categories, submissions, admin
│       ├── schemas/        # Pydantic I/O
│       ├── notifications/  # Envoi d'emails pipeline
│       ├── tasks.py        # Tâches Celery (process_submission)
│       └── main.py         # Plugin.on_load() — point d'entrée XCore
│
├── pipelines/              # Orchestrateur + 9 gates de sécurité
│   ├── models.py           # GateResult, SubmissionResult, Finding, Severity
│   ├── orchestrator.py     # PipelineOrchestrator.run_all()
│   └── gates/              # intake, static, secrets, sandbox, behavioral, ...
│
├── sandbox/
│   ├── pipeline.py         # SandboxedPipeline : extraction ZIP + orchestration
│   ├── runner.py           # SandboxLimits, exécution isolée
│   └── extractor.py        # Dézip sécurisé vers /tmp
│
├── extensions/
│   ├── worker/             # Extension Celery réutilisable
│   │   ├── main.py         # WorkerService + app Celery module-level
│   │   ├── registry.py     # @task() décorateur + task_registry
│   │   └── config.py       # WorkerConfig dataclass
│   └── mail/               # Extension SMTP
│
├── integration.yaml        # Config XCore : DB, Redis, extensions, observabilité
├── main.py                 # Point d'entrée serveur
└── pyproject.toml          # Dépendances + config editable install
```

---

## Concepts clés du framework XCore

### Plugin

Un plugin XCore est un dossier dans `app/` avec un `src/main.py` qui expose une classe héritant de `TrustedBase` (ou `AutoDispatchMixin`). La méthode `on_load()` est appelée au démarrage — c'est là qu'on enregistre les routes, appelle le seed, etc.

```python
# app/marketplace/src/main.py (exemple simplifié)
class Plugin(TrustedBase):
    async def on_load(self):
        db = self.get_service("db")
        self.router = plugins_router(db)
    def get_router(self):
        
        # il arrive a monte la route avec l'url /app/nom_plugin
        return self.router

```

### AuthPayload

`AuthPayload` est le résultat du décodage JWT. Il contient :

```python
{
    "sub": "user-uuid",
    "roles": ["admin"],
    "permissions": ["plugin:list", "plugin:approve", ...],
    "user": {"tenant_id": "tenant-uuid", "email": "..."}
}
```

On le récupère dans une route avec `Depends(get_current_user)` ou `Depends(require_permission("perm:name"))`.

### require_permission

```python
@router.post("/categories")
async def create_category(
    body: CategoryCreate,
    current_user: AuthPayload = Depends(require_permission("plugin:approve")),
):
    ...
```

> **Important (Pydantic V2)** : ne jamais nommer le paramètre `_` — utiliser un nom explicite comme `current_user`.

---

## Plugin xauth — comment ça marche

### Flux d'authentification

```
POST /app/auth/register
  → crée User + TenantMember (tenant "default", rôle "user")
  → retourne access_token + refresh_token

POST /app/auth/login
  → vérifie password, crée Session
  → retourne access_token (JWT RS256, TTL 15 min) + refresh_token (TTL 7 jours)

Requête authentifiée
  → Header: Authorization: Bearer <access_token>
  → backend.py::decode_token() → lit le JWT → charge permissions depuis Redis ou DB
  → injecte AuthPayload dans la route via Depends(get_current_user)
```

### Seed au démarrage

`app/xauth/src/services/seed.py::run_seed()` est appelé dans `on_load()`. Il crée (une seule fois, idempotent) :

- 37 permissions
- Le rôle `admin` (toutes les permissions)
- Le rôle `user` (8 permissions de base)
- Le tenant `default`
- L'utilisateur admin est configure dans le manifeste du plugin

### RBAC

Les permissions sont cachées dans Redis (TTL 5 min). Le cache est invalidé à chaque modification de rôle.

Couches :
```
routes/rbac.py → services/rbac.py → repositories/rbac.py → DB
                                  ↘ cache Redis (TTL 300s)
```

---

## Plugin marketplace — comment ça marche

### Cycle de vie d'un plugin

```
1. Développeur crée la fiche plugin
   POST /app/marketplace/plugins  →  Plugin (is_published=False)

2. Développeur soumet un ZIP
   POST /app/marketplace/submissions  →  202 immédiat, Submission(status="pending")
         ↓
   Worker Celery → SandboxedPipeline → 9 gates → anomaly_score

3. Publication automatique (dans PluginService.add_version)
   score ≤ 30  →  publish_status="auto_published", is_published=True
   31–79       →  publish_status="manual_review"  (admin décide)
   ≥ 80        →  publish_status="rejected",      is_published=False

4. Versionnage fichier
   verified/{slug}/{version}/{slug}-{version}.zip
   verified/{slug}/{version}/{slug}-{version}.sig.json
```

### Modèles importants

| Modèle | Fichier | Rôle |
|--------|---------|------|
| `Plugin` | `models/plugin.py` | Fiche plugin (slug, is_published, developer_id) |
| `PluginVersion` | `models/plugin.py` | Version ZIP (anomaly_score, publish_status, is_yanked) |
| `Category` | `models/plugin.py` | Catégorie (many-to-many avec Plugin) |
| `Submission` | `models/submission.py` | Suivi pipeline (status, report_json, anomaly_score) |
| `Rating` | `models/rating.py` | Note 1–5 par utilisateur |

### Routes admin

Toutes sous `/app/marketplace/admin/`, requièrent `plugin:approve` ou `plugin:delete`.

```
GET  /admin/plugins              → liste tous les plugins (filtre published=true/false)
PATCH /admin/plugins/{slug}      → modifier is_published, description, catégories
DELETE /admin/plugins/{slug}     → supprimer
POST  /admin/plugins/{slug}/versions/{v}/yank  → retirer une version
GET  /admin/submissions          → toutes les soumissions (filtre status)
PATCH /admin/submissions/{id}/status  → forcer un statut
```

---

## Extension worker (Celery)

### Architecture

L'extension `extensions/worker/` est conçue pour être réutilisable dans d'autres projets XCore. Elle ne contient aucun import spécifique à `marketplace`.

```
extensions/worker/
├── main.py      # WorkerService (BaseService XCore) + app Celery au niveau module
├── registry.py  # @task() décorateur + task_registry dict + register_pending_tasks()
└── config.py    # WorkerConfig dataclass
```

### Comment une tâche est enregistrée

1. `@task(name="...", queue="submissions", bind=True)` dans `tasks.py` — ajoute la fonction à `_pending_tasks`
2. Au démarrage du worker, `main.py` importe `tasks.py` puis appelle `register_pending_tasks(app)` — transforme chaque fonction en vraie tâche Celery
3. `task_registry["marketplace.process_submission"]` est disponible partout pour `.apply_async()`

### Envoyer une tâche depuis une route

```python
from extensions.worker.registry import task_registry

task_registry["marketplace.process_submission"].apply_async(
    kwargs={
        "submission_id": sub.id,
        "zip_path": str(zip_path),
        ...
    },
    queue="submissions",
)
```

### Lancer le worker

```bash
celery -A extensions.worker.app worker \
    --loglevel=info \
    -Q submissions,default \
    -c 8
```

> Le `-A extensions.worker.app` pointe sur la variable `app` dans `extensions/worker/main.py`. C'est pourquoi l'app Celery doit exister au niveau module (pas dans une fonction `init()`).

---

## Pipeline de sécurité

Le pipeline est dans `pipelines/` et `sandbox/`. Il est indépendant du reste — il peut être utilisé sans FastAPI ni Celery.

```
SandboxedPipeline.run()
  1. extract_plugin(zip_path) → /tmp/xcore_plugin_xxxxx/
  2. PipelineOrchestrator.run_all()
       → Gate 1: Intake (manifeste)       [bloquant si échec]
       → Gate 2: Static Analysis (Semgrep + AST)
       → Gate 3: Supply Chain
       → Gate 4: Secrets (entropie)
       → Gate 5: Sandbox (exécution isolée)
       → Gate 6: Behavioral
       → Gate 7: Signing (Merkle root)
       → Gate 8: Compliance (licences)
       → Gate 9: Supply Health (OpenSSF)
  3. cleanup(/tmp/...)
  4. _export_verified() → verified/{slug}/{version}/...
```

### Scores

| Seuil | Statut |
|-------|--------|
| `< 20` | `approved` |
| `20–49` | `manual_review` |
| `≥ 80` | `rejected` |

Défini dans `pipelines/models.py` : `SCORE_AUTO_APPROVE`, `SCORE_HIGH_PRIORITY`, `SCORE_AUTO_REJECT`.

La valeur `SCORE_AUTO_PUBLISH = 30` dans `PluginService` est le seuil de publication automatique côté marketplace (indépendant des seuils du pipeline).

---

## Ajouter une route

1. Créer ou modifier un router dans `app/marketplace/src/routes/`
2. L'enregistrer dans `app/marketplace/src/main.py` :
   ```python
   self.kernel.include_router(ma_router(db), prefix="/app/marketplace")
   ```
3. Utiliser `Depends(require_permission("perm:name"))` pour les routes protégées
4. Si la permission n'existe pas, l'ajouter dans `app/xauth/src/services/seed.py::PERMISSIONS`

---

## Ajouter une tâche Celery

1. Dans `app/<plugin>/src/tasks.py` :
   ```python
   from extensions.worker.registry import task

   @task(name="marketplace.ma_tache", queue="default", bind=True, max_retries=3)
   def ma_tache(self, param1: str, param2: int) -> dict:
       import asyncio
       return asyncio.run(_run_ma_tache(param1, param2))
   ```

2. S'assurer que `extensions/worker/main.py` importe le module `tasks` avant `register_pending_tasks()` :
   ```python
   import app.marketplace.src.tasks  # noqa: F401
   ```

3. Envoyer depuis n'importe où :
   ```python
   from extensions.worker.registry import task_registry
   task_registry["marketplace.ma_tache"].apply_async(
       kwargs={"param1": "...", "param2": 42},
       queue="default",
   )
   ```

---

## Ajouter une permission / un rôle

1. Ajouter la permission dans `app/xauth/src/services/seed.py::PERMISSIONS` :
   ```python
   ("ma_ressource:action", "Description de la permission"),
   ```

2. Si elle doit être assignée au rôle `user` par défaut, l'ajouter dans `USER_PERMISSIONS`.

3. Relancer le serveur — `run_seed()` est idempotent, il crée uniquement les entrées manquantes.

---

## Variables d'environnement

Copier `extensions/.env.example` vers `extensions/.env` et remplir :

```env
# Celery (Redis)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# SMTP (pour les emails de notification)
XAUTH_SMTP_HOST=smtp.example.com
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@example.com
XAUTH_SMTP_PASSWORD=motdepasse
XAUTH_SMTP_FROM=contact@example.com
XAUTH_SMTP_FROM_NAME=XCore Market
XAUTH_SMTP_USE_TLS=true
```

La base de données et Redis sont configurés directement dans `integration.yaml`.

---

## Commandes utiles

```bash
# Installer les dépendances
uv sync

# Installer les packages locaux (obligatoire — les workers Celery forkent des processus
# qui n'héritent pas du sys.path de Python, donc l'install editable est nécessaire)
pip install -e .

# Démarrer le serveur
python3 main.py

# Démarrer le worker Celery (terminal séparé)
celery -A extensions.worker.app worker \
    --loglevel=info \
    -Q submissions,default \
    -c 8

# Vérifier les tâches enregistrées
celery -A extensions.worker.app inspect registered

# Inspecter les workers actifs
celery -A extensions.worker.app inspect active

# Purger la queue submissions
celery -A extensions.worker.app purge -Q submissions
```

---

## Pièges connus

### `ModuleNotFoundError: No module named 'pipelines'` dans le worker

**Cause** : les workers Celery forkent des processus qui n'héritent pas du `sys.path` Python.

**Solution** : `pip install -e .` — installe `pipelines`, `sandbox`, `app`, `extensions` comme packages éditables dans le venv.

---

### `Fields must not use names with leading underscores` (Pydantic V2)

**Cause** : utiliser `_: AuthPayload = Depends(...)` dans une route.

**Solution** : renommer en `current_user: AuthPayload = Depends(...)`.

---

### `celery -A extensions.celery.main` échoue

**Cause** : le dossier `extensions/celery/` shadowe le package `celery` de pip.

**Solution** : l'extension est dans `extensions/worker/`, pas `extensions/celery/`. Ne jamais nommer un dossier comme un package pip.

---

### Les rôles/permissions sont vides après login

**Cause** : le JWT ne contient pas de `tenant_id` si le login est fait sans le spécifier. `backend.py` auto-résout le premier tenant de l'utilisateur quand `tenant_id` est absent.

**Vérification** : s'assurer que l'utilisateur a bien un `TenantMember` dans la DB (le seed le crée pour l'admin, l'inscription le crée pour les nouveaux users).

---

### Le pipeline rejette un ZIP valide

Vérifier dans l'ordre :
1. `GET /submissions/{id}/report` — voir quel gate a échoué et pourquoi
2. Le manifeste dans le ZIP (gate Intake est bloquant)
3. Les imports interdits dans `integration.yaml::security.forbidden_imports`
