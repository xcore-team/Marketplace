# xservices

Marketplace des **extensions de service** XCore (`BaseService`, distinctes
des plugins) : soumission, pipeline de validation dédié (Gate 1/5 :
`gate_1_service`/`gate_5_service`), publication, notation, installation.

## Fonctionnalités

- Catalogue public des services (liste, détail, catégories, notation)
- Soumission manuelle (upload direct) ou depuis un tag Git déjà poussé
- Soumission CI (`X-API-Key`) — voir `GET /github/repos/{owner}/{repo}/ci-workflow`
  pour générer le workflow GitHub Actions à committer dans le repo du service
- Suivi de soumission + rapport détaillé des 11 gates
- Administration : approbation/rejet, dépublication, yank de version

## Dépendances

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## Configuration — secret

```dotenv
DEVKEYS_MASTER_KEY=<même valeur que côté xdevkeys>
```

Détail complet des routes et du flux CI : [INTEGRATION.md](INTEGRATION.md).
