# XCore Market

[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![Framework](https://img.shields.io/badge/framework-xcore-purple.svg)](#)
[![Status](https://img.shields.io/badge/status-active-green.svg)](#)
[![Docs](https://img.shields.io/badge/docs-CONTRIBUTING.md-blue.svg)](./CONTRIBUTING.md)

Marketplace de plugins pour l'écosystème XCore. Permet aux développeurs de soumettre, versionner et distribuer des plugins après validation par un pipeline de sécurité automatisé.

---

## Architecture

Le projet est organisé en deux plugins xcore indépendants et une extension Celery :

```
xcore-market/
├── app/
│   ├── xauth/          # Plugin d'authentification & RBAC
│   └── marketplace/    # Plugin marketplace (plugins, soumissions, catégories)
├── extensions/
│   ├── mail/           # Extension email SMTP
│   └── worker/         # Extension Celery (tâches asynchrones)
├── pipelines/          # Pipeline de sécurité (9 gates)
├── sandbox/            # Exécution isolée des plugins
├── verified/           # ZIPs vérifiés versionnés
└── integration.yaml    # Configuration xcore
```

---

## Ce qui est implémenté

### Plugin xauth — Authentification & RBAC

- **Inscription / Connexion** JWT RS256 avec refresh token et rotation
- **Multi-tenant** — un utilisateur peut appartenir à plusieurs tenants
- **RBAC** — rôles et permissions par tenant avec cache Redis (TTL 5 min)
- **OAuth** — Google, GitHub, Discord, Microsoft
- **MFA** — TOTP configurable par utilisateur
- **Invitations** — système d'invitation par email avec token expirant
- **Audit log** — toutes les actions sensibles sont tracées
- **Mot de passe** — politique de sécurité, reset par email, changement
- **Seed automatique** — au démarrage, crée les rôles, permissions et l'admin si absents

#### Rôles seedés automatiquement

| Rôle | Description |
|------|-------------|
| `admin` | Toutes les permissions (37) |
| `user` | Permissions de base (lecture, soumission, notation) |

**Admin par défaut :**
- Email : `admin@gmail.com`
- Mot de passe : `Hunters123@`

#### Permissions disponibles (37)

`plugin:list/read/create/update/delete/approve/reject/feature` · `submissions:list/read/create/review/approve/reject/delete/write` · `rating:create/delete` · `user:list/read/update/delete/ban` · `tenant:list/read/create/update/delete` · `role:list/create/update/delete` · `permission:list/assign` · `audit:read` · `invite:create/revoke` · `admin:*`

---

### Plugin marketplace

#### Plugins
- Création avec catégories, slug auto-généré
- Publication automatique selon l'anomaly score
- Notation 1–5 avec moyenne calculée

#### Versionnage des fichiers

Chaque version est stockée dans un dossier dédié :

```
verified/
  mon-plugin/
    1.0.0/
      mon-plugin-1.0.0.zip
      mon-plugin-1.0.0.sig.json
    1.2.0/
      mon-plugin-1.2.0.zip
      mon-plugin-1.2.0.sig.json
```

Chaque `PluginVersion` expose :
- `changelog` — notes de version
- `is_yanked` + `yanked_reason` — retrait d'une version spécifique
- `publish_status` — `auto_published` / `manual_review` / `rejected` / `yanked`
- Contrainte unique `(plugin_id, version)` — pas de doublon de version

#### Règles de publication automatique

| Anomaly Score | Action | Notification |
|---------------|--------|--------------|
| `≤ 30` | Publié automatiquement | Email admin "Publication auto ✅" |
| `31 – 79` | Revue manuelle requise | Email admin "Revue requise ⚠️" |
| `≥ 80` | Rejeté, plugin dépublié | Email développeur "Rejeté ❌" |

#### Catégories
- CRUD catégories (admin)
- Listing plugins par catégorie (public)
- Association many-to-many plugin ↔ catégorie

#### Soumissions asynchrones (Celery)

Le pipeline de validation ne bloque plus la requête HTTP :

```
POST /submissions  →  202 immédiat  { id, status: "pending" }
                           ↓
           Worker Celery (process séparé, max 8 en parallèle)
                           ↓
GET /submissions/{id}  →  { status: "processing" | "approved" | "rejected" }
```

#### Pipeline de sécurité (9 gates)

1. **Intake** — validation du manifeste (bloquant)
2. **Static Analysis** — Semgrep + AST taint analysis
3. **Supply Chain** — dépendances, confusion de noms
4. **Secrets** — détection de secrets et entropie
5. **Sandbox** — exécution isolée avec limites mémoire/CPU
6. **Behavioral** — analyse comportementale
7. **Signing** — vérification Merkle root + signature
8. **Compliance** — licences copyleft, conformité
9. **Supply Health** — score OpenSSF

#### Scores du pipeline (`pipelines/models.py`)

| Seuil | Statut pipeline | Action marketplace |
|-------|-----------------|-------------------|
| `< 20` | `approved` | Publication auto si score ≤ 30 |
| `20 – 49` | `manual_review` | Revue admin requise |
| `≥ 80` | `rejected` | Plugin dépublié, développeur notifié |

Les seuils du pipeline (`SCORE_AUTO_APPROVE=20`, `SCORE_AUTO_REJECT=80`) et le seuil de publication marketplace (`SCORE_AUTO_PUBLISH=30` dans `PluginService`) sont indépendants.

---

## Routes API

### Auth (`/app/auth`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/register` | public | Inscription (assigne rôle `user` automatiquement) |
| POST | `/login` | public | Connexion → tokens JWT |
| POST | `/refresh` | public | Renouveler l'access token |
| POST | `/logout` | auth | Révoquer la session |
| GET | `/me` | auth | Profil utilisateur |
| GET/POST | `/rbac/roles` | `role:list/create` | Gestion des rôles |
| GET/POST | `/rbac/permissions` | `permission:list` | Gestion des permissions |
| GET/POST | `/tenants` | `tenant:list/create` | Gestion des tenants |
| POST | `/invites` | `invite:create` | Créer une invitation |
| GET | `/audit` | `audit:read` | Logs d'audit |

### Marketplace (`/app/marketplace`)

| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/plugins` | public | Liste les plugins publiés |
| GET | `/plugins/{slug}` | public | Détails d'un plugin |
| GET | `/plugins/{slug}/versions/{v}/download` | auth | Télécharger le ZIP d'une version |
| POST | `/plugins` | `submissions:write` | Créer un plugin |
| DELETE | `/plugins/{slug}` | `submissions:write` | Supprimer son plugin |
| GET | `/categories` | public | Liste les catégories |
| GET | `/categories/{slug}/plugins` | public | Plugins d'une catégorie |
| POST | `/categories` | `plugin:approve` | Créer une catégorie |
| POST | `/submissions` | `submissions:write` | Soumettre un ZIP (async) |
| GET | `/submissions` | auth | Ses soumissions |
| GET | `/submissions/{id}` | auth | Détail d'une soumission |
| GET | `/submissions/{id}/report` | auth | Rapport pipeline complet |
| GET | `/admin/plugins` | `plugin:approve` | Tous les plugins (avec filtres) |
| PATCH | `/admin/plugins/{slug}` | `plugin:approve` | Publier/modifier un plugin |
| DELETE | `/admin/plugins/{slug}` | `plugin:delete` | Supprimer un plugin |
| POST | `/admin/plugins/{slug}/versions/{v}/yank` | `plugin:approve` | Retirer une version |
| GET | `/admin/submissions` | `submission:review` | Toutes les soumissions |
| PATCH | `/admin/submissions/{id}/status` | `submission:review` | Forcer un statut |

---

## Installation & démarrage

### Prérequis

- Python 3.12+
- Redis (broker Celery + cache)
- uv

### Installation

```bash
git clone https://github.com/traoreera/xcore-market.git
cd xcore-market

# Installer les dépendances
uv sync

# Installer les packages locaux (pipelines, sandbox, app, extensions)
python3 -m pip install -e .
```

### Configuration

```bash
cp extensions/.env.example extensions/.env
# Éditer extensions/.env avec vos valeurs
```

Variables importantes :

```env
# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# SMTP
XAUTH_SMTP_HOST=smtp.example.com
XAUTH_SMTP_PORT=587
XAUTH_SMTP_USER=contact@example.com
XAUTH_SMTP_PASSWORD=...
XAUTH_SMTP_FROM=contact@example.com
XAUTH_SMTP_FROM_NAME=XCore Market
```

### Démarrage

```bash
# 1. Serveur principal
python3 main.py

# 2. Worker Celery (dans un terminal séparé)
celery -A extensions.worker.app worker \
    --loglevel=info \
    -Q submissions,default \
    -c 8
```

---

## Ce qu'il reste à améliorer

### Priorité haute

- [ ] **Tests** — aucun test unitaire ou d'intégration n'est écrit. C'est le chantier le plus important avant toute mise en production.
- [ ] **Migrations de base de données** — actuellement `create_all` recrée les tables. Il faut Alembic pour gérer les évolutions de schéma sans perte de données.
- [ ] **Stockage fichiers** — les ZIPs sont stockés localement dans `verified/`. En production, il faut S3, GCS ou un stockage objet similaire.
- [ ] **Rate limiting** — la config `rate_limit_default` est déclarée dans `integration.yaml` mais n'est pas appliquée sur les routes sensibles (soumissions, login).

### Priorité moyenne

- [ ] **Pagination de l'API admin** — les routes `/admin/plugins` et `/admin/submissions` retournent jusqu'à 50 résultats. Il faut exposer `total`, `pages` dans la réponse.
- [ ] **Recherche full-text** — `GET /plugins` ne supporte pas de recherche par nom, tag ou description.
- [ ] **Webhooks développeur** — notifier les développeurs via webhook (en plus email) quand leur soumission est traitée.
- [ ] **Dashboard de métriques** — exposer les métriques Prometheus (soumissions/jour, score moyen, taux de rejet) dans une route dédiée.
- [ ] **Renouvellement de l'email admin** — l'email admin est résolu par une requête SQL `LIKE '%admin%'` dans `tasks.py`. Il faut une config explicite ou un rôle système dédié.

### Priorité basse

- [ ] **CLI d'administration** — script pour créer des tenants, réinitialiser des mots de passe, resoumettre un plugin sans passer par l'API.
- [ ] **Support multi-fichiers** — un plugin ne peut soumettre qu'un seul ZIP. Permettre des archives avec assets (images, docs).
- [ ] **Versionnage sémantique strict** — valider que les versions respectent semver (`1.0.0`) et refuser les régressions de version.
- [ ] **Blacklist de développeurs** — système de suspension de compte avec blocage automatique des nouvelles soumissions.

---

## Documentation développeur

Voir **[CONTRIBUTING.md](./CONTRIBUTING.md)** pour :
- Comprendre l'architecture couche par couche
- Ajouter une route, une tâche Celery, une permission
- Les pièges connus (Pydantic V2, Celery forks, shadowing de packages)
- Toutes les commandes utiles

---

## Licence

Outil interne — XCore Marketplace Team. Distribution non autorisée.
