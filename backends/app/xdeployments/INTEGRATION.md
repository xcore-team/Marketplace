# Intégration — xdeployments

## 1. Rôle

Journal des statuts de déploiement rapportés par `xcore-agent` : un agent
installé sur un VPS d'opérateur signale le succès/échec de chaque
déploiement d'un plugin ou d'une extension — le marketplace n'a par
ailleurs aucune visibilité sur ce qui tourne réellement chez les
opérateurs. Chaque appel crée une nouvelle ligne (journal, pas un upsert).

## 2. Dépendances (`plugin.yaml` → `requires`)

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## 3. Routes exposées (préfixe `/xdeployments`)

| Méthode | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/deployments/report` | `X-API-Key` (xdevkey) | Appelé par `xcore-agent` en fin de déploiement — voir `MarketplaceDeploymentRunner` |
| GET | `/deployments` | — | Liste des déploiements rapportés |
| GET | `/deployments/{kind}/{slug}/hosts` | — | Hôtes ayant déployé un plugin/service donné (vue "fleet") |

L'authentification `/deployments/report` passe par l'IPC `xdevkeys`
(`devkeys.authenticate`), pas par un import direct du plugin `auth` — un
agent tournant sur un VPS n'a pas de session JWT.

## 4. Actions IPC

```python
await self.call_plugin("xdeployments", "deployments.purge", {
    "keep_per_bucket": 50,
    "max_age_days": 90,
})
```

Purge les vieilles lignes de déploiement, en conservant au plus
`keep_per_bucket` entrées par (plugin/service, hôte) et rien de plus vieux
que `max_age_days`.
