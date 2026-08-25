# Intégration — marketplace (xmarketplace)

## 1. Rôle

Plugin cœur de la plateforme : CRUD plugins, soumissions, notation,
catégories, webhooks, liaison GitHub des développeurs, et déclenchement
asynchrone du pipeline de validation (11 gates) via Celery.

## 2. ⚠️ Pré-requis hôte — pas fournis par ce repo

Ce plugin importe deux paquets qui vivent à la **racine** du projet hôte,
pas dans ce plugin lui-même :

```python
from sandbox import SandboxLimits                    # main.py, routes/github.py, routes/submissions.py
from middleware.submission_limit import check_rate_limit, check_submission_rate  # routes/github.py, routes/submissions.py
```

Contrairement aux autres plugins de cet écosystème (qui ne dépendent que
d'autres plugins via IPC), `marketplace` est **couplé à l'infrastructure du
backend qui l'héberge** — voir `backends/sandbox/` et
`backends/middleware/submission_limit.py` dans le repo
[Marketplace](https://github.com/xcore-team/Marketplace). Un hôte qui
installe ce plugin sans ces deux paquets à sa racine ne démarrera pas
(`ImportError`).

## 3. Dépendances (`plugin.yaml` → `requires`)

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## 4. Permissions

```yaml
permissions:
  - resource: "ext.email"
    actions: ["send", "queue"]
    effect: allow
  - resource: network
    description: "Requêtes GitHub API (repos, tags, téléchargement de ZIP) via httpx"
```

## 5. Routes exposées (préfixe `/marketplace`)

| Sous-préfixe | Fichier | Domaine |
|---|---|---|
| `/plugins` | `routes/plugins.py`, `routes/install.py` | CRUD plugins, versions, installation |
| `/submissions` | `routes/submissions.py` | Soumission de ZIP, suivi du pipeline (rate-limité — `middleware.submission_limit`) |
| `/github` | `routes/github.py` | Liaison compte GitHub développeur, liste des tags, soumission depuis un tag |
| `/categories` | `routes/categories.py` | CRUD catégories |
| `/webhooks` | `routes/webhooks.py` | Webhooks développeur (notifications de soumission) |
| `/admin` | `routes/admin.py` | Routes admin (voir aussi le plugin `xadmin`) |

## 6. Variables d'environnement — ⚠️ secret

```dotenv
MARKET_SECRET_KEY=<clé secrète de l'application>
MARKET_APP_NAME=...
MARKET_APP_BASE_URL=...
MARKET_SANDBOX_MEMORY_MB=...
MARKET_SANDBOX_CPU_SECONDS=...
MARKET_SANDBOX_TIMEOUT=...
```

Injectées depuis `.env.template` au démarrage — **ne jamais committer
`.env`**.

## 7. Données statiques embarquées

`data/assets/` (mascotte) et `data/templates/*.html` (emails Jinja2 —
notifications de pipeline, invitations) sont embarqués dans ce plugin, pas
dans `xmailler`.
