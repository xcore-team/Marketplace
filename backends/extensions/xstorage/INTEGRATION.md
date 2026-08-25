# Intégration — extxstorage

## 1. Déclarer l'extension dans `integration.yaml`

```yaml
services:
  extensions:
    storage:
      module: extensions.extxstorage.main:StorageService
      config:
        backend: local        # local | s3 | r2 | supabase
        max_size_mb: 10

        local:
          path: data/storage
          public_base_url: null
          url_secret: ${STORAGE_URL_SECRET}   # requis pour get_signed_url()

        # s3:
        #   bucket: mon-bucket
        #   region: eu-west-1
        #   access_key_id: ${S3_ACCESS_KEY_ID}
        #   secret_access_key: ${S3_SECRET_ACCESS_KEY}
        #   prefix: xstorage/
        #   endpoint_url: null
        #   public: false
        #   public_base_url: null

        # r2:   # Cloudflare R2 — même section que s3, endpoint_url dérivé
        #   bucket: mon-bucket
        #   account_id: ${R2_ACCOUNT_ID}   # → endpoint auto https://<id>.r2.cloudflarestorage.com
        #   access_key_id: ${R2_ACCESS_KEY_ID}
        #   secret_access_key: ${R2_SECRET_ACCESS_KEY}

        # supabase:
        #   url: ${SUPABASE_URL}
        #   key: ${SUPABASE_SERVICE_KEY}
        #   bucket: mon-bucket
        #   public: false
```

## 2. Récupérer le service depuis un plugin

```python
class MyPlugin(XCorePlugin):
    async def on_load(self):
        self.storage = self.get_service("ext.storage")
```

## 3. API

### `save(content, filename, namespace) -> UploadedFile`
```python
uploaded = await self.storage.save(pdf_bytes, "facture.pdf", namespace="xform/form-456")
# UploadedFile: file_id, original_name, stored_name, namespace, size_bytes, mime_type, key
```
Valide la taille (`max_size_mb`) et l'extension (listes blanche/noire
optionnelles côté config) avant stockage.

### `read(file_id, namespace, stored_name=None) -> bytes | None`
```python
content = await self.storage.read(uploaded.file_id, "xform/form-456", uploaded.stored_name)
```

### `delete(file_id, namespace, stored_name=None) -> bool`
### `exists(file_id, namespace, stored_name=None) -> bool`
### `delete_namespace(namespace) -> int`
Suppression en masse — retourne le nombre de fichiers supprimés.

### `get_public_url(file_id, namespace, stored_name=None) -> str | None`
URL permanente — `None` si le backend ne la supporte pas ou si le bucket
n'est pas public (`s3.public`/`supabase.public: false`).

### `get_signed_url(file_id, namespace, stored_name=None, expires_in=3600) -> str | None`
URL temporaire signée.

## 4. `namespace` — convention obligatoire

`namespace` est défini par l'appelant, pas par le service — doit être
scopé par plugin + entité propriétaire (ex. `"xstock/batch-123"`,
`"xform/form-456"`) pour que différents plugins/entités ne collisionnent
jamais sur le même backend.

## 5. ⚠️ Persister `stored_name`

`UploadedFile.stored_name` (retourné par `save()`) doit être persisté par
l'appelant (en base, associé au `file_id`) — il est requis par
`read()`/`delete()`/`exists()`/`get_public_url()`/`get_signed_url()`, la
clé backend ne peut pas être reconstruite à partir du seul `file_id`.

## 6. Dépendances optionnelles par backend

| Backend | Dépendance | Import |
|---|---|---|
| `local` | aucune | — |
| `s3` / `r2` | `aioboto3` | paresseux, dans `backends.py::S3Backend` |
| `supabase` | `supabase` (SDK v2, `acreate_client`) | paresseux, dans `backends.py::SupabaseBackend` |

Seul le backend réellement configuré (`config.backend`) a besoin de sa
dépendance installée.

## 7. Health check

```python
ok, msg = await self.storage.health_check()
# → (True, "backend=local")
```
