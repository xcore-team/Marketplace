# Backend Gaps — observations admin dashboard

Date : 2026-05-14

---

## Endpoints manquants

| # | Endpoint | Méthode | Retourne |
|---|----------|---------|----------|
| 1 | `/xadmin/admin/users/{id}/github` | GET | `{ github_login, github_user_id, linked_at }` |
| 2 | `/xadmin/admin/submissions/{id}/report` | GET | rapport pipeline complet (gates, score, summary) |
| 3 | `/marketplace/admin/plugins/{slug}/contributors` | GET | liste contributeurs GitHub du repo |

---

## Champs manquants dans les schémas existants

| Schéma | Champ à ajouter | Type |
|--------|----------------|------|
| `UserAdminOut` | `display_name` | `Optional[str]` |
| `UserAdminOut` | `github_login` | `Optional[str]` |
| `DeveloperOut` | `github_login` | `Optional[str]` |
| `DeveloperOut` | `display_name` | `Optional[str]` |

---

## Observations générales

- **Seuls les développeurs ont un compte** — les acheteurs/utilisateurs finals n'ont pas de compte sur la marketplace. Le label "Utilisateurs" dans le dashboard devrait être "Développeurs".

- **Pas de `display_name`** — l'auth stocke uniquement `email` + `id`. L'admin identifie un développeur uniquement par son email.

- **`github_login` existe mais inaccessible en admin** — la table de liaison GitHub stocke déjà `github_login` (via `/github/link`), mais aucun endpoint admin n'y accède.

- **Rapport pipeline non accessible en admin** — `GET /submissions/{id}/report` requiert l'auth du soumetteur. L'admin ne peut pas consulter le détail d'une analyse sans contournement.

- **`PluginOut.repository`** contient l'URL GitHub mais aucun contributeur n'est stocké ni fetché.

- **Seuils pipeline** (définis dans `backend/pipelines/models.py`) :
  - `score < 20` → auto-approve
  - `20 ≤ score < 80` → manual review
  - `score ≥ 80` → auto-reject
