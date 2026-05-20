# XCore Hub
on l'a fait => bien sur que on l'a fait
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![Framework](https://img.shields.io/badge/framework-xcore-purple.svg)](https://github.com/traoreera/xcore)
[![Status](https://img.shields.io/badge/status-active-green.svg)](#)

Hub de plugins pour l'écosystème XCore. Permet aux développeurs de soumettre, versionner et distribuer des plugins après validation par un pipeline de sécurité automatisé.

---

## Architecture

```
xcore-market/
├── app/
│   ├── xauth/          # Plugin authentification & RBAC
│   ├── marketplace/    # Plugin marketplace (plugins, soumissions, catégories)
│   └── xpulse/         # Plugin SSE — notifications temps réel via Redis
├── extensions/
│   ├── xmailler/       # Extension email SMTP
│   ├── xwebsocket/     # Extension WebSocket multi-canaux
│   └── worker/         # Extension Celery (tâches asynchrones)
├── middleware/          # CORS, sécurité, rate limit, upload size
├── pipelines/          # Pipeline de sécurité (9 gates)
├── sandbox/            # Exécution isolée des plugins
├── verified/           # ZIPs vérifiés versionnés
├── main.py             # Point d'entrée FastAPI
├── run.py              # Lanceur API + Celery (subprocesses)
└── integration.yaml    # Configuration xcore
```

### Flux de soumission

```
Developer
   │
   ▼
POST /submissions ──────────────────────────────────► 202 { id, status: "pending" }
   │                                                           │
   │ (Celery task: marketplace.process_submission)             │
   ▼                                                           ▼
Worker (process séparé)                              GET /submissions/{id}
   │                                                   { status: "approved" | ... }
   ├─► Pipeline 9 gates
   │
   ├─► DB: update submission + plugin
   │
   └─► Celery task: marketplace.notify_result
           │
           ├─► Email (via EmailService direct)
           │
           └─► Redis publish → xpulse SSE → navigateur
```

---

## Plugins

### xauth — Authentification & RBAC

- JWT RS256 avec refresh token et rotation
- Multi-tenant — un utilisateur peut appartenir à plusieurs tenants
- RBAC — rôles et permissions par tenant avec cache Redis (TTL 5 min)
- OAuth — Google, GitHub, Discord, Microsoft
- MFA — TOTP configurable par utilisateur
- Invitations — par email avec token expirant
- Audit log — toutes les actions sensibles sont tracées
- Seed automatique — rôles, permissions et admin créés au démarrage

**Admin par défaut :**
- Email : `admin@gmail.com`
- Mot de passe : `Hunters123@`

---

### marketplace — Plugins & soumissions

#### Pipeline de sécurité (9 gates)

| Gate | Nom | Bloquant |
|------|-----|---------|
| 1 | Intake — validation du manifeste | Oui |
| 2 | Static Analysis — Semgrep + AST | Non |
| 3 | Supply Chain — dépendances, confusion de noms | Non |
| 4 | Secrets — détection + entropie | Non |
| 5 | Sandbox — exécution isolée mémoire/CPU | Non |
| 6 | Behavioral — analyse comportementale | Non |
| 7 | Signing — Merkle root + signature | Non |
| 8 | Compliance — licences copyleft | Non |
| 9 | Supply Health — score OpenSSF | Non |

#### Règles de publication automatique

| Anomaly Score | Statut version | Plugin publié | Notification |
|---------------|---------------|--------------|--------------|
| `≤ 30` | `auto_published` | Oui | Email admin "Publication auto ✅" |
| `31 – 79` | `manual_review` | Oui (en attente) | Email admin "Revue requise ⚠️" |
| `≥ 80` | `rejected` | Non | Email développeur "Rejeté ❌" |

#### Versionnage

```
verified/
  mon-plugin/
    1.0.0/
      mon-plugin-1.0.0.zip
      mon-plugin-1.0.0.sig.json
```

Chaque `PluginVersion` expose : `changelog`, `is_yanked`, `yanked_reason`, `publish_status`, contrainte unique `(plugin_id, version)`.

---

### xdocs — Documentation embarquée des plugins

xdocs extrait automatiquement 3 fichiers de chaque ZIP validé et les persiste en DB :

| Fichier attendu dans le ZIP | Slot DB | Contenu |
|----------------------------|---------|---------|
| `README.md` | `readme` | Documentation principale du plugin |
| `integration.md` / `integration.yaml` | `integration` | Guide d'intégration |
| `contributor.yaml` / `contributors.yaml` | `contributor` | Métadonnées contributeurs |

L'extraction se fait dans le worker Celery juste après `add_version()`, sans bloquer le pipeline. Si un fichier est absent du ZIP, le slot est `null`.

**Routes :**

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/plugins/{slug}/docs` | Docs de la dernière version validée |
| GET | `/plugins/{slug}/versions/{version}/docs` | Docs d'une version spécifique |

---

### xpulse — Notifications temps réel (SSE)

xpulse gère les notifications temps réel via Server-Sent Events (SSE) et Redis pub/sub.

**Flux :**
```
API route           →  events.emit("ext.notification.publish", {...})
Worker Celery       →  Redis PUBLISH directement (via client xpulse)
                              │
                    xpulse listener Redis
                              │
                    SSE → navigateur
```

**Canaux disponibles :** `notification`, `admin`, `broadcast`, `platform`

**Actions IPC :**

| Action | Permission | Description |
|--------|-----------|-------------|
| `xpulse.publish` | `xpulse:publish` | Message ciblé à un user |
| `xpulse.broadcast` | `xpulse:broadcast` | Broadcast à tous |
| `xpulse.stream` | auth | Ouvrir un flux SSE |
| `xpulse.subscribers` | `xpulse:publish` | Lister les abonnés |

---

## Routes API

### Auth (`/app/auth`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/register` | public | Inscription |
| POST | `/login` | public | Connexion → JWT |
| POST | `/refresh` | public | Renouveler le token |
| POST | `/logout` | auth | Révoquer la session |
| GET | `/me` | auth | Profil utilisateur |
| GET/POST | `/rbac/roles` | `role:list/create` | Gestion des rôles |
| GET/POST | `/rbac/permissions` | `permission:list` | Gestion des permissions |
| GET/POST | `/tenants` | `tenant:list/create` | Gestion des tenants |
| POST | `/invites` | `invite:create` | Créer une invitation |
| GET | `/audit` | `audit:read` | Logs d'audit |

### Hub — Public (`/app/marketplace`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/plugins` | public | Liste les plugins publiés |
| GET | `/plugins/{slug}` | public | Détails d'un plugin |
| GET | `/plugins/{slug}/versions/{v}/download` | auth | Télécharger un ZIP |
| POST | `/plugins` | `submissions:write` | Créer un plugin |
| DELETE | `/plugins/{slug}` | `submissions:write` | Supprimer son plugin |
| GET | `/categories` | public | Liste les catégories |
| GET | `/categories/{slug}/plugins` | public | Plugins d'une catégorie |
| POST | `/categories` | `plugin:approve` | Créer une catégorie |

### Hub — Soumissions (`/app/marketplace`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/submissions` | `submissions:write` | Soumettre un ZIP (async, max 10 MB) |
| GET | `/submissions` | auth | Ses soumissions |
| GET | `/submissions/{id}` | auth | Détail d'une soumission |
| GET | `/submissions/{id}/report` | auth | Rapport pipeline complet |

### Hub — Admin (`/app/marketplace/admin`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/plugins` | `plugin:approve` | Tous les plugins (filtres: published, limit, offset) |
| GET | `/plugins/{slug}` | `plugin:approve` | Détails complets d'un plugin |
| PATCH | `/plugins/{slug}` | `plugin:approve` | Publier/modifier (description, catégories) |
| DELETE | `/plugins/{slug}` | `plugin:delete` | Supprimer définitivement |
| POST | `/plugins/{slug}/versions/{v}/yank` | `plugin:approve` | Retirer une version |
| GET | `/submissions` | `submission:review` | Toutes les soumissions (filtre: status) |
| PATCH | `/submissions/{id}/status` | `submission:review` | Forcer un statut |
| GET | `/developers` | `plugin:approve` | Tous les développeurs avec nombre de plugins |
| GET | `/developers/{id}/plugins` | `plugin:approve` | Plugins d'un développeur |

### xpulse (`/app/xpulse`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/stream` | auth | Flux SSE pour l'utilisateur connecté |

### Système

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Santé de l'API (db, email) |
| GET | `/metrics` | Métriques système (uptime, mémoire, plugins chargés) |

---

## Permissions RBAC

### xauth

`user:list` `user:read` `user:update` `user:delete` `user:ban`
`tenant:list` `tenant:read` `tenant:create` `tenant:update` `tenant:delete`
`role:list` `role:create` `role:update` `role:delete`
`permission:list` `permission:assign`
`invite:create` `invite:revoke`
`audit:read`
`admin:*`

### marketplace

`plugin:list` `plugin:read` `plugin:create` `plugin:update` `plugin:delete`
`plugin:approve` `plugin:reject` `plugin:feature`
`submissions:list` `submissions:read` `submissions:create` `submissions:write`
`submissions:review` `submissions:approve` `submissions:reject` `submissions:delete`
`submission:review`
`rating:create` `rating:delete`

### xpulse

`xpulse:publish` `xpulse:broadcast`

---

## Middlewares

| Middleware | Portée | Comportement |
|-----------|--------|-------------|
| CORS | Global | Origines depuis `ALLOWED_ORIGINS` (env) |
| Security Headers | Global | HSTS, X-Frame-Options DENY, X-Content-Type-Options |
| Rate Limit | Global (sauf /health /metrics /docs) | 200 req / 60 s par IP |
| Upload Size | POST `/submissions` et `/github` | Max 10 MB |
| GZip | Global | Compression si réponse > 1 KB |

---

## Installation

### Prérequis

- Python 3.12+
- Redis
- uv

### Installation

```bash
git clone <repo>
cd xcore-market

uv sync
python3 -m pip install -e .
```

### Configuration

```bash
cp .env.example .env
# Éditer .env avec vos valeurs
```

Variables clés :

```env
# Base de données
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/xcore_market

# Redis
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# JWT
JWT_SECRET=...
JWT_ALGORITHM=RS256

# SMTP
XAUTH_SMTP_HOST=smtp.example.com
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@example.com
XAUTH_SMTP_PASSWORD=...
XAUTH_SMTP_FROM=contact@example.com
XAUTH_SMTP_FROM_NAME=XCore Hub
XAUTH_SMTP_USE_TLS=true

# Hub
MARKET_SECRET_KEY=...
SANDBOX_MEMORY_MB=128
SANDBOX_CPU_SECONDS=10
SANDBOX_TIMEOUT=30

# API
ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
```

### Démarrage

**Option 1 — Tout en un (recommandé) :**

```bash
python3 run.py
```

Options disponibles :

```
--host                Hôte uvicorn (défaut: 0.0.0.0)
--port                Port uvicorn (défaut: 8000)
--workers             Workers uvicorn (défaut: 1)
--celery-concurrency  Workers Celery (défaut: 4)
--reload              Mode reload (dev)
--no-celery           Démarrer seulement l'API
--no-api              Démarrer seulement le worker
```

**Option 2 — Séparé :**

```bash
# Terminal 1 — API
python3 main.py

# Terminal 2 — Worker Celery
celery -A extensions.worker.app worker \
    --loglevel=info \
    -Q submissions,default \
    -c 4
```

---

## Architecture des notifications

```
┌─────────────┐   events.emit()   ┌──────────┐   SSE   ┌──────────────┐
│  API route  │ ──────────────►   │  xpulse  │ ──────► │  Navigateur  │
└─────────────┘                   └──────────┘         └──────────────┘
                                       ▲
┌─────────────┐  Redis PUBLISH         │
│   Worker    │ ──────────────────────►│
│   Celery    │                        │
└─────────────┘                        │
                              Redis pub/sub
```

Le worker Celery n'a pas accès au bus d'événements xcore (processus séparé). Il publie directement dans Redis via le client xpulse. Le processus xpulse écoute Redis et pousse les événements aux clients SSE connectés.

---

## WebSocket

Le plugin xwebsocket gère les connexions WebSocket persistantes.

**Canaux :** `user`, `admin`, `broadcast`, `platform`

**Route :** `ws://<host>/app/marketplace/ws/{channel}`

---

## Ce qu'il reste à faire

### Priorité haute

- [ ] **Tests** — aucun test unitaire ou d'intégration. Priorité absolue avant production.
- [ ] **Migrations Alembic** — actuellement `create_all` sans migration. Risque de perte de données sur évolution de schéma.
- [ ] **Stockage objet** — ZIPs stockés localement dans `verified/`. En production : S3, GCS ou équivalent.
- [ ] **Admin email configurable** — actuellement résolu par `LIKE '%admin%'` en base. Remplacer par une variable d'env `ADMIN_EMAIL`.

### Priorité moyenne

- [ ] **Pagination avec total** — exposer `{ items, total, page, pages }` sur toutes les routes paginées.
- [ ] **Recherche full-text** — `GET /plugins` ne supporte pas de recherche par nom, tag ou description.
- [ ] **Webhooks développeur** — notifier via webhook en plus de l'email.
- [ ] **Dashboard métriques Prometheus** — soumissions/jour, score moyen, taux de rejet.

### Priorité basse

- [ ] **CLI d'administration** — créer des tenants, resoumettre un plugin, réinitialiser un mot de passe.
- [ ] **Versionnage sémantique strict** — valider semver et refuser les régressions.
- [ ] **Blacklist développeurs** — suspension de compte avec blocage des soumissions.
- [ ] **Support multi-fichiers** — assets (images, docs) en plus du ZIP principal.

---

## Documentation développeur

Voir **[CONTRIBUTING.md](./CONTRIBUTING.md)** pour :
- Ajouter une route, une tâche Celery, une permission
- Les pièges connus (Pydantic V2, Celery forks, shadowing de packages)
- Architecture couche par couche

---

## Licence

Outil interne — XCore Hub Team. Distribution non autorisée.
