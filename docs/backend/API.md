# XCore Marketplace — Documentation API Backend

> Version 1.0.0 · FastAPI + XCore Framework · JWT RS256

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Authentification](#2-authentification)
3. [Permissions & RBAC](#3-permissions--rbac)
4. [API Marketplace](#4-api-marketplace)
   - [Catégories](#41-catégories)
   - [Plugins](#42-plugins)
   - [Soumissions (upload)](#43-soumissions-upload)
   - [GitHub (publish depuis repo)](#44-github)
   - [Webhooks](#45-webhooks)
5. [API Administration (xadmin)](#5-api-administration-xadmin)
   - [Statistiques & Diffusion](#51-statistiques--diffusion)
   - [Utilisateurs](#52-utilisateurs)
   - [Plugins (admin)](#53-plugins-admin)
   - [Soumissions (admin)](#54-soumissions-admin)
   - [Catégories (admin)](#55-catégories-admin)
   - [Système & Audit](#56-système--audit)
6. [Authentification (auth)](#6-authentification-xauth)
   - [Compte, onboarding & tokens](#61-compte-onboarding--tokens)
   - [MFA (TOTP)](#62-mfa-totp)
   - [OAuth](#63-oauth)
   - [Mots de passe](#64-mots-de-passe)
   - [RBAC (gestion des rôles)](#65-rbac-gestion-des-rôles)
   - [Tenants](#66-tenants)
   - [Invitations](#67-invitations)
7. [Temps réel — SSE (xpulse)](#7-temps-réel--sse-xpulse)
8. [Documentation des plugins (xdocs)](#8-documentation-des-plugins-xdocs)
9. [Pipeline de validation](#9-pipeline-de-validation)
10. [Tâches Celery](#10-tâches-celery)
11. [Schémas de données complets](#11-schémas-de-données-complets)
12. [Codes d'erreur](#12-codes-derreur)
13. [Configuration](#13-configuration)
14. [Clés développeur & déploiement (xdevkeys)](#14-clés-développeur--déploiement-xdevkeys)
15. [Hub .xdeploy (xdeploy)](#15-hub-xdeploy-xdeploy)
16. [Extensions de service (xservices)](#16-extensions-de-service-xservices)
17. [Statut de déploiement (xdeployments)](#17-statut-de-déploiement-xdeployments)

---

## 1. Architecture générale

```
Client HTTP / Frontend
        │
        ▼
   FastAPI (main.py)
        │
        ├── /app/auth/*         → auth        (JWT, OAuth, MFA, tenants, invitations, RBAC — voir §6)
        ├── /app/marketplace/*  → marketplace (plugins, soumissions, catégories, webhooks, GitHub — voir §4)
        ├── /app/xdevkeys/*     → xdevkeys    (clés API, projets de déploiement, clé de signature — voir §14)
        ├── /app/xdeploy/*      → xdeploy     (Hub .xdeploy — bundles multi-plugins scellés — voir §15)
        ├── /app/xdeployments/* → xdeployments (journal de flotte — quoi tourne où — voir §17)
        ├── /app/xadmin/*       → xadmin      (admin panel — utilisateurs, stats, audit — voir §5)
        ├── /app/xdocs/*        → xdocs       (extraction de docs depuis ZIPs/repos approuvés — voir §8)
        ├── /app/xpulse/*       → XPulses     (SSE — notifications temps réel — voir §7)
        ├── /app/xservices/*    → xservices   (marketplace des extensions/services — voir §16)
        └── /ws/{channel}       → WebSocket   (xwebsocket)

        │
Celery Worker (process séparé, queues: default / submissions / result)
        │
        ├── marketplace.process_submission → SandboxedPipeline → PipelineOrchestrator (11 gates)
        └── xservices.process_submission   → SandboxedPipeline → ServicePipelineOrchestrator (gates partagés)
                                                └── Email (xmailler via SMTP, relayé par xmailproxy)
                                                └── SSE push (Redis PUBLISH → xpulse)
                                                └── Webhooks (HMAC-SHA256)
```

Neuf plugins chargent au boot (`xcore.runtime.loader — plugins load summary
loaded=9 failed=0`) — voir [architecture.md](architecture.md) pour le détail
plugin/extension complet, les deux circuits de déploiement, et le
fonctionnement interne du pipeline.

**Middlewares** (ordre déclaré dans `integration.yaml`) :
- `security_headers` — headers de sécurité HTTP
- `upload_size` — limite les uploads à 10 MB
- `timing` — en-tête de latence de requête
- `cache_header` — en-têtes de cache par route
- `rate_limit` — 200 req/min par défaut

CORS est configuré séparément (`cors:` dans `integration.yaml`) — liste
d'origines fixe (`xcorehub.dev`, `app.xcorehub.dev`, `marketplace.xcorehub.dev`
en prod), pas de variable d'environnement.

**Base URL** : `http://localhost:8000` en développement

---

## 2. Authentification

Toutes les routes protégées requièrent un **Bearer JWT** dans le header :

```
Authorization: Bearer <access_token>
```

### Obtenir un token

```http
POST /app/auth/login
Content-Type: application/json

{
  "email": "user@exemple.com",
  "password": "motdepasse",
  "tenant_id": null
}
```

**Réponse** :
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "mfa_required": false,
  "mfa_token": null
}
```

Si `mfa_required: true`, utiliser le flux MFA (voir §6.2) — le vrai token n'est pas encore émis.

### Rafraîchir un token

```http
POST /app/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ..."
}
```

**Réponse** : même structure que login (nouvel `access_token` + `refresh_token`).

---

## 3. Permissions & RBAC

Le payload JWT décodé contient :

```json
{
  "sub": "uuid-utilisateur",
  "roles": ["developer"],
  "permissions": ["plugins:write", "submissions:write"],
  "user": {
    "tenant_id": "uuid-tenant",
    "email": "user@exemple.com"
  }
}
```

### Tableau des permissions

| Permission | Description |
|-----------|-------------|
| `plugins:write` | Créer / supprimer ses propres plugins |
| `submissions:write` | Soumettre un plugin (upload ou GitHub) |
| `plugin:approve` | Approuver plugins, gérer catégories, voir toutes les soumissions |
| `plugin:delete` | Supprimer n'importe quel plugin |
| `submission:review` | Changer le statut d'une soumission (admin) |
| `user:list` | Lister tous les utilisateurs |
| `user:read` | Voir les détails d'un utilisateur |
| `user:ban` | Bannir / débannir un utilisateur |
| `user:delete` | Supprimer un utilisateur |
| `permission:assign` | Assigner des rôles aux utilisateurs |
| `rbac:read` | Lire les rôles et permissions |
| `rbac:write` | Créer / modifier les rôles |
| `xpulse:publish` | Publier des messages ciblés SSE |
| `xpulse:broadcast` | Diffuser à tous les abonnés SSE |
| `admin:*` | Accès total au panel admin |

**Rôles par défaut** (créés au démarrage par `run_seed()`) :
- `admin` — toutes les permissions
- `developer` — `plugins:write`, `submissions:write`

---

## 4. API Marketplace

Préfixe : `/app/marketplace`

---

### 4.1 Catégories

#### `GET /categories`

Liste toutes les catégories avec le nombre de plugins publiés.

**Auth** : Publique

**Réponse** `200 OK` :
```json
[
  {
    "id": "uuid",
    "name": "Workflow",
    "slug": "workflow",
    "description": "Plugins d'automatisation",
    "plugin_count": 12
  }
]
```

---

#### `GET /categories/{slug}/plugins`

Liste les plugins publiés d'une catégorie.

**Auth** : Publique

**Query params** :
| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `limit` | int | 50 | Nombre de résultats |
| `offset` | int | 0 | Décalage pagination |

**Réponse** `200 OK` : liste de `PluginOut`

**Erreur** `404` : catégorie introuvable

---

#### `POST /categories`

Crée une nouvelle catégorie.

**Auth** : `plugin:approve`

**Corps** :
```json
{
  "name": "Intelligence Artificielle",
  "description": "Plugins IA et ML"
}
```

> Le slug est généré automatiquement depuis le nom (slugify).

**Réponse** `201 Created` : `CategoryOut`

**Erreur** `409` : nom ou slug déjà existant

---

#### `DELETE /categories/{slug}`

Supprime une catégorie.

**Auth** : `plugin:approve`

**Réponse** `204 No Content`

**Erreur** `404` : catégorie introuvable

---

### 4.2 Plugins

#### `GET /plugins`

Liste les plugins publiés avec recherche et filtres. Les plugins privés
(`visibility: "private"`) n'apparaissent que pour leur propriétaire ou un
membre de l'organisation propriétaire (`organization_id`) — envoyer le Bearer
JWT habituel pour en bénéficier ; sans lui, seuls les plugins publics sortent.

**Auth** : Publique (optionnellement authentifiée pour élargir la visibilité)

**Query params** :
| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `search` | string | — | Recherche dans le nom et la description |
| `category_id` | UUID | — | Filtre par catégorie |
| `sort` | string | `recent` | `recent`, `popular`, `rating` |
| `limit` | int | 20 | Nombre de résultats (max 100) |
| `offset` | int | 0 | Décalage pagination |

**Réponse** `200 OK` :
```json
{
  "items": [ /* PluginOut[] */ ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

---

#### `GET /plugins/check-name`

Vérifie si un nom de plugin est disponible.

**Auth** : Publique

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `name` | string | Nom à vérifier |

**Réponse** `200 OK` :
```json
{
  "available": true,
  "slug": "mon-plugin"
}
```

---

#### `GET /plugins/{slug}`

Récupère les détails d'un plugin (incrémente `download_count`).

**Auth** : Publique (optionnellement authentifiée pour un plugin privé accessible)

**Réponse** `200 OK` : `PluginOut` complet avec `versions[]` et `categories[]`

**Erreur** `404` : plugin introuvable, ou privé et non accessible au demandeur
(les deux cas renvoient volontairement la même erreur, pour ne pas révéler
l'existence d'un plugin privé)

---

#### `GET /plugins/me/plugins`

Liste les plugins de l'utilisateur authentifié.

**Auth** : Authentifié

**Réponse** `200 OK` : `PluginOut[]`

---

#### `POST /plugins`

Crée un plugin manuellement (sans soumission).

**Auth** : `plugins:write`

**Corps** :
```json
{
  "name": "MonPlugin",
  "description": "Description du plugin",
  "homepage": "https://exemple.com",
  "repository": "https://github.com/user/repo",
  "category_ids": ["uuid-cat1", "uuid-cat2"],
  "visibility": "public",
  "organization_id": null
}
```

`visibility` : `"public"` (défaut) ou `"private"`. Si `organization_id` est
fourni, l'appelant doit être membre de cette organisation (voir §14), sinon `403`.
Un plugin privé n'est visible/listable/installable que par son propriétaire ou
un membre de l'organisation propriétaire.

**Réponse** `201 Created` : `PluginOut` · **Erreur** `409` : slug déjà pris

---

#### `PATCH /plugins/{slug}`

Met à jour les métadonnées d'un plugin (propriétaire uniquement).

**Auth** : Authentifié (propriétaire)

**Corps** (tous optionnels) :
```json
{
  "description": "Nouvelle description",
  "homepage": "https://nouvelle-url.com",
  "repository": "https://github.com/user/nouveau-repo",
  "visibility": "private"
}
```

**Réponse** `200 OK` : `PluginOut`

---

#### `DELETE /plugins/{slug}`

Supprime un plugin (propriétaire uniquement).

**Auth** : `plugins:write` (propriétaire)

**Réponse** `204 No Content`

---

#### `POST /plugins/{slug}/ratings`

Note un plugin (1 à 5 étoiles).

**Auth** : Authentifié

> Un utilisateur ne peut avoir qu'une seule note par plugin — une seconde soumission met à jour la note existante.

**Corps** :
```json
{
  "score": 5,
  "comment": "Excellent plugin, très utile !"
}
```

**Réponse** `200 OK` : `RatingOut`

---

#### `GET /plugins/{slug}/ratings`

Liste les notes d'un plugin.

**Auth** : Publique

**Query params** :
| Param | Type | Défaut |
|-------|------|--------|
| `limit` | int | 20 |
| `offset` | int | 0 |

**Réponse** `200 OK` :
```json
{
  "items": [ /* RatingOut[] */ ],
  "total": 8,
  "limit": 20,
  "offset": 0,
  "has_more": false
}
```

---

#### `GET /plugins/{slug}/ratings/me`

Récupère la note de l'utilisateur connecté pour ce plugin.

**Auth** : Authentifié

**Réponse** `200 OK` : `RatingOut`

**Erreur** `404` : l'utilisateur n'a pas encore noté ce plugin (comportement normal)

---

#### `GET /plugins/{slug}/submissions`

Liste les soumissions/rapports de validation du plugin.

**Auth** : Publique

**Réponse** `200 OK` : `SubmissionOut[]` (triées par date décroissante)

---

### 4.3 Soumissions (upload)

#### `POST /submissions`

Soumet un plugin via fichier ZIP. Déclenche le pipeline de validation asynchrone.

**Auth** : `submissions:write`

**Rate limit** : 10 soumissions/heure par utilisateur

**Corps** : `multipart/form-data`
| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `file` | File (ZIP) | Oui | Archive du plugin |
| `plugin_name` | string | Oui | Nom du plugin |
| `plugin_version` | string | Oui | Version (ex: `1.2.0`) |
| `category_ids` | JSON array | Non | UUIDs des catégories |

**Réponse** `202 Accepted` : `SubmissionOut` avec `status: "pending"`

> Le traitement est asynchrone. Suivre le statut via `GET /submissions/{id}` ou les notifications SSE.

---

#### `GET /submissions`

Liste les soumissions de l'utilisateur connecté.

**Auth** : Authentifié

**Réponse** `200 OK` : `SubmissionOut[]` (50 dernières)

---

#### `GET /submissions/{submission_id}`

Récupère les détails d'une soumission (propriétaire uniquement).

**Auth** : Authentifié (propriétaire)

**Réponse** `200 OK` : `SubmissionOut`

**Erreur** `404` / `403` : introuvable ou accès interdit

---

#### `GET /submissions/{submission_id}/report`

Récupère le rapport JSON complet de la validation pipeline.

**Auth** : Authentifié (propriétaire)

**Réponse** `200 OK` : `SubmissionReport` complet avec tous les gates et findings

---

### 4.4 GitHub

#### `POST /github/link`

Lie un compte GitHub à l'utilisateur connecté.

**Auth** : Authentifié

**Corps** :
```json
{
  "access_token": "ghp_xxxxxxxxxxxx"
}
```

**Réponse** `200 OK` :
```json
{
  "github_login": "username",
  "linked": true
}
```

---

#### `GET /github/link`

Récupère les informations du compte GitHub lié.

**Auth** : Authentifié

**Réponse** `200 OK` :
```json
{
  "github_login": "username",
  "github_user_id": "123456",
  "scopes": "repo,user",
  "linked": true
}
```

---

#### `DELETE /github/link`

Délie le compte GitHub.

**Auth** : Authentifié

**Réponse** `204 No Content`

---

#### `GET /github/repos`

Liste les dépôts GitHub de l'utilisateur lié (triés par date de mise à jour).

**Auth** : Authentifié (compte GitHub lié)

**Query params** :
| Param | Type | Défaut |
|-------|------|--------|
| `page` | int | 1 |

**Réponse** `200 OK` :
```json
[
  {
    "id": 123456789,
    "name": "mon-plugin",
    "full_name": "user/mon-plugin",
    "description": "Un super plugin",
    "private": false,
    "default_branch": "main",
    "language": "Python",
    "stargazers_count": 42,
    "updated_at": "2026-05-17T10:00:00Z",
    "html_url": "https://github.com/user/mon-plugin"
  }
]
```

---

#### `GET /github/repos/{owner}/{repo}/tags`

Liste les tags Git d'un dépôt lié — à utiliser pour choisir le tag à publier
(le déploiement est désormais **forcé sur un tag**, plus sur une branche).

**Auth** : Authentifié (compte GitHub lié)

**Réponse** `200 OK` :
```json
[
  { "name": "1.0.0", "sha": "abc123..." },
  { "name": "0.9.0", "sha": "def456..." }
]
```

---

#### `POST /github/publish`

Publie un plugin directement depuis un dépôt GitHub, **depuis un tag Git existant**.
Télécharge le ZIP au tag donné et déclenche le pipeline.

**Auth** : `submissions:write` + compte GitHub lié

**Corps** :
```json
{
  "full_name": "user/mon-plugin",
  "tag": "1.0.0",
  "plugin_version": "1.0.0",
  "category_ids": ["uuid-cat1"]
}
```

`tag` doit exister sur le dépôt (vérifié via `GET /github/repos/{owner}/{repo}/tags`)
et correspondre à `plugin_version` (accepté : `"1.0.0"` ou `"v1.0.0"`), sinon `400`.
Remplace l'ancien champ `default_branch` — le déploiement depuis une branche n'est
plus supporté.

**Réponse** `202 Accepted` : `SubmissionOut` avec `source: "github"` (`github_branch`
contient désormais le tag validé, pas une branche)

**Erreurs** :
| Code | Cas |
|------|-----|
| `400` | Tag introuvable sur le dépôt, ou tag ≠ version |

---

#### `POST /github/repos/{owner}/{repo}/tags/{tag}/recompute`

Équivalent CI de `POST /github/publish` : republie/recalcule automatiquement
lors d'un `git push --tags` sur le dépôt du développeur, sans session JWT
(un runner CI n'a pas de navigateur). Même vérification de tag, même pipeline.

**Auth** : `X-API-Key: xdk_...` (pas de Bearer JWT — voir `POST /xdevkeys/api-keys`)

**Query params** :
| Param | Type | Défaut |
|-------|------|--------|
| `plugin_version` | string | le tag lui-même, préfixe `v` retiré |

**Réponse** `202 Accepted` : `SubmissionOut` avec `source: "ci"`

**Erreurs** : identiques à `POST /github/publish` (`400` tag introuvable/≠ version)

---

#### `GET /github/repos/{owner}/{repo}/ci-workflow`

Génère un template GitHub Actions (`.github/workflows/xcore-publish.yml`) que le
développeur commite dans son propre dépôt : à chaque `git push --tags`, le
workflow appelle `POST /github/repos/{owner}/{repo}/tags/{tag}/recompute`
avec sa clé API (stockée comme secret de dépôt GitHub, `XCORE_API_KEY`).
C'est le mécanisme *"CI côté repo utilisateur"* qui garde le marketplace à
jour (code + doc) sans republication manuelle.

**Auth** : Authentifié (compte GitHub lié)

**Réponse** `200 OK` : `{ "filename": ".github/workflows/xcore-publish.yml", "content": "<yaml>" }`

---

#### `GET /plugins/{slug}/install`

Endpoint CLI d'installation. Télécharge le ZIP du plugin **depuis le tag Git publié**
(vérifié à nouveau à l'installation — rejette si le tag a été supprimé depuis), le
signe avec la clé HMAC-SHA256 du développeur, et le renvoie.

**Auth** : `X-API-Key: xdk_...` (clé API `xdevkeys`, distincte du Bearer JWT)

**Query params** :
| Param | Type | Défaut |
|-------|------|--------|
| `version` | string | `"latest"` |

**Réponse** `200 OK` — corps binaire (`application/zip`), en-têtes :
| En-tête | Contenu |
|---------|---------|
| `X-Signature` | `hmac_sha256:<hex>` |
| `X-Plugin` | `name@version` |
| `X-Repo` | `owner/repo@tag` |

**Erreurs** :
| Code | Cas |
|------|-----|
| `400` | Pas de repo configuré, pas de clé de signature, ou version publiée ne correspondant plus à aucun tag Git |
| `404` | Plugin ou version introuvable |

> Note sécurité : la signature est un HMAC symétrique (clé du développeur) — elle
> protège contre l'altération en transit, mais ne constitue pas une preuve
> d'authenticité vérifiable indépendamment du Hub (pas de clé publique).

---

### 4.5 Webhooks

#### `GET /webhooks`

Liste les webhooks de l'utilisateur connecté.

**Auth** : Authentifié

**Réponse** `200 OK` : `WebhookOut[]`

---

#### `POST /webhooks`

Crée un webhook.

**Auth** : Authentifié

**Corps** :
```json
{
  "url": "https://mon-serveur.com/hook",
  "secret": "ma-clé-secrète",
  "events": "*"
}
```

> `events` accepte : `"approved"`, `"rejected"`, `"manual_review"`, ou `"*"` pour tous.

**Réponse** `201 Created` : `WebhookOut`

---

#### `PATCH /webhooks/{webhook_id}/toggle`

Active ou désactive un webhook.

**Auth** : Authentifié (propriétaire)

**Réponse** `200 OK` : `WebhookOut` mis à jour

---

#### `DELETE /webhooks/{webhook_id}`

Supprime un webhook.

**Auth** : Authentifié (propriétaire)

**Réponse** `204 No Content`

---

#### Format des payloads webhook

Chaque événement envoie une requête `POST` vers l'URL configurée :

```json
{
  "event": "approved",
  "submission_id": "uuid",
  "plugin_name": "MonPlugin",
  "plugin_version": "1.0.0",
  "anomaly_score": 15,
  "timestamp": "2026-05-17T14:30:00Z"
}
```

**Signature** (si secret configuré) :
```
X-Webhook-Signature: sha256=<HMAC-SHA256(secret, body)>
```

---

## 5. API Administration (xadmin)

Préfixe : `/app/xadmin/admin`

> Toutes les routes de cette section requièrent des permissions admin.

---

### 5.1 Statistiques & Diffusion

#### `GET /stats`

Statistiques globales de la plateforme.

**Auth** : `admin:*`

**Réponse** `200 OK` :
```json
{
  "users_total": 150,
  "users_active": 142,
  "plugins_total": 34,
  "plugins_published": 28,
  "submissions_total": 89,
  "submissions_pending": 3,
  "submissions_approved": 71,
  "submissions_rejected": 10,
  "submissions_manual_review": 5,
  "categories_total": 8
}
```

---

#### `POST /broadcast`

Diffuse un message à tous les utilisateurs connectés via SSE.

**Auth** : `admin:*`

**Corps** :
```json
{
  "event": "maintenance",
  "message": "Maintenance planifiée dans 30 minutes."
}
```

**Réponse** `200 OK`

---

### 5.2 Utilisateurs

#### `GET /users`

Liste tous les utilisateurs.

**Auth** : `user:list`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Recherche par email |
| `is_active` | bool | Filtre actifs/bannis |
| `limit` | int | Défaut 50 |
| `offset` | int | Défaut 0 |

**Réponse** `200 OK` : `PageOut<UserAdminOut>`

---

#### `GET /users/{user_id}`

Détails d'un utilisateur avec statistiques.

**Auth** : `user:read`

**Réponse** `200 OK` : `UserAdminOut` avec `plugin_count`, `submission_count`, `roles[]`

---

#### `GET /users/{user_id}/github`

Compte GitHub lié à un utilisateur.

**Auth** : `user:read`

**Réponse** `200 OK` :
```json
{
  "github_login": "username",
  "github_user_id": "123456",
  "linked_at": "2026-01-15T10:00:00Z"
}
```

---

#### `PATCH /users/{user_id}/ban`

Bannit un utilisateur (met `is_active = false`).

**Auth** : `user:ban`

**Réponse** `200 OK` : `UserAdminOut`

---

#### `PATCH /users/{user_id}/unban`

Débannit un utilisateur (met `is_active = true`).

**Auth** : `user:ban`

**Réponse** `200 OK` : `UserAdminOut`

---

#### `DELETE /users/{user_id}`

Supprime définitivement un utilisateur.

**Auth** : `user:delete`

**Réponse** `204 No Content`

---

#### `POST /users/{user_id}/roles`

Assigne un rôle à un utilisateur dans un tenant.

**Auth** : `permission:assign`

**Corps** :
```json
{
  "role_id": "uuid-role",
  "tenant_id": "uuid-tenant"
}
```

**Réponse** `200 OK`

---

### 5.3 Plugins (admin)

#### `GET /plugins`

Liste tous les plugins (publiés et non publiés).

**Auth** : `plugin:approve`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Recherche par nom / slug |
| `is_published` | bool | Filtre publié/non publié |
| `limit` | int | Défaut 50 |
| `offset` | int | Défaut 0 |

**Réponse** `200 OK` : `PageOut<PluginOut>`

---

#### `GET /plugins/{slug}`

Détails complets d'un plugin.

**Auth** : `plugin:approve`

**Réponse** `200 OK` : `PluginOut`

---

#### `PATCH /plugins/{slug}`

Modifie un plugin (admin peut changer publication + catégories).

**Auth** : `plugin:approve`

**Corps** :
```json
{
  "is_published": true,
  "description": "Description mise à jour",
  "category_ids": ["uuid-cat1", "uuid-cat2"]
}
```

**Réponse** `200 OK` : `PluginOut`

---

#### `DELETE /plugins/{slug}`

Supprime un plugin définitivement.

**Auth** : `plugin:delete`

**Réponse** `204 No Content`

---

#### `POST /plugins/{slug}/versions/{version}/yank`

Retire (yank) une version spécifique.

**Auth** : `plugin:approve`

**Corps** :
```json
{
  "reason": "Vulnérabilité de sécurité détectée dans cette version"
}
```

**Réponse** `200 OK` : `PluginVersionOut` mis à jour (`is_yanked: true`)

---

#### `GET /plugins/{slug}/contributors`

Liste les contributeurs GitHub du plugin (nécessite une `repository` URL configurée).

**Auth** : `plugin:approve`

**Réponse** `200 OK` : liste de contributeurs GitHub

---

#### `GET /developers`

Liste tous les développeurs avec leurs statistiques.

**Auth** : `plugin:approve`

**Réponse** `200 OK` : liste d'utilisateurs avec `plugin_count`

---

#### `GET /developers/{developer_id}/plugins`

Liste tous les plugins d'un développeur.

**Auth** : `plugin:approve`

**Réponse** `200 OK` : `PluginOut[]`

---

### 5.4 Soumissions (admin)

#### `GET /submissions`

Liste toutes les soumissions de la plateforme.

**Auth** : `submission:review`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filtre par statut (`pending`, `approved`, `rejected`, `manual_review`, `processing`) |
| `limit` | int | Défaut 50 |
| `offset` | int | Défaut 0 |

**Réponse** `200 OK` : `PageOut<SubmissionOut>`

---

#### `PATCH /submissions/{submission_id}/status`

Force le statut d'une soumission (décision manuelle).

**Auth** : `submission:review`

**Corps** :
```json
{
  "status": "approved"
}
```

> Valeurs possibles : `approved`, `rejected`, `manual_review`, `pending`

**Réponse** `200 OK` : `SubmissionOut`

---

### 5.5 Catégories (admin)

Mêmes endpoints que `POST /categories` et `DELETE /categories/{slug}` décrits en §4.1, mais disponibles aussi sous le préfixe `/app/xadmin/admin/categories`.

---

### 5.6 Système & Audit

#### `GET /system/info`

Informations système du serveur.

**Auth** : `admin:*`

**Réponse** `200 OK` :
```json
{
  "python_version": "3.12.3",
  "os": "Linux",
  "pid": 12345,
  "env": { /* variables d'environnement non sensibles */ }
}
```

---

#### `GET /system/db`

Nombre de lignes de chaque table principale.

**Auth** : `admin:*`

**Réponse** `200 OK` :
```json
{
  "market_plugins": 34,
  "market_submissions": 89,
  "market_categories": 8,
  "auth_users": 150
}
```

---

#### `GET /audit`

Journal des actions administratives (50 dernières entrées).

**Auth** : `admin:*`

**Réponse** `200 OK` :
```json
[
  {
    "id": "uuid",
    "actor_id": "uuid-user",
    "actor_email": "admin@exemple.com",
    "action": "user.ban",
    "target_id": "uuid-cible",
    "detail": "Utilisateur banni pour spam",
    "created_at": "2026-05-17T14:00:00Z"
  }
]
```

---

## 6. Authentification xauth

Préfixe : `/app/auth`

---

### 6.1 Compte, onboarding & tokens

#### `POST /register`

Crée un compte utilisateur — **sans tenant** (le tenant se choisit/crée à
l'étape d'onboarding suivante, pas à l'inscription).

**Auth** : Publique

**Corps** :
```json
{
  "email": "user@exemple.com",
  "password": "motdepasse123"
}
```

**Réponse** `201 Created` : `UserResponse`

---

#### `POST /login`

Authentification avec email et mot de passe.

**Auth** : Publique

**Corps** :
```json
{
  "email": "user@exemple.com",
  "password": "motdepasse123",
  "tenant_id": null,
  "device_fingerprint": null
}
```

**Réponse** `200 OK` : `TokenResponse`

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user_id": "uuid",
  "tenant_id": null,
  "mfa_required": false,
  "mfa_token": null,
  "onboarding_required": false,
  "tenants": null
}
```

> Si `mfa_required: true`, `mfa_token` est un JWT de challenge valable 5 minutes — voir §6.2.
> Si `onboarding_required: true`, l'utilisateur n'appartient encore à aucun tenant — voir `/setup/create` et `/setup/join` ci-dessous.
> Si l'utilisateur appartient à plusieurs tenants, `tenants: TenantInfo[]` liste les choix possibles (`id`, `name`, `slug`, `role_id`, `is_owner`) — voir `POST /select-tenant`.

---

#### `POST /setup/create`

Étape d'onboarding : crée un nouveau tenant et en fait l'utilisateur
courant le `tenant_admin` (jamais le rôle plateforme `admin` — voir la note
dans `routes/auth.py`). Consomme le `refresh_token` obtenu à l'inscription/
connexion (l'utilisateur n'a pas encore de session pleinement scopée à un
tenant tant qu'il n'a pas fait ce choix).

**Auth** : Publique (le `refresh_token` porte l'identité)

**Corps** :
```json
{
  "refresh_token": "eyJ...",
  "name": "Acme Corp",
  "slug": "acme"
}
```

**Réponse** `200 OK` : `TokenResponse` (nouveau couple de jetons scopés au tenant créé)

---

#### `POST /setup/join`

Étape d'onboarding alternative : rejoint un tenant existant via un jeton
d'invitation (voir §6.6 Invitations).

**Auth** : Publique (le `refresh_token` porte l'identité)

**Corps** :
```json
{
  "refresh_token": "eyJ...",
  "invite_token": "abc123..."
}
```

**Réponse** `200 OK` : `TokenResponse`

---

#### `POST /select-tenant`

Pour un utilisateur membre de plusieurs tenants (`TokenResponse.tenants`
non vide après login) : émet un nouveau couple de jetons scopé au tenant
choisi.

**Auth** : Publique (le `refresh_token` porte l'identité)

**Corps** :
```json
{
  "refresh_token": "eyJ...",
  "tenant_id": "uuid-tenant"
}
```

**Réponse** `200 OK` : `TokenResponse`

---

#### `POST /refresh`

Renouvelle l'access token.

**Auth** : Publique

**Corps** :
```json
{
  "refresh_token": "eyJ..."
}
```

**Réponse** `200 OK` : `TokenResponse`

---

#### `POST /logout`

Révoque le refresh token.

**Auth** : Publique

**Corps** :
```json
{
  "refresh_token": "eyJ..."
}
```

**Réponse** `200 OK`

---

#### `GET /me`

Profil de l'utilisateur connecté.

**Auth** : Authentifié

**Réponse** `200 OK` : `UserResponse`
```json
{
  "id": "uuid",
  "email": "user@exemple.com",
  "is_active": true,
  "mfa_enabled": false,
  "has_password": true,
  "tenant_id": "uuid-tenant"
}
```

> Rôles/permissions ne sont **pas** portés par `GET /me` — voir
> `GET /rbac/me/permissions` et `GET /rbac/me/roles` (§6.5).

---

### 6.2 MFA (TOTP)

#### `POST /mfa/setup`

Initialise la configuration MFA (génère le secret TOTP).

**Auth** : Authentifié

**Réponse** `200 OK` :
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "provisioning_uri": "otpauth://totp/XCoreHub:user@exemple.com?secret=...",
  "backup_codes": ["abc123", "def456", "..."]
}
```

---

#### `POST /mfa/enable`

Active le MFA après configuration (valide un premier code TOTP).

**Auth** : Authentifié

**Corps** :
```json
{
  "code": "123456"
}
```

**Réponse** `200 OK` :
```json
{
  "mfa_enabled": true
}
```

---

#### `POST /mfa/verify`

Vérifie un code TOTP (utilisateur déjà authentifié).

**Auth** : Authentifié

**Corps** :
```json
{
  "code": "123456"
}
```

**Réponse** `200 OK` :
```json
{
  "valid": true
}
```

---

#### `POST /mfa/verify-login`

Complète le login MFA avec le challenge token.

**Auth** : Publique (utilise `mfa_token` du login)

**Corps** :
```json
{
  "mfa_token": "eyJ...",
  "code": "123456"
}
```

**Réponse** `200 OK` : `TokenResponse` avec les vrais tokens d'accès

---

#### `DELETE /mfa`

Désactive le MFA.

**Auth** : Authentifié

**Réponse** `200 OK`

---

### 6.3 OAuth

#### `GET /oauth/{provider}/authorize`

Redirige vers le provider OAuth.

**Auth** : Publique

**Providers** : `github`, `google`, `discord`, `microsoft`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `direct` | bool | Si `true`, retourne les tokens dans l'URL de callback |
| `redirect` | string | URL de callback après authentification |

**Réponse** : Redirection HTTP 302

---

#### `GET /auth/callback/{provider}`

Callback OAuth — échange le code contre des tokens.

**Auth** : Publique

**Réponse** : Redirection vers le frontend avec `?access_token=...&refresh_token=...`

---

#### `GET /oauth/me/token/{provider}`

Récupère le token OAuth du provider pour l'utilisateur connecté.

**Auth** : Authentifié

**Réponse** `200 OK` :
```json
{
  "provider": "github",
  "token": "ghp_xxxxxxxxxxxx"
}
```

---

### 6.4 Mots de passe

#### `POST /password/forgot`

Envoie un email de réinitialisation.

**Auth** : Publique

**Corps** :
```json
{
  "email": "user@exemple.com"
}
```

**Réponse** `200 OK` (même réponse que l'email existe ou non — sécurité)

---

#### `POST /password/reset`

Réinitialise le mot de passe avec le token reçu par email.

**Auth** : Publique

**Corps** :
```json
{
  "token": "token-depuis-email",
  "new_password": "NouveauMotDePasse123!"
}
```

**Réponse** `200 OK`

---

#### `POST /password/change`

Change le mot de passe (utilisateur connecté avec mot de passe actuel).

**Auth** : Authentifié

**Corps** :
```json
{
  "current_password": "AncienMDP",
  "new_password": "NouveauMDP123!"
}
```

**Réponse** `200 OK`

---

#### `POST /password/set`

Définit un mot de passe pour un compte OAuth (qui n'en a pas).

**Auth** : Authentifié

**Corps** :
```json
{
  "new_password": "NouveauMDP123!"
}
```

**Réponse** `200 OK`

---

### 6.5 RBAC (gestion des rôles)

#### `POST /rbac/roles`

Crée un rôle.

**Auth** : `rbac:write`

**Corps** :
```json
{
  "name": "moderator",
  "description": "Peut modérer les plugins"
}
```

---

#### `GET /rbac/roles`

Liste les rôles.

**Auth** : `rbac:read`

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `tenant_id` | UUID | Filtre par tenant |

---

#### `GET /rbac/roles/{role_id}`

Détails d'un rôle avec ses permissions.

**Auth** : `rbac:read`

---

#### `POST /rbac/roles/{role_id}/permissions`

Ajoute une permission à un rôle.

**Auth** : `rbac:write`

**Corps** :
```json
{
  "permission": "plugin:approve"
}
```

---

#### `DELETE /rbac/roles/{role_id}/permissions/{permission_id}`

Retire une permission d'un rôle.

**Auth** : `rbac:write`

---

#### `POST /rbac/tenants/{tenant_id}/members/{user_id}/role`

Assigne un rôle à un membre d'un tenant (rôle **primaire**, un seul —
distinct de la surface multi-rôles ci-dessous).

**Auth** : `rbac:write`

**Corps** :
```json
{
  "role_id": "uuid-role"
}
```

---

#### Reste de la surface plateforme (`rbac:read`/`rbac:write`)

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/rbac/permissions` | Crée une permission (`name`, `description`) |
| `GET` | `/rbac/permissions` | Liste tout le catalogue de permissions |
| `GET` | `/rbac/users/{user_id}/tenants/{tenant_id}/permissions` | Permissions effectives d'un utilisateur donné dans un tenant donné |

---

#### « Moi » — aucun droit RBAC requis, juste authentifié

Chacun lit ses propres droits dans son tenant courant — pour le gating UI
côté frontend, pas pour de l'administration.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/rbac/me/permissions` | Mes permissions effectives dans le tenant courant |
| `GET` | `/rbac/me/roles` | Mes rôles dans le tenant courant |

---

#### Surface owner — tenant-scopée (la « gestion fine des accès »)

Ces routes ne demandent pas la permission plateforme `rbac:write` — elles
sont ouvertes à quiconque est **owner du tenant ciblé** (`_require_tenant_admin`
: `admin:*` plateforme OU `membership.is_owner` sur ce tenant précis, jamais
sur un autre). C'est le mécanisme qui permet à chaque tenant de gérer ses
propres rôles/permissions en libre-service, sans dépendre d'un admin
plateforme.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/rbac/tenants/{tenant_id}/grantable` | Permissions délégables (agrégées depuis les plugins) que le owner peut effectivement accorder |
| `POST` | `/rbac/tenants/{tenant_id}/roles` | Crée un rôle propre à ce tenant (`name`, `description`, `permissions: string[]`) |
| `GET` | `/rbac/tenants/{tenant_id}/roles` | Liste les rôles propres à ce tenant |
| `DELETE` | `/rbac/tenants/{tenant_id}/roles/{role_id}` | Supprime un rôle de tenant |
| `POST` | `/rbac/tenants/{tenant_id}/roles/{role_id}/permissions` | Ajoute une permission à un rôle de tenant (`permission_name`) |
| `DELETE` | `/rbac/tenants/{tenant_id}/roles/{role_id}/permissions/{permission_name}` | Retire une permission d'un rôle de tenant |
| `GET` | `/rbac/tenants/{tenant_id}/members` | Liste les membres du tenant + leur rôle |
| `GET` | `/rbac/tenants/{tenant_id}/members/{user_id}/permissions` | Permissions effectives d'un membre (union rôles + accordées directement) |
| `POST` | `/rbac/tenants/{tenant_id}/members/{user_id}/permissions` | Accorde une permission directement à un membre — toggle owner (`permission_name`) |
| `DELETE` | `/rbac/tenants/{tenant_id}/members/{user_id}/permissions/{permission_name}` | Retire une permission accordée directement |
| `GET` | `/rbac/tenants/{tenant_id}/members/{user_id}/roles` | Liste les rôles d'un membre (primaire + multi-rôles) |
| `POST` | `/rbac/tenants/{tenant_id}/members/{user_id}/roles` | Ajoute un rôle à un membre — cumulatif, multi-rôles (`role_id`) |
| `DELETE` | `/rbac/tenants/{tenant_id}/members/{user_id}/roles/{role_id}` | Retire un rôle d'un membre (multi-rôles) |

### 6.6 Tenants

Préfixe : `/app/auth/tenants`. Un tenant est l'unité d'isolation
organisationnelle (≈ « organisation », « équipe ») — chaque utilisateur peut
en rejoindre plusieurs, avec un rôle par tenant (voir `TokenResponse.tenants`
et `POST /select-tenant`, §6.1).

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| `POST` | `/tenants` | Crée un tenant — le créateur en devient owner (rôle `tenant_admin`). Limité à 3 tenants par utilisateur (`429` au-delà) | Authentifié |
| `GET` | `/tenants/` | Liste les tenants de l'utilisateur connecté | Authentifié |
| `GET` | `/tenants/{tenant_id}` | Détail d'un tenant | Membre |
| `PATCH` | `/tenants/{tenant_id}` | Renomme / met à jour un tenant | Owner |
| `DELETE` | `/tenants/{tenant_id}` | Supprime un tenant | Owner |
| `GET` | `/tenants/{tenant_id}/settings` | Paramètres du tenant | Membre |
| `PUT` | `/tenants/{tenant_id}/settings` | Met à jour les paramètres | Owner |
| `GET` | `/tenants/{tenant_id}/members` | Liste les membres | Membre |
| `DELETE` | `/tenants/{tenant_id}/members/{user_id}` | Retire un membre — soi-même, ou `admin`+ pour retirer quelqu'un d'autre | Membre (soi) / Admin+ |

### 6.7 Invitations

Préfixe : `/app/auth/invites`. Remplace l'ancien système d'invitations de
`xorgs` (plugin supprimé) — les invitations rejoignent désormais un
**tenant** directement, via le même flux d'onboarding que `POST
/setup/join` (§6.1).

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| `POST` | `/invites/` | Invite un e-mail à rejoindre un tenant avec un rôle donné | Admin+ du tenant |
| `GET` | `/invites/me` | Invitations en attente adressées à l'utilisateur connecté | Authentifié |
| `GET` | `/invites/token/{token}` | Aperçu public d'une invitation (avant connexion) | Publique |
| `POST` | `/invites/accept` | Accepte une invitation (corps : `{ "token": "..." }`) | Authentifié |
| `GET` | `/invites/{tenant_id}` | Liste les invitations en attente d'un tenant | Admin+ du tenant |
| `DELETE` | `/invites/{invite_id}` | Révoque une invitation en attente | Admin+ du tenant |

Le lien d'invitation envoyé par e-mail pointe directement vers le frontend
(`{WEB_APP_URL}/invite/{token}`, jamais un deep-link `erp://`) — voir
`services/email/senders/invite.py`.

---

## 7. Temps réel — SSE (xpulse)

Préfixe : `/app/xpulse`

### `GET /stream`

Ouvre un flux SSE (Server-Sent Events) pour les notifications temps réel.

**Auth** : Authentifié

**Query params** :
| Param | Type | Description |
|-------|------|-------------|
| `channels` | string | Canaux séparés par virgule (ex: `notification,broadcast`) |

**Réponse** : `text/event-stream`

```
event: notification
data: {"channel": "notification", "user_id": "uuid", "text": "Votre plugin a été approuvé !", "type": "SUBMISSION_PIPELINE_DONE", "payload": {...}}

event: broadcast
data: {"channel": "broadcast", "text": "Maintenance dans 30 minutes", "type": "PLUGIN_PUBLISHED"}
```

**Canaux disponibles** :
| Canal | Description |
|-------|-------------|
| `notification` | Notifications personnelles (résultats pipeline, etc.) |
| `broadcast` | Messages diffusés à tous les utilisateurs |
| `admin` | Notifications admin (nouvelles soumissions, etc.) |
| `platform` | Événements système |

---

### `POST /publish`

Envoie une notification ciblée à un utilisateur.

**Auth** : `xpulse:publish`

**Corps** :
```json
{
  "user_id": "uuid",
  "text": "Votre plugin a été approuvé !",
  "channels": ["notification"]
}
```

---

### `POST /broadcast`

Diffuse un message à tous les abonnés d'un canal.

**Auth** : `xpulse:broadcast`

**Corps** :
```json
{
  "text": "Maintenance planifiée dans 30 minutes",
  "channels": ["broadcast"]
}
```

---

### Événements SSE émis automatiquement

| Événement | Canal | Déclencheur |
|-----------|-------|-------------|
| `SUBMISSION_PIPELINE_DONE` | `notification` | Fin du pipeline (approuvé/rejeté/review) |
| `PLUGIN_PUBLISHED` | `broadcast` | Plugin auto-approuvé et publié |
| `SUBMISSION_RECEIVED` | `admin` | Nouvelle soumission reçue |

---

## 8. Documentation des plugins (xdocs)

Préfixe : `/app/xdocs`

Depuis la soumission au tag Git, les docs ne sont plus extraites du ZIP soumis :
elles sont récupérées **en direct depuis le dépôt GitHub, au tag publié**
(`GitHubService.fetch_docs`, appelé après validation du pipeline), pour les
soumissions faites via `POST /github/publish` uniquement. Une soumission ZIP
brute (`POST /submissions`, sans repo lié) n'a pas de documentation.

Fichiers recherchés (premier trouvé par slot) :
| Slot | Candidats |
|------|-----------|
| `readme` | `README.md`, `readme.md`, `Readme.md` |
| `integration` | `integration.yaml`, `integration.yml`, `integration.md`, `INTEGRATION.md` |
| `contributor` | `CONTRIBUTING.md`, `CONTRIBUTING`, `contributor.yaml`, `contributors.yaml` |

#### `GET /plugins/{slug}/docs`

Récupère la documentation de la dernière version validée.

**Auth** : Publique

**Réponse** `200 OK` : `PluginDocOut`

```json
{
  "id": "uuid",
  "plugin_id": "uuid",
  "version": "1.2.0",
  "readme": "# MonPlugin\n\n...",
  "integration": "services:\n  db: ...",
  "contributor": { "maintainers": [{ "name": "..." }] },
  "extracted_at": "2026-05-17T10:00:00Z"
}
```

**Erreur** `404` : aucune doc disponible pour ce plugin (soumission ZIP brute, ou récupération GitHub échouée)

---

#### `GET /plugins/{slug}/versions/{version}/docs`

Documentation d'une version spécifique.

**Auth** : Publique

**Réponse** `200 OK` : `PluginDocOut`

---

## 9. Pipeline de validation

Le pipeline est déclenché asynchrone par Celery à chaque soumission (upload ou GitHub).

### Statuts d'une soumission

| Statut | Description |
|--------|-------------|
| `pending` | En attente de traitement |
| `processing` | Pipeline en cours d'exécution |
| `approved` | Score < 20 — auto-publié |
| `manual_review` | Score entre 20 et 79 inclus — révision humaine requise |
| `rejected` | Score ≥ 80 — rejeté automatiquement |
| `failed` | Erreur technique interne |

### Les 11 gates de validation

| Gate | Nom | Bloquant | Description |
|------|-----|----------|-------------|
| 1 | **Intake** | **Oui** | Structure ZIP, présence de `plugin.yaml`, manifest valide, typosquatting |
| 2 | **Static Analysis** | Non | Scanner AST personnalisé, entropie, taint tracking |
| 3 | **Supply Chain** | Non | `pip-audit`, dépendances épinglées sur URL brute |
| 4 | **Secrets Detection** | Non | `detect-secrets` + patterns Gitleaks-style |
| 5 | **Sandbox Execution** | Non | Le plugin se charge/instancie sous son `execution_mode` déclaré |
| 6 | **Behavioral Analysis** | Non | Permissions déclarées vs imports réellement utilisés |
| 7 | **Signing & Integrity** | Non | Génère `merkle_root` + `sig_bundle` |
| 8 | **Compliance** | Non | Licences des dépendances (résolues via PyPI) |
| 9 | **Supply Health** | Non | Dependency confusion + score façon OpenSSF (deps.dev) |
| 10 | **HTTP Audit** | Non | Domaines contactés par tout appel HTTP sortant détecté |
| 11 | **Runtime Sandbox** | Non | Détection d'exécution shell/système (AST + exécution isolée best-effort) |

> Les gates 2 à 11 s'exécutent en parallèle. Seule la gate 1 peut bloquer le
> pipeline. Détail complet de chaque gate : [gates.md](gates.md).

### Système de scoring

| Sévérité | Points ajoutés |
|---------|---------------|
| `CRITICAL` | +80 |
| `HIGH` | +40 |
| `MEDIUM` | +20 |
| `LOW` | +5 |
| `INFO` | +0 |

| Score total | Résultat |
|-------------|---------|
| 0 – 19 | `approved` (auto-publié) |
| 20 – 79 | `manual_review` |
| ≥ 80 | `rejected` |

Détail complet des seuils et cas particuliers : [scoring.md](scoring.md).

### Structure d'un rapport (SubmissionReport)

```json
{
  "submission_id": "uuid",
  "developer_id": "uuid",
  "plugin_name": "MonPlugin",
  "plugin_version": "1.0.0",
  "status": "approved",
  "anomaly_score": 5,
  "summary": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 1,
    "info": 2
  },
  "merkle_root": "sha256:abc...",
  "sig_bundle": "...",
  "recommendation": "Plugin sûr, publication automatique.",
  "gates": [
    {
      "gate": "intake",
      "status": "passed",
      "anomaly_score": 0,
      "findings": [],
      "duration_seconds": 0.12,
      "completed_at": "2026-05-17T14:30:00Z"
    },
    {
      "gate": "secrets_detection",
      "status": "passed",
      "anomaly_score": 5,
      "findings": [
        {
          "message": "Possible clé API dans config.py",
          "severity": "LOW",
          "file": "config.py",
          "line": 12,
          "code": "API_KEY = \"xxx\"",
          "remediation": "Utiliser des variables d'environnement"
        }
      ],
      "duration_seconds": 0.84,
      "completed_at": "2026-05-17T14:30:01Z"
    }
  ],
  "error": null,
  "verified_zip_path": "verified/mon-plugin/1.0.0/plugin.zip"
}
```

---

## 10. Tâches Celery

### `marketplace.process_submission`

**File** : `app/marketplace/src/tasks.py`  
**Queue** : `submissions`  
**Max retries** : 2  

#### Paramètres

| Paramètre | Type | Description |
|-----------|------|-------------|
| `submission_id` | str | UUID de la soumission |
| `developer_id` | str | UUID du développeur |
| `zip_path` | str | Chemin local vers le ZIP |
| `plugin_name` | str | Nom du plugin |
| `plugin_version` | str | Version (ex: `1.2.0`) |
| `secret_key` | str | Clé de signature (optionnel) |
| `db_url` | str | URL de la base de données |
| `sandbox_memory_mb` | int | Limite mémoire sandbox (défaut: 128) |
| `sandbox_cpu_seconds` | int | Limite CPU sandbox (défaut: 10) |
| `sandbox_timeout` | int | Timeout sandbox en secondes (défaut: 30) |

#### Flux d'exécution

```
1. Mise à jour statut → "processing"
2. Fetch email développeur
3. Email "submission_received" → développeur
4. Email "admin_new_submission" → admin
5. SandboxedPipeline.run() → PipelineOrchestrator → 11 gates
6. Si nouveau plugin → extrait plugin.yaml (description, homepage, repository)
7. Crée version avec publish_status selon score
8. Assigne les catégories si category_ids fournis
9. DocExtractorService → extrait README, integration.md, contributor.yaml
10. Email résultat (approved / rejected / manual_review / failed)
11. Redis PUBLISH → SSE notification développeur
12. Si approuvé → Redis PUBLISH → SSE broadcast "PLUGIN_PUBLISHED"
13. Trigger webhooks développeur (HMAC-SHA256)
14. Supprime ZIP temporaire
```

#### Emails envoyés

| Template | Destinataire | Déclencheur |
|----------|-------------|-------------|
| `submission_received` | Développeur | Soumission reçue |
| `admin_new_submission` | Admin | Soumission reçue |
| `pipeline_approved` | Développeur | Score ≤ 20 |
| `pipeline_manual_review` | Développeur | Score 21-79 |
| `pipeline_rejected` | Développeur | Score ≥ 80 |
| `pipeline_failed` | Développeur | Erreur technique |

---

## 11. Schémas de données complets

### PluginOut

```json
{
  "id": "uuid",
  "developer_id": "uuid",
  "name": "MonPlugin",
  "slug": "monplugin",
  "description": "Description du plugin",
  "homepage": "https://exemple.com",
  "repository": "https://github.com/user/repo",
  "is_published": true,
  "avg_rating": 4.5,
  "rating_count": 12,
  "download_count": 342,
  "latest_version": "1.2.0",
  "created_at": "2026-01-01T00:00:00Z",
  "versions": [
    {
      "id": "uuid",
      "version": "1.2.0",
      "anomaly_score": 8,
      "is_stable": true,
      "is_yanked": false,
      "yanked_reason": null,
      "publish_status": "auto_published",
      "changelog": null,
      "merkle_root": "sha256:abc...",
      "created_at": "2026-05-01T00:00:00Z"
    }
  ],
  "categories": [
    {
      "id": "uuid",
      "name": "Workflow",
      "slug": "workflow",
      "description": "Plugins d'automatisation",
      "plugin_count": 12
    }
  ]
}
```

### SubmissionOut

```json
{
  "id": "uuid",
  "developer_id": "uuid",
  "plugin_name": "MonPlugin",
  "plugin_version": "1.2.0",
  "status": "approved",
  "anomaly_score": 8,
  "source": "github",
  "github_repo": "user/repo",
  "category_ids": ["uuid-cat1"],
  "created_at": "2026-05-17T14:00:00Z",
  "completed_at": "2026-05-17T14:01:30Z"
}
```

### RatingOut

```json
{
  "id": "uuid",
  "plugin_id": "uuid",
  "user_id": "uuid",
  "score": 5,
  "comment": "Excellent plugin !",
  "reviewer_name": "john_doe",
  "created_at": "2026-05-17T10:00:00Z",
  "updated_at": "2026-05-17T10:00:00Z"
}
```

### WebhookOut

```json
{
  "id": "uuid",
  "url": "https://mon-serveur.com/hook",
  "events": "*",
  "is_active": true,
  "created_at": "2026-05-17T00:00:00Z",
  "last_triggered_at": "2026-05-17T14:30:00Z",
  "last_status_code": 200,
  "last_error": null
}
```

### PageOut (pagination)

```json
{
  "items": [ /* T[] */ ],
  "total": 42,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

---

## 12. Codes d'erreur

| Code HTTP | Signification |
|-----------|--------------|
| `400 Bad Request` | Données invalides (validation Pydantic) |
| `401 Unauthorized` | Token manquant ou invalide |
| `403 Forbidden` | Permission insuffisante |
| `404 Not Found` | Ressource introuvable |
| `409 Conflict` | Conflit (ex: nom de plugin déjà existant) |
| `422 Unprocessable Entity` | Erreur de validation du schéma |
| `429 Too Many Requests` | Rate limit atteint |
| `500 Internal Server Error` | Erreur interne |

**Format d'erreur standard** :
```json
{
  "detail": "Description de l'erreur"
}
```

**Rate limits** :
- Global : 200 requêtes / 60 secondes (par IP)
- Soumissions : 10 / heure (par utilisateur)

---

## 13. Configuration

Chaque plugin résout sa config en deux couches : `plugin.yaml` (valeurs par
défaut versionnées) puis son propre `.env` (secrets, overrides — jamais
versionné). Le root `conf/.env` est une source **séparée**, parfois
dupliquée, pour `integration.yaml` lui-même — un mismatch entre les deux
est une source d'erreurs récurrente, vérifier les deux quand une valeur ne
semble pas prise en compte.

### Root (`backends/conf/.env`, référencé par `integration.yaml`)

| Variable | Rôle |
|----------|------|
| `SECRET_KEY` | Secret racine `xcore` — sert aussi de clé HMAC-SHA256 pour vérifier `plugin.sig` (gate 5/7, `plugins.secret_key` dans `integration.yaml`). **Pas** la clé JWT (RS256 séparée, voir `auth`). |
| `SERVER_KEY` | Secret racine `xcore`, dérivé en PBKDF2 (`server_key_iterations: 100000`). |
| `DATABASE_URL` | `sqlite+aiosqlite:///marketplace.db` (dev) ou `postgresql+asyncpg://...` (prod) |
| `REDIS_URL` / `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | `redis://localhost:6379/{0,1,2}` |
| `DEVKEYS_MASTER_KEY` | Chiffre au repos les signing keys HMAC de `xdevkeys`. **Doit être identique** à `app/xdevkeys/.env`. |
| `XDEPLOY_KEK` | Clé enveloppant (AES-256-GCM) les DEK d'artefacts `.xdeploy`. Hex 64 caractères. Repli non sécurisé si absente (log de warning explicite au boot) — jamais garder ce repli en prod. |
| `XDEPLOY_SESSION_SECRET` | Clé HMAC des jetons de session courts émis par `POST /v1/auth`. Même avertissement que `XDEPLOY_KEK` si absente. |
| `MARKETPLACE_TOKEN` | Token pour l'API `marketplace.xcorehub.dev` (marketplace externe xcorehub.dev, distinct de ce backend). |
| `XAUTH_SMTP_*` | Voir `app/auth/.env` ci-dessous — souvent dupliqué ici pour `xmailproxy`. |
| `ADMIN_EMAIL` | Destinataire du relais admin `xmailproxy`. |

### `app/auth/.env` (branding `plugin.yaml: name: auth`, section `env:`)

| Variable | Rôle |
|----------|------|
| `XAUTH_APP_NAME` | Nom affiché (défaut `plugin.yaml`: `XAuth`) |
| `XAUTH_APP_BASE_URL` | Origine du **backend** — utilisée pour le suffixe callback OAuth (`/app/auth/oauth/{provider}/callback`) |
| `XAUTH_WEB_APP_URL` | Origine du **frontend** — utilisée pour construire les liens cliquables des e-mails (invitation → `/invite/:token`, reset mot de passe → `/auth?token=...`). Distincte de `APP_BASE_URL` en dev (`:5173` vs `:8000`) ; repli automatique dessus si absente (cas prod où les deux coïncident via le proxy `/app/*`). |
| `XAUTH_JWT_PRIVATE_KEY_PATH` / `XAUTH_JWT_PUBLIC_KEY_PATH` | Chemins PEM RS256 (défaut `conf/private.pem` / `conf/public.pem`) |
| `XAUTH_JWT_ACCESS_EXPIRE_MINUTES` / `XAUTH_JWT_REFRESH_EXPIRE_DAYS` | Défauts 15 / 7 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_TENANT_SLUG` / `ADMIN_TENANT_NAME` / `ADMIN_ROLE_NAME` / `USER_ROLE_NAME` | Overrides du seed admin — défauts dans `plugin.yaml: seed:` (`admin_role_name: admin`, `user_role_name: user`) |
| `XAUTH_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` / `_FROM_NAME` / `_USE_TLS` | SMTP (requis pour reset mdp, invitations) |
| `XAUTH_OAUTH_{GOOGLE,GITHUB,DISCORD,MICROSOFT}_CLIENT_{ID,SECRET}` | Vide = provider désactivé |
| `XAUTH_OAUTH_TOKEN_KEY` | Clé Fernet chiffrant au repos les tokens OAuth Gmail/Calendar (extension `ext.google`) — absente = login OAuth fonctionne, aucun token stocké |
| `XAUTH_OAUTH_WEB_REDIRECT_ORIGINS` | Liste blanche d'origines web autorisées comme cible finale du callback OAuth |

### `app/xdeploy/.env`

| Variable | Rôle |
|----------|------|
| `XDEPLOY_KEK` / `XDEPLOY_SESSION_SECRET` | Mêmes valeurs que le root `conf/.env` (voir plus haut) |

### `app/xdevkeys/.env`

| Variable | Rôle |
|----------|------|
| `DEVKEYS_MASTER_KEY` | Doit être identique au root `conf/.env` — sinon les signing keys déjà chiffrées deviennent indéchiffrables |

### `integration.yaml` — extension `storage` (`ext.storage`)

| Variable | Rôle |
|----------|------|
| `STORAGE_URL_SECRET` | Signe les URLs temporaires de `get_signed_url()` (backend `local`). Absente = warning + `None`, rien ne casse (aucun appelant actuel n'utilise `get_signed_url()`). |

### Fichiers de configuration

| Fichier | Description |
|---------|-------------|
| `backends/integration.yaml` | Configuration principale — plugins, DB, Redis, extensions (dont `storage`/`ext.storage`), Celery, sandbox (`security.allowed_imports`), CORS, middlewares |
| `backends/conf/.env` | Secrets racine (voir tableau ci-dessus), référencé par `integration.yaml` |
| `app/<plugin>/plugin.yaml` | Config versionnée + section `env:` mappant vers des `${VAR}` | 
| `app/<plugin>/.env` | Secrets/overrides du plugin, jamais versionné |

### Commandes de démarrage

```bash
# Installation
uv sync
pip install -e .    # requis pour que Celery trouve les packages app.*

# API (dev)
uv run main.py      # FastAPI sur http://localhost:8000

# Worker Celery (terminal séparé)
celery -A xcore.services.xworker.xworker:_celery_worker worker \
  --loglevel=info -Q submissions,default,result -c 4

# Inspection Celery
celery -A xcore.services.xworker.xworker:_celery_worker inspect active
celery -A xcore.services.xworker.xworker:_celery_worker inspect stats

# Les deux via Docker
docker-compose up
```

---

## 14. Clés développeur & déploiement (xdevkeys)

Préfixe : `/app/xdevkeys`. Gère tout ce qu'un opérateur/CI a besoin pour
s'authentifier **sans session JWT** : clés API (`xdk_...`), projets de
déploiement auxquels elles sont rattachées, et la clé de signature HMAC
utilisée pour signer les ZIP installés (voir §4.4 `GET
/plugins/{slug}/install`).

Un **projet** (`kind`: `plugin` | `service` | `xdeploy`) est la cible
qu'une clé donnée peut installer/déployer/republier — une clé n'est
jamais rattachée à plusieurs projets. Pour `kind=plugin`/`service`, le
`slug` doit correspondre au plugin/service ciblé (utilisé par
`GET /plugins/{slug}/install`, qui vérifie le rattachement — voir
`_resolve_api_key_for_plugin`). Le endpoint CI de republication
(`POST /github/.../recompute`, §4.4) est plus permissif : il accepte
**n'importe quelle** clé active du développeur, sans vérifier son projet
(`_resolve_api_key`).

### 14.1 Projets

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/projects` | Crée un projet (`name`, `kind`, `slug` — `slug` ignoré pour `kind=xdeploy`, un id opaque `prj_<hex>` est généré) |
| `GET` | `/projects` | Liste les projets du développeur connecté |
| `DELETE` | `/projects/{project_id}` | Supprime un projet — refusé (`409`) tant que des clés actives y sont rattachées |
| `POST` | `/projects/{project_id}/manifests` | Enregistre une nouvelle version (tag) du manifeste déclaratif d'un projet `xdeploy` — en clair, informatif, ne remplace pas l'artefact scellé lui-même |
| `GET` | `/projects/{project_id}/manifests` | Liste les manifestes d'un projet |
| `GET` | `/projects/{project_id}/manifests/latest` | Dernier manifeste du projet |

**Auth** : Authentifié (JWT), tout au long de §14.1/14.2/14.3.

### 14.2 Clés API

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api-keys` | Génère une clé rattachée à un projet (`name`, `project_id`) |
| `GET` | `/api-keys` | Liste les clés actives du développeur connecté |
| `DELETE` | `/api-keys/{key_id}` | Révoque (désactive) une clé |

`POST /api-keys` répond `201 Created` avec le **secret en clair, une seule
fois** :
```json
{
  "id": "uuid",
  "name": "agent-prod",
  "project_id": "uuid-projet",
  "prefix": "xdk_AcAh3-yG",
  "is_active": true,
  "created_at": "2026-08-21T00:00:00Z",
  "last_used_at": null,
  "key": "xdk_AcAh3-yG9oMPkOw4yhTv9i4bzTPLOLaZ_dR1OIT5OKI_GnW4c0gUUaJVHIZ0eJEi",
  "deployment_credential": "UVD096B3azgjDZlAqyc4dEGtabY6ski2HBmL0X51hUU"
}
```
`deployment_credential` n'est présent **que** pour un projet `kind=xdeploy` —
c'est un **second** secret, requis en plus de `key` par
`POST /app/xdeploy/v1/deployments/authorize` (§15) pour obtenir le DEK d'un
artefact. Ni l'un ni l'autre secret n'est récupérable après cette réponse —
seul `prefix` reste visible ensuite (`GET /api-keys`).

### 14.3 Clé de signature

Une seule clé de signature par développeur (HMAC-SHA256), chiffrée au repos
avec `DEVKEYS_MASTER_KEY`. Utilisée pour signer les ZIP servis par
`GET /plugins/{slug}/install` / `GET /services/{slug}/install`.

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/signing-key` | Crée/remplace la clé (`label`, `secret` optionnel — généré côté serveur si absent). Réponse : le `secret` en clair, une seule fois |
| `GET` | `/signing-key` | Statut de la clé (label, dates) — jamais le secret |
| `DELETE` | `/signing-key` | Supprime la clé |

---

## 15. Hub `.xdeploy` (xdeploy)

Préfixe : `/app/xdeploy`. Implémente le contrat consommé par
`xcore_agent/agent/hub_client.py` côté CLI agent — stockage/distribution de
bundles multi-plugins **scellés** (le Hub ne voit jamais le contenu en
clair). Voir [architecture.md](architecture.md#two-deployment-circuits)
pour la comparaison avec le flux marketplace direct. Le blob chiffré
lui-même est stocké via l'extension `ext.storage` (backend `local` par
défaut, S3/R2/Supabase en config).

Deux surfaces d'authentification distinctes :
- **`/v1/*`** (contrat agent) — `xdevkey` (auth initiale) puis jeton de
  session court (`Authorization: Bearer <token>`, obtenu via `POST /v1/auth`,
  scopé à **un seul** projet).
- **`/projects/*`** (navigateur) — JWT classique, développeur connecté au
  Hub, réservé au propriétaire du projet.

### 15.1 Contrat agent (`/v1`)

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `POST` | `/v1/auth` | `xdevkey` (JSON `{xdevkey, project_id}`) | Échange la clé contre un jeton de session court, scopé au projet `kind=xdeploy` correspondant |
| `POST` | `/v1/projects/{project_id}/publish` | `X-API-Key: xdk_...` (pas de jeton de session — la publication est un acte local de build) | Publie un nouvel artefact `.xdeploy` scellé (`multipart/form-data` : `version`, `project_name`, `content_sha256`, `dek` b64, `signature` b64, `signer_public_key` b64, `artifact` — le fichier scellé) |
| `GET` | `/v1/projects/{project_id}/versions/latest` | Jeton de session | Dernière version publiée |
| `GET` | `/v1/projects/{project_id}/artifacts/{version}` | Jeton de session | Résout une version en URL de téléchargement + signature + clé publique du signataire |
| `GET` | `/v1/artifacts/{artifact_id}/download` | **Publique, sans auth** | Télécharge le ciphertext brut — inutilisable sans le DEK, donc masquer cette URL n'ajoute rien |
| `POST` | `/v1/deployments/authorize` | Jeton de session + `deployment_credential` (corps) | Débloque le DEK d'un artefact identifié par sa signature, une fois le `deployment_credential` vérifié |
| `POST` | `/v1/deployments/report` | Jeton de session | Journalise un déploiement (succès/échec) — écrit dans `xdep_deployments`, même table que le flux marketplace, `kind="xdeploy"` |

`POST /v1/publish` répond `201 Created` :
```json
{
  "artifact_id": "uuid",
  "project_id": "prj_07501cca11f3fda3b5304e0b1ea7ec17",
  "version": "0.1.1",
  "content_sha256": "7475903c...",
  "size_bytes": 48213,
  "created_at": "2026-08-21T00:00:00Z"
}
```

`POST /v1/deployments/authorize` répond avec le DEK en clair (base64) —
l'appel n'a de sens qu'après validation du `deployment_credential`, distinct
de la `key` xdevkey (voir §14.2) :
```json
{ "dek": "base64..." }
```

### 15.2 Gestion navigateur (`/projects`, JWT)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/projects/{project_id}/artifacts` | Historique des versions publiées pour ce projet — métadonnées seulement, jamais le contenu |
| `DELETE` | `/projects/artifacts/{artifact_id}` | Supprime un artefact publié (blob + métadonnées) — un déploiement en cours dépendant de cette signature exacte cesse de pouvoir récupérer son DEK |

Les deux routes vérifient que l'appelant possède bien le projet (IPC
`devkeys.check_project_owner`), `404` sinon (jamais `403` — n'indique pas
qu'un projet existe s'il n'appartient pas à l'appelant).

---

## 16. Extensions de service (xservices)

Préfixe : `/app/xservices`. « Extensions » = services externes qu'un plugin
peut déclarer comme dépendance (DB, cache, files de messages, etc.), publiés
et distribués via le **même procédé** que les plugins du marketplace (§4) :
soumission forcée sur tag Git, docs récupérées en direct depuis GitHub au tag
publié, endpoint CLI signé HMAC, et visibilité public/private + organisation.

Modèle : `Service` (≈ `Plugin`), `ServiceVersion` (≈ `PluginVersion`),
`ServiceSubmission` (≈ `Submission`). Contrairement au marketplace, il n'y a
pas de `POST /services` : un `Service` est créé implicitement à la première
soumission (`visibility`/`organization_id` s'y définissent alors — modifiables
ensuite via `PATCH /services/{slug}`).

#### `GET /services`

Liste les extensions publiées. Mêmes règles de visibilité que `GET /plugins`
(privé = propriétaire ou membre de l'organisation propriétaire).

**Auth** : Publique (optionnellement authentifiée)

**Query params** : `search`, `category_id`, `sort` (`newest`|`installs`|`rating`), `limit`, `offset`

---

#### `GET /services/{slug}` · `GET /services/mine` · `PATCH /services/{slug}`

Détail (respecte la visibilité), extensions du développeur connecté, mise à
jour (`description`, `homepage`, `repository`, `visibility` — propriétaire uniquement).

---

#### `POST /github/publish`

Identique à `POST /github/publish` du marketplace (§4.4), pour une extension :

```json
{
  "full_name": "user/mon-extension",
  "tag": "1.0.0",
  "service_version": "1.0.0",
  "category_ids": ["uuid-cat1"],
  "visibility": "public",
  "organization_id": null
}
```

Réutilise le compte GitHub lié au marketplace (même token). `tag` doit exister
et correspondre à `service_version`, sinon `400`.

**Auth** : `services:write` + compte GitHub lié · **Réponse** `202 Accepted` : `SubmissionOut`

---

#### `POST /github/repos/{owner}/{repo}/tags/{tag}/recompute`

Équivalent CI (`X-API-Key`) — voir §4.4. Utilise le même template de workflow
GitHub Actions que le marketplace (`GET .../ci-workflow`), pointé vers
`/app/xservices/github/repos/{owner}/{repo}/tags/{tag}/recompute`.

---

#### `GET /services/{slug}/install`

Endpoint CLI d'installation — miroir exact de `GET /plugins/{slug}/install`
(§4.4) : `X-API-Key`, vérifie que la version publiée correspond à un tag Git
existant, télécharge le ZIP à ce tag, le signe en HMAC-SHA256 avec la clé de
signature xdevkeys de l'appelant.

**Réponse** `200 OK` — ZIP binaire, en-têtes `X-Signature`, `X-Service`
(`nom@version`), `X-Repo` (`owner/repo@tag`)

---

#### `GET /services/{slug}/docs` · `GET /services/{slug}/versions/{version}/docs`

Identique à `GET /plugins/{slug}/docs` (§8) : README/integration/contributor
récupérés en direct depuis GitHub au tag publié — uniquement pour les
extensions soumises via `/github/publish` (pas pour un ZIP brut). Respecte la
visibilité.

---

---

## 17. Statut de déploiement (xdeployments)

Préfixe : `/app/xdeployments`. Le marketplace n'a par défaut aucune
visibilité sur ce qui tourne réellement chez les opérateurs — cette app
comble ce manque : `xcore-agent` rapporte le résultat de chaque déploiement
qu'il effectue (voir `MarketplaceDeploymentRunner` / `MarketplaceClient.report_deployment`
côté agent).

Un déploiement rapporté n'est **pas** rattaché au propriétaire du plugin :
`deployer_id` est le porteur de la clé API qui a fait l'appel — n'importe
quel opérateur peut déployer un plugin public d'un tiers et suivre son
propre statut. Chaque appel crée une nouvelle ligne (journal, pas un
upsert) ; l'état "courant" d'un host se lit en prenant le rapport le plus
récent pour ce host.

#### `POST /deployments/report`

Appelé par xcore-agent en fin de déploiement, succès ou échec.

**Auth** : `X-API-Key: xdk_...`

**Corps** :
```json
{
  "kind": "plugin",
  "slug": "my-plugin",
  "version": "1.2.3",
  "status": "success",
  "started_at": "2026-05-17T10:00:00Z",
  "completed_at": "2026-05-17T10:00:05Z",
  "host_id": "vps-prod-1",
  "repo": "acme/my-plugin@1.2.3",
  "error_message": null
}
```

`kind` : `"plugin"` ou `"service"` · `status` : `"success"`, `"failed"` ou
`"rolled_back"` · `host_id` : identifiant libre choisi par l'opérateur,
`"default"` si omis.

**Réponse** `201 Created` : `DeploymentOut`

---

#### `GET /deployments`

Historique des déploiements rapportés par l'utilisateur connecté, tous hosts confondus.

**Auth** : Authentifié (JWT)

**Query params** : `slug`, `host_id`, `status`, `limit` (défaut 50), `offset`

**Réponse** `200 OK` : `DeploymentOut[]`

---

#### `GET /deployments/{kind}/{slug}/hosts`

Vue "flotte" : le rapport le plus récent par `host_id` pour ce plugin/extension
— quels VPS tournent quelle version, et si le dernier déploiement a réussi.
Limité aux déploiements de l'utilisateur connecté.

**Auth** : Authentifié (JWT)

**Réponse** `200 OK` : `DeploymentOut[]` (un élément par host)

---

*Documentation générée pour XCore Marketplace v1.0.0 — 2026-05-17*
