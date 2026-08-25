# Intégration — xservices

## 1. Rôle

Marketplace des **extensions de service** XCore (`BaseService`, distinctes
des plugins) : soumission, pipeline de validation (Gate 1/5 dédiés —
`gate_1_service`/`gate_5_service`, voir `pipelines/steps/service_intake.py`
et `service_sandbox.py`), publication, notation, installation.

## 2. Dépendances (`plugin.yaml` → `requires`)

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## 3. Permissions

```yaml
permissions:
  - resource: network
    description: "Requêtes GitHub API (tags, téléchargement de ZIP) via httpx"
```

## 4. Routes exposées (préfixe `/xservices`)

### `/services` — catalogue public (`routes/services.py`)

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/services` | Liste (résumé) |
| GET | `/services/mine` | Mes services publiés |
| GET | `/services/{slug}` | Détail |
| PATCH / DELETE | `/services/{slug}` | Édition / dépublication |
| GET | `/services/{slug}/docs` | Documentation (voir `xdocs`) |
| POST | `/services/{slug}/install` | Enregistre une installation |
| GET/POST | `/services/{slug}/ratings` | Notation |
| GET | `/services/{slug}/submissions` | Historique des soumissions |
| GET | `/services/categories` | Catégories |
| GET | `/services/{slug}/install` (`routes/install.py`) | Manifeste d'installation (résout signing-key via `xdevkeys`) |

### `/submissions` (`routes/submissions.py`)

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/submissions` | Soumission manuelle (upload direct) — `202 Accepted` |
| GET | `/submissions` / `/submissions/{id}` | Suivi |
| GET | `/submissions/{id}/report` | Rapport détaillé des 11 gates |

### `/github` (`routes/github.py`) — voir aussi [le CI workflow](https://github.com/xcore-team/xmailler/blob/main/.github/workflows/python-package-conda.yml)

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/github/publish` | JWT (`services:write`) | Publie depuis un tag Git déjà poussé |
| POST | `/github/repos/{owner}/{repo}/tags/{tag}/recompute` | `X-API-Key` | Équivalent CI — voir `ci_workflow_template` ci-dessous |
| GET | `/github/repos/{owner}/{repo}/ci-workflow` | JWT | Génère le YAML `.github/workflows/xcore-publish.yml` à committer dans le repo du service |

⚠️ Le template généré fige `{owner}/{repo}` **au moment de la génération**
dans l'URL du `curl` — un repo déplacé/transféré exige de régénérer et
recommitter le workflow (cause du bug corrigé dans `xmailler`, commit
`478c9fb`).

### `/admin` (`routes/admin.py`) — réservé aux admins

Approbation/rejet de soumissions, dépublication de service, yank de version.

## 5. Variables d'environnement — ⚠️ secret

```dotenv
DEVKEYS_MASTER_KEY=<même valeur que côté xdevkeys>
```

Voir `plugin.yaml` — même bug/même fix que `app/marketplace/plugin.yaml`,
trouvé en testant un déploiement de bout en bout.
