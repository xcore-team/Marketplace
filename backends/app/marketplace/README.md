# xmarketplace

Plugin cœur de la plateforme XCore Marketplace : CRUD plugins, soumissions,
notation, catégories, webhooks, liaison GitHub des développeurs, et
déclenchement asynchrone du pipeline de validation (11 gates) via Celery.

> Nommé `xmarketplace` sur GitHub pour ne pas entrer en collision avec le
> repo de la plateforme entière ([xcore-team/Marketplace](https://github.com/xcore-team/Marketplace))
> — `plugin.yaml` déclare `name: marketplace` en interne.

## ⚠️ Pré-requis hôte

Ce plugin importe `sandbox.SandboxLimits` et
`middleware.submission_limit` depuis la **racine** du projet hôte — non
inclus dans ce repo. Voir [INTEGRATION.md](INTEGRATION.md) §2.

## Fonctionnalités

- CRUD plugins, versions, installation
- Soumission de ZIP, suivi du pipeline (rate-limité)
- Liaison compte GitHub développeur, soumission depuis un tag
- CRUD catégories, webhooks développeur
- Templates email intégrés (notifications de pipeline, invitations)

## Dépendances

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## Configuration — secret

```dotenv
MARKET_SECRET_KEY=<clé secrète de l'application>
```

Détail complet des routes, permissions et pré-requis hôte : [INTEGRATION.md](INTEGRATION.md).
