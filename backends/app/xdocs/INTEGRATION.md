# Intégration — xdocs

## 1. Rôle

Extrait et sert la documentation (`README.md`, `INTEGRATION.md`/`integration.yaml`,
`contributor.yaml`) des ZIP de plugins/services validés par le pipeline —
voir `DOC_FILE_CANDIDATES` côté `app/marketplace/src/services/github.py`
pour la liste des noms de fichiers reconnus par slot (`readme`,
`integration`, `contributor`).

## 2. Dépendances (`plugin.yaml` → `requires`)

| Plugin requis | Version |
|---|---|
| `marketplace` | `1.0.0` |

## 3. Routes exposées (préfixe `/xdocs/plugins`)

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/{slug}/docs` | Documentation de la dernière version validée d'un plugin |
| GET | `/{slug}/versions/{version}/docs` | Documentation d'une version précise |

## 4. `DocExtractorService`

`services/extractor.py` — appelé par le pipeline (gate signing/compliance)
après validation d'une soumission pour extraire et persister les 3 fichiers
de documentation (`save_docs`), puis relus par les routes ci-dessus
(`get` / `get_latest`). Le champ `contributor` est parsé structurellement
(`_parse_contributor`) — voir le format `contributor.yaml` attendu dans ce
même fichier.
