# xdeploy

Hub `.xdeploy` réel : implémente le contrat de déploiement d'artefacts
consommé par `xcore-agent build/publish/deploy` (`HttpHubClient`) — auth par
`xdevkey`, stockage/service d'artefacts `.xdeploy` scellés, custody de la KEK
pour déverrouiller le DEK de chaque artefact, journal de déploiement.

Distinct du flux marketplace classique (soumission plugin/service) : c'est
le pipeline de *déploiement* d'artefacts déjà construits.

## Fonctionnalités

- Authentification par `xdevkey` → session courte
- Publication d'artefacts `.xdeploy` scellés (DEK + signature Ed25519)
- Résolution de la dernière version publiée par projet
- Téléchargement de l'artefact chiffré
- Custody KEK : déverrouille le DEK au moment du déploiement
  (`POST /v1/deployments/authorize`)
- Journal de déploiement (`POST /v1/deployments/report`)

## Dépendances

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## Configuration — secrets

```dotenv
XDEPLOY_KEK=<clé d'enveloppement des DEK d'artefacts>
XDEPLOY_SESSION_SECRET=<clé HMAC des jetons de session>
```

Voir [INTEGRATION.md](INTEGRATION.md) pour le détail des routes et le
protocole complet.
