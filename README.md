<div align="center">
  <br/>
  <img src="./assets/mascot.svg" width="160" alt="XCore Mascot" />
  <br/><br/>

  # XCore Marketplace — Frontend Architecture

  <p>Standards de développement et structure de base du frontend.</p>

  ![Phase](https://img.shields.io/badge/Phase%201-Fondations%20Terminées-00C896?style=flat-square&labelColor=0d0d0d)
  ![Stack](https://img.shields.io/badge/Next.js-14%20App%20Router-black?style=flat-square&logo=nextdotjs)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
  ![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
  ![Backend](https://img.shields.io/badge/Backend-localhost%3A8000-6b7280?style=flat-square)

  <br/>
</div>

---

Ce document définit la structure de base et les standards de développement pour le frontend du Marketplace XCore. L'objectif est de garantir une **exécution rapide**, une **scalabilité maximale** et une **maintenance simplifiée**.

---

## Identité Visuelle

| Token | Valeur |
| --- | --- |
| Couleur Primaire (Accent) | `#00C896` |
| Framework | Next.js 14 — App Router |
| Langage | TypeScript |
| CSS | Tailwind CSS |

---

## Organisation de l'Architecture — `src/`

L'arborescence suit une logique de **Séparation des Préoccupations (SoC)** stricte.

```
src/
├── app/
│   ├── (public)/       → Accueil, Catalogue, Détails plugins
│   ├── (auth)/         → Connexion, Inscription
│   └── (dashboard)/    → Espace Développeur & Backoffice Admin
│
├── components/
│   ├── ui/             → Boutons, Inputs, Badges
│   ├── layout/         → Navbar, Sidebar, Footer
│   ├── plugin/         → Composants domaine plugin
│   └── submission/     → Composants domaine soumission
│
├── lib/
│   ├── api/            → Client Axios + intercepteurs JWT
│   └── auth/           → Store Zustand — rôles & état global
│
├── services/           → Appels API mappés sur les endpoints Swagger
└── types/              → Interfaces TypeScript bout en bout
```

### 1 — Routage `app/`

Utilisation des **Route Groups** pour segmenter les expériences utilisateurs :

- **`(public)/`** — Pages accessibles à tous : Accueil, Catalogue, Détails plugins.
- **`(auth)/`** — Flux d'authentification : Connexion, Inscription.
- **`(dashboard)/`** — Zones sécurisées : Espace Développeur & Backoffice Admin.

### 2 — Composants `components/`

- **`ui/`** — Composants atomiques réutilisables : Boutons, Inputs, Badges.
- **`layout/`** — Structure globale : Navbar, Sidebar, Footer.
- **`plugin/` & `submission/`** — Composants spécifiques aux domaines métiers.

### 3 — Logique & Data `lib/` & `services/`

- **`lib/`** — Configurations techniques : Client API Axios, Store Zustand pour l'Auth.
- **`services/`** — Fonctions d'appels API pures mappées sur les endpoints Swagger.
- **`types/`** — Interfaces TypeScript pour une robustesse de bout en bout.

---

## Notes Importantes & Sécurité

L'architecture a été conçue pour être **Senior-Ready**. Merci de respecter scrupuleusement les consignes suivantes.

### Immuabilité de l'Arborescence

> **L'architecture de base ne doit en aucun cas être modifiée sans concertation préalable.**
> Toute création de nouveau dossier à la racine de `src/` doit être validée.

### Routes Groupées

Utilise systématiquement les dossiers entre parenthèses `()` — ex : `(dashboard)` — pour organiser les pages. Cela permet de conserver des **URLs propres** côté client : `/plugins` au lieu de `/public/plugins`.

### Fichiers Critiques

Toute modification sur les fichiers suivants **nécessite une notification immédiate** :

| Fichier | Rôle |
| --- | --- |
| `src/lib/api/client.ts` | Gestion du Token JWT et intercepteurs |
| `src/lib/auth/store.ts` | Gestion des rôles et état global |
| `src/app/layout.tsx` | Providers et structure racine |

---

<div align="center">
  <sub>Statut : Phase 1 — Fondations Terminées &nbsp;·&nbsp; Backend : <code>http://localhost:8000</code></sub>
</div>
