# extxstorage

Extension XCore de stockage de fichiers (blob I/O) — backends **local**,
**S3**, **Cloudflare R2** ou **Supabase Storage** interchangeables sans
changer le code appelant. Extraite du code de stockage interne de `xform`
pour être partagée par n'importe quel plugin (`xform`, `xstock`, `xassets`,
`xfleet`...) sans réimplémenter la logique d'upload/validation.

## Fonctionnalités

- `save()` / `read()` / `delete()` / `exists()` — API blob uniforme quel
  que soit le backend
- `delete_namespace()` — suppression en masse par namespace
- `get_public_url()` / `get_signed_url()` — génération d'URL (permanente ou
  temporaire signée), selon ce que le backend supporte
- Validation à l'upload : taille max, listes blanche/noire d'extensions
- Isolation par `namespace` (défini par l'appelant, ex. `"xstock/batch-123"`)
  — différents plugins/entités ne collisionnent jamais sur le même backend
- **Ce service ne fait que du blob I/O** — la persistance des métadonnées
  (quel fichier appartient à quelle ligne DB) reste la responsabilité du
  plugin appelant

## Configuration

```yaml
services:
  extensions:
    storage:
      module: extensions.extxstorage.main:StorageService
      config:
        backend: local        # local | s3 | r2 | supabase
        max_size_mb: 10
        local:
          path: data/storage        # relatif au data_dir du kernel
          public_base_url: null     # ex. https://files.example.com (optionnel)
          url_secret: ${STORAGE_URL_SECRET}   # requis pour get_signed_url()
```

Backends alternatifs (`s3`/`r2`/`supabase`) : voir [INTEGRATION.md](INTEGRATION.md).

## Utilisation depuis un plugin

```python
storage = self.get_service("ext.storage")

uploaded = await storage.save(content, "photo.jpg", namespace="xstock/batch-123")
content  = await storage.read(uploaded.file_id, "xstock/batch-123", uploaded.stored_name)
url      = await storage.get_signed_url(uploaded.file_id, "xstock/batch-123", uploaded.stored_name)
await storage.delete(uploaded.file_id, "xstock/batch-123", uploaded.stored_name)
```

⚠️ Toujours persister `UploadedFile.stored_name` retourné par `save()` — il
est requis par `read()`/`delete()`/`exists()`/`get_public_url()`/
`get_signed_url()` (la clé backend ne peut pas être reconstruite à partir
du seul `file_id`).

## Structure

```
extxstorage/
├── service.yaml     # Manifeste de l'extension
├── main.py           # StorageService (BaseService) — point d'entrée
├── backends.py         # LocalBackend, S3Backend, SupabaseBackend, build_backend()
└── uploader.py          # FileUploader — validation + orchestration
```

## Dépendances optionnelles

`aioboto3` (backends `s3`/`r2`) et `supabase` (backend `supabase`) sont
importés paresseusement dans `backends.py` — seul le backend `local`
(aucune dépendance externe) est requis par défaut.
