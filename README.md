# XCore Marketplace — Frontend

> Modern, scalable frontend for the XCore plugin marketplace ecosystem.

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8)](https://tailwindcss.com)

---

## 🎯 Overview

XCore Marketplace is a **developer-first platform** for discovering, publishing, and managing Python plugins for the XCore framework. This frontend provides:

- **Plugin Discovery** — Browse, search, and filter thousands of plugins
- **Developer Portal** — Manage plugins, analytics, and releases
- **Security-First** — Every plugin is validated through our security pipeline
- **Realtime Updates** — Live notifications and analytics
- **i18n Support** — English and French localization

---

## 🚀 Tech Stack

### Core
- **Next.js 16** (App Router) — SSR, streaming, edge-ready
- **TypeScript** — Type safety
- **Tailwind CSS** — Utility-first styling
- **Framer Motion** — GPU-optimized animations

### State & Data
- **Zustand** — Lightweight state management
- **TanStack Query** — Server state, caching, realtime
- **React Hook Form + Zod** — Form validation

### UI Components
- **shadcn/ui** — Composable primitives
- **Radix UI** — Accessible components
- **next-intl** — Internationalization

---

## 📦 Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## 🏗️ Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # i18n routes (en, fr)
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Homepage
│   │   ├── plugins/              # Plugin pages
│   │   ├── dashboard/            # Developer dashboard
│   │   └── admin/                # Admin interface
│   └── globals.css               # Global styles
│
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── layout/                   # Header, Footer, Sidebar
│   ├── plugins/                  # Plugin cards, grids, filters
│   ├── dashboard/                # Dashboard components
│   ├── mascotte/                 # HEX mascotte animations
│   └── shared/                   # Shared components
│
├── lib/
│   ├── api/                      # API client
│   ├── hooks/                    # Custom hooks
│   ├── stores/                   # Zustand stores
│   └── utils/                    # Utilities
│
├── i18n/                         # Internationalization
│   ├── messages/                 # Translations (en.json, fr.json)
│   ├── request.ts
│   └── routing.ts
│
└── public/                       # Static assets
```

---

## 🎨 Design System

### Colors (XCore Palette)
```typescript
colors: {
  xcore: {
    green: '#00C896',  // Primary
    red: '#EF4444',    // Error
    blue: '#3B82F6',   // Info
    bg: '#080809',     // Background
    text: '#F4F4F5',   // Text
    muted: '#9CA3AF',  // Secondary
    border: '#1C1C1E', // Border
    card: '#0D0D0F',   // Card
  }
}
```

### Typography
- **Display:** Syne (headings)
- **Body:** Geist Sans (content)
- **Mono:** Geist Mono (code)

---

## 🌐 Internationalization

The app supports English and French. Add translations in:
- `i18n/messages/en.json`
- `i18n/messages/fr.json`

Usage:
```tsx
import { useTranslations } from 'next-intl'

function Component() {
  const t = useTranslations()
  return <h1>{t('hero.title')}</h1>
}
```

---

## 🔧 Available Scripts

```bash
# Development
npm run dev          # Start dev server (Turbopack)

# Build
npm run build        # Production build
npm run start        # Start production server

# Linting
npm run lint         # Run ESLint
```

---

## 📚 Key Features

### ✅ Implemented
- [x] Homepage with Hero section
- [x] Plugin grid with filters
- [x] Header with auth buttons
- [x] Footer
- [x] i18n (EN/FR)
- [x] Dark theme
- [x] Responsive design
- [x] HEX mascotte components

### 🚧 In Progress
- [ ] Plugin detail pages
- [ ] Developer dashboard
- [ ] Authentication pages (login, register)
- [ ] Search functionality
- [ ] Analytics dashboard

### 🔮 Planned
- [ ] Realtime notifications
- [ ] AI-powered recommendations
- [ ] Plugin sandbox preview
- [ ] Desktop app (Electron)

---

## 🔗 Related Repositories

- **Backend API** — [xcore-team/Marketplace](https://github.com/xcore-team/Marketplace) (main branch)
- **Security Pipeline** — `pipline-gates/xcore-market`
- **Auth Plugin** — `xcore/xcore-auth`

---

## 📖 Documentation

- [Architecture](./ARCHITECTURE.md) — System design and patterns
- [API Integration](./docs/api.md) — Backend integration guide
- [Component Library](./docs/components.md) — UI component docs

---

## 🤝 Contributing

1. Create a feature branch from `frontend`
2. Make your changes
3. Run `npm run lint` and fix any issues
4. Submit a pull request

---

## 📄 License

Internal Tool - XCore Marketplace Team

---

**Built with ❤️ by the XCore Team**
