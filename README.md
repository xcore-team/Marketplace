<div align="center">
  <br/>
  <img src="./public/XCore%20Mascotte.svg" width="160" alt="XCore Mascot" />
  <br/><br/>

  # XCore Market — Admin Dashboard

  <p>Interface d'administration complète pour le marketplace de plugins XCore.</p>

  ![Phase](https://img.shields.io/badge/Phase%201-Admin%20Opérationnel-00C896?style=flat-square&labelColor=0d0d0d)
  ![Stack](https://img.shields.io/badge/Next.js-14%20App%20Router-black?style=flat-square&logo=nextdotjs)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
  ![Tailwind](https://img.shields.io/badge/Tailwind-CSS%20v3-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
  ![Backend](https://img.shields.io/badge/Backend-localhost%3A8000-6b7280?style=flat-square)

  <br/>
</div>

---

Dashboard d'administration du marketplace XCore. Interface dédiée aux opérateurs de la plateforme — gestion des utilisateurs, plugins, soumissions, audit et RBAC, le tout consommant directement les endpoints `/app/xadmin/` et `/app/marketplace/admin/`.

---

## Identité Visuelle

| Token | Valeur |
| --- | --- |
| Couleur Primaire (Accent) | `#00C896` |
| Framework | Next.js 14 — App Router |
| Langage | TypeScript strict |
| CSS | Tailwind CSS v3 + CSS Variables |
| Fonts | Syne (titres) · Inter (corps) · JetBrains Mono (valeurs) |
| Port de développement | `localhost:3001` |

---

## Architecture — `src/`

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/          → Authentification JWT RS256
│   └── (admin)/
│       ├── dashboard/      → Vue d'ensemble — stats globales + broadcast WebSocket
│       ├── plugins/        → Liste des plugins + détail par slug (versions, yank, catégories)
│       ├── developers/     → Liste des développeurs + plugins par développeur
│       ├── submissions/    → File de soumissions — changement de statut
│       ├── users/          → Liste des utilisateurs + profil détaillé par ID
│       ├── categories/     → CRUD catégories
│       ├── audit/          → Journal d'audit filtrable avec détails JSON
│       ├── rbac/           → Gestion des rôles et permissions
│       └── system/         → Infos système + métriques base de données
│
├── components/
│   ├── admin-sidebar.tsx   → Navigation latérale collapsible
│   └── ...
│
└── lib/
    ├── admin-api.ts        → Client fetch typé — tous les endpoints backend
    └── admin-auth.ts       → Helpers JWT + session
```

---

## Pages & Endpoints Consommés

| Page | Route backend |
| --- | --- |
| Dashboard | `GET /app/xadmin/admin/stats` · `POST /app/xadmin/admin/broadcast` |
| Plugins | `GET/PATCH/DELETE /app/xadmin/admin/plugins` |
| Plugin Detail | `GET/PATCH /app/marketplace/admin/plugins/{slug}` + yank version |
| Developers | `GET /app/marketplace/admin/developers` + plugins par développeur |
| Submissions | `GET/PATCH /app/xadmin/admin/submissions` |
| Users | `GET/PATCH/DELETE /app/xadmin/admin/users` |
| Categories | `GET/POST/PATCH/DELETE /app/xadmin/admin/categories` |
| Audit | `GET /app/xadmin/admin/audit` |
| RBAC | `GET/POST /app/xauth/rbac/roles` · `GET/POST /app/xauth/rbac/permissions` |
| System | `GET /app/xadmin/admin/system/info` · `/system/db` |

---

## Lancer le projet

```bash
cd admin
npm install
npm run dev     # → http://localhost:3001
```

Compte de développement : `admin@gmail.com` — backend requis sur `http://localhost:8000`.

Variables d'environnement (`.env.local`) :

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Notes Importantes

### Règle absolue — Backend first

> Aucune route, aucun champ, aucun type TypeScript ne doit être écrit sans avoir lu le code source backend au préalable.
> Tout appel API passe obligatoirement par `src/lib/admin-api.ts` — jamais de `fetch` direct.

### Fichiers critiques

| Fichier | Rôle |
| --- | --- |
| `src/lib/admin-api.ts` | Client fetch typé — source unique de vérité pour tous les appels API |
| `src/lib/admin-auth.ts` | Décodage JWT + helpers session |
| `src/app/(admin)/layout.tsx` | Provider auth + sidebar |

### Score d'anomalie pipeline

Les seuils proviennent de `backend/pipelines/models.py` :

| Score | Statut | Couleur |
| --- | --- | --- |
| 0 – 20 | Auto-approuvé | `#00C896` |
| 21 – 49 | Normal | `#f59e0b` |
| 50 – 79 | Revue manuelle | `#f97316` |
| 80+ | Auto-rejeté | `#ef4444` |

---

<div align="center">
  <sub>Statut : Phase 1 — Admin Opérationnel &nbsp;·&nbsp; Backend : <code>http://localhost:8000</code> &nbsp;·&nbsp; Admin : <code>http://localhost:3001</code></sub>
</div>
