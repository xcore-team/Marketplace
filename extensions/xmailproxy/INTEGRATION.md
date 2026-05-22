# Intégration — xmailproxy

## Prérequis

`ext.email` (xmailler) doit être déclaré **avant** `mail_proxy` dans `integration.yaml`.

## 1. Déclarer l'extension dans `integration.yaml`

```yaml
services:
  extensions:
    email:
      module: extensions.xmailler.main:EmailService
      config:
        # ... config xmailler ...

    mail_proxy:
      module: extensions.xmailproxy.main:MailProxyService
      config:
        redis_url: ${REDIS_URL}
        admin_emails:
          - admin@xcorehub.dev
```

## 2. Connecter les services depuis le plugin marketplace

Dans `on_load()` du plugin `marketplace` :

```python
class MarketplacePlugin(XCorePlugin):
    async def on_load(self):
        proxy = self.get_service("ext.mail_proxy")
        proxy.wire(self.get_service("ext.email"))
```

Sans ce wiring, le proxy tourne mais ignore tous les events (log warning).

## 3. Publier un event depuis le worker Celery

Le worker n'a pas accès à `get_service`. Il utilise directement `redis.publish` :

```python
import json
import redis as _redis

r = _redis.from_url(settings.REDIS_URL)

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

## 4. Actions disponibles

| `action` | Email dev | Email admins | Champs requis |
|---|---|---|---|
| `submission_received` | ✅ | ✗ | `to`, `developer_name`, `plugin_name`, `plugin_version`, `submission_id` |
| `pipeline_approved` | ✅ | ✅ | + `anomaly_score` |
| `pipeline_rejected` | ✅ | ✅ | + `anomaly_score`, `rejection_reason` |
| `pipeline_manual_review` | ✅ | ✅ | + `anomaly_score` |
| `pipeline_failed` | ✅ | ✗ | — |
| `admin_new_submission` | ✗ | ✅ | `developer_email`, `source` |

## 5. Health check

```python
ok, msg = await self.get_service("ext.mail_proxy").health_check()
# → (True, "Redis OK — email_ext connecté")
```

## 6. Vérifier le statut

```python
status = self.get_service("ext.mail_proxy").status()
# {
#   "channel": "marketplace.email",
#   "redis_url": "redis://localhost:6379",
#   "admin_emails": ["admin@xcorehub.dev"],
#   "email_ext_wired": true,
#   "listener_running": true
# }
```
