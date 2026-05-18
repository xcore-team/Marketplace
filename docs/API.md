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
6. [Authentification xauth](#6-authentification-xauth)
   - [Compte & tokens](#61-compte--tokens)
   - [MFA (TOTP)](#62-mfa-totp)
   - [OAuth](#63-oauth)
   - [Mots de passe](#64-mots-de-passe)
   - [RBAC (gestion des rôles)](#65-rbac-gestion-des-rôles)
7. [Temps réel — SSE (xpulse)](#7-temps-réel--sse-xpulse)
8. [Documentation des plugins (xdocs)](#8-documentation-des-plugins-xdocs)
9. [Pipeline de validation](#9-pipeline-de-validation)
10. [Tâches Celery](#10-tâches-celery)
11. [Schémas de données complets](#11-schémas-de-données-complets)
12. [Codes d'erreur](#12-codes-derreur)
13. [Configuration](#13-configuration)

---

## 1. Architecture générale

```
Client HTTP / Frontend
        │
        ▼
   FastAPI (main.py)
        │
        ├── /app/auth/*        → xauth     (auth, JWT, OAuth, MFA, RBAC)
        ├── /app/marketplace/* → marketplace (plugins, soumissions, catégories, webhooks, GitHub)
        ├── /app/xadmin/*      → xadmin    (admin panel — utilisateurs, stats, audit)
        ├── /app/xdocs/*       → xdocs     (extraction de docs depuis ZIPs approuvés)
        ├── /app/xpulse/*      → xpulse    (SSE — notifications temps réel)
        └── /ws/{channel}      → WebSocket (xwebsocket)

        │
Celery Worker (process séparé)
        │
        └── Queue: submissions → marketplace.process_submission
                                   └── SandboxedPipeline (9 gates)
                                   └── Email (xmailler via SMTP)
                                   └── SSE push (Redis PUBLISH)
                                   └── Webhooks (HMAC-SHA256)
```

**Middlewares** (ordre d'exécution) :
- `CORSMiddleware` — origines configurables via env `ALLOWED_ORIGINS`
- `SecurityHeadersMiddleware` — headers de sécurité HTTP
- `GZipMiddleware` — compression ≥ 1 KB

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

Liste les plugins publiés avec recherche et filtres.

**Auth** : Publique

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

**Auth** : Publique

**Réponse** `200 OK` : `PluginOut` complet avec `versions[]` et `categories[]`

**Erreur** `404` : plugin introuvable

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
  "category_ids": ["uuid-cat1", "uuid-cat2"]
}
```

**Réponse** `201 Created` : `PluginOut`

---

#### `PATCH /plugins/{slug}`

Met à jour les métadonnées d'un plugin (propriétaire uniquement).

**Auth** : Authentifié (propriétaire)

**Corps** (tous optionnels) :
```json
{
  "description": "Nouvelle description",
  "homepage": "https://nouvelle-url.com",
  "repository": "https://github.com/user/nouveau-repo"
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

#### `POST /github/publish`

Publie un plugin directement depuis un dépôt GitHub. Télécharge le ZIP et déclenche le pipeline.

**Auth** : `submissions:write` + compte GitHub lié

**Corps** :
```json
{
  "full_name": "user/mon-plugin",
  "default_branch": "main",
  "plugin_version": "1.0.0",
  "category_ids": ["uuid-cat1"]
}
```

**Réponse** `202 Accepted` : `SubmissionOut` avec `source: "github"`

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

### 6.1 Compte & tokens

#### `POST /register`

Crée un compte utilisateur.

**Auth** : Publique

**Corps** :
```json
{
  "email": "user@exemple.com",
  "password": "motdepasse123",
  "tenant_slug": "default"
}
```

**Réponse** `201 Created` : `UserOut`

---

#### `POST /login`

Authentification avec email et mot de passe.

**Auth** : Publique

**Corps** :
```json
{
  "email": "user@exemple.com",
  "password": "motdepasse123",
  "tenant_id": null
}
```

**Réponse** `200 OK` : `TokenResponse`

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "mfa_required": false,
  "mfa_token": null
}
```

> Si `mfa_required: true`, `mfa_token` est un JWT de challenge valable 5 minutes. Utiliser le flux MFA.

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

**Réponse** `200 OK` :
```json
{
  "id": "uuid",
  "email": "user@exemple.com",
  "is_active": true,
  "mfa_enabled": false,
  "created_at": "2026-01-01T00:00:00Z",
  "roles": ["developer"],
  "permissions": ["plugins:write", "submissions:write"]
}
```

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

Assigne un rôle à un membre d'un tenant.

**Auth** : `rbac:write`

**Corps** :
```json
{
  "role_id": "uuid-role"
}
```

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

#### `GET /plugins/{slug}/docs`

Récupère la documentation de la dernière version validée.

**Auth** : Publique

**Réponse** `200 OK` : `PluginDocOut`

```json
{
  "id": "uuid",
  "plugin_id": "uuid",
  "version": "1.2.0",
  "readme_markdown": "# MonPlugin\n\n...",
  "integration_markdown": "## Installation\n\n...",
  "contributors_yaml": "contributors:\n  - name: ...",
  "extracted_at": "2026-05-17T10:00:00Z"
}
```

**Erreur** `404` : aucune doc disponible pour ce plugin

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
| `approved` | Score ≤ 20 — auto-publié |
| `manual_review` | Score entre 21 et 79 — révision humaine requise |
| `rejected` | Score ≥ 80 — rejeté automatiquement |
| `failed` | Erreur technique interne |

### Les 9 gates de validation

| Gate | Nom | Bloquant | Description |
|------|-----|----------|-------------|
| 1 | **Intake** | **Oui** | Structure ZIP, présence de `plugin.yaml`, manifest valide |
| 2 | **Static Analysis** | Non | Qualité du code, linting |
| 3 | **Supply Chain** | Non | Dépendances, vulnérabilités connues (CVE) |
| 4 | **Secrets Detection** | Non | API keys, credentials, tokens exposés |
| 5 | **Sandbox Execution** | Non | Comportement à l'exécution en environnement isolé |
| 6 | **Behavioral Analysis** | Non | Patterns suspects, comportements malveillants |
| 7 | **Signing & Integrity** | Non | Génère `merkle_root` + `sig_bundle` |
| 8 | **Compliance** | Non | Validation de licence, conformité légale |
| 9 | **Supply Health** | Non | Réputation mainteneur, fréquence de mise à jour |

> Les gates 2 à 9 s'exécutent en parallèle. Seule la gate 1 peut bloquer le pipeline.

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
| ≤ 20 | `approved` (auto-publié) |
| 21 – 79 | `manual_review` |
| ≥ 80 | `rejected` |

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
5. SandboxedPipeline.run() → 9 gates
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

### Variables d'environnement essentielles

**Application** :
| Variable | Description | Exemple |
|----------|-------------|---------|
| `APP_NAME` | Nom de l'application | `marketplace` |
| `APP_BASE_URL` | URL publique de l'app | `https://xcoremarketplace.com` |
| `ALLOWED_ORIGINS` | CORS origins (séparées par virgule ou `*`) | `https://mon-frontend.com` |

**JWT** :
| Variable | Description |
|----------|-------------|
| `JWT_PRIVATE_KEY_PATH` | Chemin vers la clé privée RSA (PEM) |
| `JWT_PUBLIC_KEY_PATH` | Chemin vers la clé publique RSA (PEM) |
| `JWT_ACCESS_EXPIRE_MINUTES` | Durée de vie access token (défaut: 15) |
| `JWT_REFRESH_EXPIRE_DAYS` | Durée de vie refresh token (défaut: 7) |

**Admin par défaut** :
| Variable | Défaut |
|----------|--------|
| `ADMIN_EMAIL` | `admin@gmail.com` |
| `ADMIN_PASSWORD` | `Hunters123@` |
| `ADMIN_TENANT_SLUG` | `default` |
| `ADMIN_TENANT_NAME` | `Default` |
| `ADMIN_ROLE_NAME` | `admin` |
| `USER_ROLE_NAME` | `developer` |

**Base de données** :
| Variable | Exemple |
|----------|---------|
| `DATABASE_URL` | `sqlite+aiosqlite:///db.sqlite3` (dev) ou `postgresql+asyncpg://...` (prod) |
| `REDIS_URL` | `redis://localhost:6379/0` |

**Email (SMTP)** :
| Variable | Description |
|----------|-------------|
| `XAUTH_SMTP_HOST` | Serveur SMTP |
| `XAUTH_SMTP_PORT` | Port (465 TLS, 587 STARTTLS) |
| `XAUTH_SMTP_USER` | Utilisateur SMTP |
| `XAUTH_SMTP_PASSWORD` | Mot de passe SMTP |
| `XAUTH_SMTP_FROM` | Adresse expéditeur |
| `XAUTH_SMTP_USE_TLS` | `true` / `false` |

**OAuth** :
| Variable | Description |
|----------|-------------|
| `OAUTH_GITHUB_CLIENT_ID` | GitHub App Client ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub App Client Secret |
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

**Sandbox & Pipeline** :
| Variable | Défaut | Description |
|----------|--------|-------------|
| `MARKET_SECRET_KEY` | — | Clé de signature des plugins |
| `SANDBOX_MEMORY_MB` | 128 | Limite mémoire sandbox |
| `SANDBOX_CPU_SECONDS` | 10 | Limite CPU sandbox |
| `SANDBOX_TIMEOUT` | 30 | Timeout sandbox (secondes) |

### Fichiers de configuration

| Fichier | Description |
|---------|-------------|
| `integration.yaml` | Configuration principale (DB, Redis, extensions, sécurité, Celery) |
| `.env` | Variables SMTP et secrets (non versionné) |
| `extensions/.env` | Variables Celery worker (non versionné) |

### Commandes de démarrage

```bash
# Installation
uv sync
pip install -e .    # Requis pour que Celery trouve les modules

# Tout lancer (API + Celery worker)
python3 run.py --host 0.0.0.0 --port 8000 --reload

# API uniquement
python3 main.py

# Worker Celery uniquement
celery -A celery_app worker --loglevel=info -Q submissions,default -c 4

# Inspection Celery
celery -A celery_app inspect registered
celery -A celery_app inspect active
```

---

*Documentation générée pour XCore Marketplace v1.0.0 — 2026-05-17*
