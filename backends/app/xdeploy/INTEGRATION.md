# Intégration — xdeploy

## 1. Rôle

Implémente le contrat "XCore Hub" réel documenté côté client dans
`xcore-agent/agent/hub_client.py` (`HttpHubClient`) : auth par `xdevkey`,
stockage/service d'artefacts `.xdeploy` scellés, custody de la KEK pour
déverrouiller le DEK de chaque artefact, journal de déploiement. **Distinct**
du flux marketplace classique (soumission plugin/service) — c'est le
pipeline de *déploiement* d'artefacts déjà construits, consommé par
`xcore-agent build/publish/deploy`.

## 2. Dépendances (`plugin.yaml` → `requires`)

| Plugin requis | Version |
|---|---|
| `auth` | `>=1.0.0` |
| `xdevkeys` | `>=1.0.0` |

## 3. Routes exposées (préfixe `/xdeploy`)

### `/v1` (protocole Hub — `routes/hub.py`)

| Méthode | Endpoint | Description |
|---|---|---|
| POST | `/v1/auth` | Authentification par `xdevkey` → session |
| POST | `/v1/projects/{project_id}/publish` | Publication d'un artefact `.xdeploy` scellé (multipart : DEK, signature, clé publique, fichier) |
| GET | `/v1/projects/{project_id}/versions/latest` | Dernière version publiée |
| GET | `/v1/artifacts/{artifact_id}/download` | Téléchargement de l'artefact chiffré |
| POST | `/v1/deployments/authorize` | Déverrouille le DEK (custody KEK) pour un déploiement |
| POST | `/v1/deployments/report` | Rapport de déploiement (succès/échec) — voir `xdeployments` |

### `/projects` (dev — `routes/dev.py`)

Gestion des projets côté opérateur/développeur (hors flux xcore-agent).

## 4. Variables d'environnement — ⚠️ secrets

```dotenv
XDEPLOY_KEK=<clé d'enveloppement AES-256-GCM des DEK d'artefacts>
XDEPLOY_SESSION_SECRET=<clé HMAC des jetons de session courts>
```

Ces valeurs sont **injectées par `docker-entrypoint.sh` au démarrage**
depuis `.env.template` (voir ce fichier) — `envconfiguration.inject: true`
dans `plugin.yaml` exige que `.env` existe physiquement au runtime.
**Ne jamais committer `.env`** (seul `.env.template`, qui ne contient que
des placeholders `${VAR}`, doit être versionné).
