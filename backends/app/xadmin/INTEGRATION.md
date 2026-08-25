# Intégration — xadmin

## 1. Déclarer le plugin dans `integration.yaml`

```yaml
plugins:
  directory: ./app   # ou plugins/ selon votre convention
```

`xadmin` (`execution_mode: trusted`) déclare deux dépendances vérifiées au
chargement — voir `plugin.yaml` → `requires` :

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0, <1.3.0` |
| `xdeployments` | `>=1.0.0` |

## 2. Permissions

```yaml
permissions:
  - resource: network
    description: "Requêtes GitHub API (contributeurs) via httpx"
```

## 3. Routes exposées (préfixe `/xadmin`)

| Sous-préfixe | Fichier | Domaine |
|---|---|---|
| `/plugins` | `routes/plugins.py` | Liste/détail plugins, contributeurs GitHub (appel réseau) |
| `/submissions` | `routes/submissions.py` | Revue des soumissions en attente |
| `/deployments` | `routes/deployments.py` | Vue admin des déploiements (voir `xdeployments`) |
| `/users` | `routes/users.py` | Gestion utilisateurs, bannissement, rôles |
| `/categories` | `routes/categories.py` | CRUD catégories |
| `/audit` | `routes/audit.py` | Logs d'audit |
| `/system` | `routes/system.py` | Statut système |
| (racine) | `routes/stats.py` | Statistiques globales |

Toutes les routes sont protégées par permission — voir chaque routeur pour
le détail des scopes exigés (`Depends(require_permission(...))`).

## 4. Variables d'environnement

Aucun secret propre à `xadmin` — dépend uniquement des tokens GitHub liés
via le plugin `auth` (voir `market_github_tokens`).
