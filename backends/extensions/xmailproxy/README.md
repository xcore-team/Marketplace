# xmailproxy

Extension XCore proxy Redis → email pour le marketplace.

## Pourquoi ce proxy ?

Le worker Celery tourne dans un processus séparé et n'a pas accès aux services XCore (`get_service`). Pour envoyer des emails depuis le pipeline, le worker publie un event JSON sur le channel Redis `marketplace.email`. Cette extension, qui tourne dans le processus API, souscrit à ce channel et dispatche vers `ext.email` (xmailler).

```
Worker Celery ──publish──▶ Redis "marketplace.email" ──▶ MailProxyService ──▶ ext.email
```

## Configuration

Requiert `ext.email` (xmailler) configuré en amont.

```yaml
services:
  extensions:
    mail_proxy:
      module: extensions.xmailproxy.main:MailProxyService
      config:
        redis_url: ${REDIS_URL}
        admin_emails:
          - admin@xcorehub.dev
```

### Wiring depuis le plugin marketplace

Dans `on_load()` du plugin marketplace, connecter les deux services :

```python
proxy = self.get_service("ext.mail_proxy")
proxy.wire(self.get_service("ext.email"))
```

## Actions supportées

| Action Redis | Destinataire | Description |
|---|---|---|
| `submission_received` | Développeur | Accusé de réception de la soumission |
| `pipeline_approved` | Développeur + Admin | Plugin validé et publié |
| `pipeline_rejected` | Développeur + Admin | Plugin rejeté avec motif |
| `pipeline_manual_review` | Développeur + Admin | Revue manuelle requise |
| `pipeline_failed` | Développeur | Erreur interne du pipeline |
| `admin_new_submission` | Admin uniquement | Nouvelle soumission arrivée |

## Format du message Redis

```json
{
  "action": "pipeline_approved",
  "to": "dev@example.com",
  "developer_name": "Alice",
  "plugin_name": "my-plugin",
  "plugin_version": "1.0.0",
  "submission_id": "uuid",
  "anomaly_score": 12,
  "rejection_reason": "..."
}
```

## Publier depuis le worker Celery

```python
import json
import redis

r = redis.from_url(REDIS_URL)
r.publish("marketplace.email", json.dumps({
    "action": "pipeline_approved",
    "to": developer_email,
    "developer_name": developer_name,
    "plugin_name": plugin_name,
    "plugin_version": plugin_version,
    "submission_id": str(submission_id),
    "anomaly_score": result.anomaly_score,
}))
```

## Structure

```
xmailproxy/
├── main.py       # MailProxyService (BaseService) — listener Redis + dispatch
└── service.yaml  # Manifeste de l'extension
```
