# xdeployments

Journal des statuts de déploiement rapportés par `xcore-agent` : un agent
installé sur un VPS d'opérateur signale le succès/échec de chaque
déploiement d'un plugin ou d'une extension — le marketplace n'a par
ailleurs aucune visibilité sur ce qui tourne réellement chez les
opérateurs.

## Fonctionnalités

- Enregistrement d'un rapport de déploiement (authentifié par clé API)
- Liste des déploiements rapportés
- Vue "fleet" : hôtes ayant déployé un plugin/service donné
- Purge périodique des vieilles entrées (action IPC `deployments.purge`)

## Dépendances

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## Utilisation (IPC)

```python
await self.call_plugin("xdeployments", "deployments.purge", {
    "keep_per_bucket": 50,
    "max_age_days": 90,
})
```

Détail complet des routes et de l'action IPC : [INTEGRATION.md](INTEGRATION.md).
