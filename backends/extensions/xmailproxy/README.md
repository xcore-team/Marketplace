# xmailproxy v2

Proxy email universel XCore — écoute Redis + bus xcore → `ext.email`.

```
Redis "marketplace.email" ──▶
Redis "xform.email"        ──▶  MailProxyService  ──▶  ext.email (SMTP)
Bus xcore "xform.send_email" ──▶
```

## Configuration

```yaml
extensions:
  mail_proxy:
    module: extensions.xcoreMailproxy.main:MailProxyService
    config:
      redis_url: ${REDIS_URL}
      channels:
        - marketplace.email
        - xform.email
      bus_events:
        - xform.send_email
      admin_emails:
        - admin@xcorehub.dev
```

## Wiring depuis un plugin

```python
async def on_load(self):
    proxy = self.get_service("ext.mail_proxy")
    proxy.wire(self.get_service("ext.email"))

    # Optionnel — utiliser ext.pubsub au lieu de Redis direct
    proxy.wire_pubsub(self.get_service("ext.pubsub"))

    # Brancher les events du bus xcore (pour les events listés dans bus_events)
    async def _on_email_event(event):
        data = getattr(event, "data", event) if not isinstance(event, dict) else event
        await proxy.handle_bus_event(getattr(event, "name", ""), data)

    for ev in ["xform.send_email"]:
        self.ctx.events.on(ev, _on_email_event)
```

### Priorité des sources

| Source | Activé quand |
|---|---|
| `ext.pubsub` (Redis/HiveMQ/Memory) | `wire_pubsub()` appelé avant `init()` |
| Redis direct | fallback si `wire_pubsub()` non appelé |
| Bus xcore | toujours, si `bus_events` configuré |

## Format des messages

### Envoi direct
```json
{
  "to": "alice@example.com",
  "subject": "Votre candidature",
  "html": "<p>Merci !</p>"
}
```

### Via template
```json
{
  "to": "alice@example.com",
  "template": "welcome",
  "context": { "username": "Alice" },
  "subject": "Bienvenue"
}
```

### Actions marketplace (rétrocompatibilité)
```json
{
  "action": "pipeline_approved",
  "to": "dev@example.com",
  "developer_name": "Alice",
  "plugin_name": "my-plugin",
  "plugin_version": "1.0.0",
  "submission_id": "uuid",
  "anomaly_score": 12
}
```

| Action | Dev | Admin |
|---|---|---|
| `submission_received` | ✅ | — |
| `pipeline_approved` | ✅ | ✅ |
| `pipeline_rejected` | ✅ | ✅ |
| `pipeline_manual_review` | ✅ | ✅ |
| `pipeline_failed` | ✅ | — |
| `admin_new_submission` | — | ✅ |

## Publier depuis le worker Celery

```python
import json, redis
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

## Publier depuis xform (bus xcore)

xform émet `xform.send_email` automatiquement sur le bus — aucun code supplémentaire nécessaire côté xform, il suffit que `xform.send_email` soit dans `bus_events`.
