# xadmin

Panneau d'administration pour XCore Marketplace : revue des plugins et
soumissions, gestion des utilisateurs, catégories, déploiements, audit.

## Fonctionnalités

- Liste/détail des plugins, contributeurs GitHub
- Revue des soumissions en attente (approbation/rejet)
- Gestion des utilisateurs (bannissement, rôles)
- CRUD catégories
- Logs d'audit et statistiques globales
- Vue admin des déploiements (voir le plugin `xdeployments`)

## Dépendances

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0, <1.3.0` |
| `xdeployments` | `>=1.0.0` |

## Configuration

`execution_mode: trusted` — voir `plugin.yaml`. Nécessite un compte GitHub
lié (via `auth`) pour la liste des contributeurs.

Détail complet des routes et permissions : [INTEGRATION.md](INTEGRATION.md).
