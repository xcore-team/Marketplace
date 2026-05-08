# 🏗️ XCore Marketplace — Frontend Architecture

## Vision

XCore Marketplace n'est pas un simple site web. C'est une **plateforme écosystème** pour développeurs Python, combinant :
- Plugin marketplace
- Developer portal
- Runtime ecosystem
- Distribution layer

L'architecture doit être **scalable**, **maintenable**, et **extensible** pour supporter des milliers de plugins et des fonctionnalités futures (AI, realtime, desktop).

---

## Tech Stack

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
- **Lucide Icons** — Icon system

### Future
- **MDX** — Documentation
- **WebSockets** — Realtime notifications
- **Monorepo** — Packages separation

---

## Folder Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── [locale]/                 # i18n routes
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Homepage
│   │   ├── plugins/              # Plugin pages
│   │   │   ├── page.tsx          # Plugin listing
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Plugin detail
│   │   ├── developers/           # Developer profiles
│   │   │   └── [username]/
│   │   │       └── page.tsx
│   │   ├── dashboard/            # Developer dashboard
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── plugins/          # Plugin management
│   │   │   ├── analytics/        # Analytics
│   │   │   └── settings/         # Settings
│   │   └── admin/                # Admin interface (future)
│   ├── api/                      # API routes (if needed)
│   └── globals.css               # Global styles
│
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── layout/                   # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Sidebar.tsx
│   │   └── DashboardLayout.tsx
│   ├── plugins/                  # Plugin-specific
│   │   ├── PluginCard.tsx
│   │   ├── PluginGrid.tsx
│   │   ├── PluginDetail.tsx
│   │   ├── PluginSearch.tsx
│   │   └── PluginFilters.tsx
│   ├── dashboard/                # Dashboard components
│   │   ├── StatsCard.tsx
│   │   ├── AnalyticsChart.tsx
│   │   └── ActivityFeed.tsx
│   ├── mascotte/                 # HEX mascotte
│   │   └── (existing structure)
│   └── shared/                   # Shared components
│       ├── EmptyState.tsx
│       ├── LoadingState.tsx
│       └── ErrorBoundary.tsx
│
├── lib/
│   ├── api/                      # API client
│   │   ├── client.ts             # Axios instance
│   │   ├── plugins.ts            # Plugin endpoints
│   │   ├── auth.ts               # Auth endpoints
│   │   └── types.ts              # API types
│   ├── hooks/                    # Custom hooks
│   │   ├── usePlugins.ts
│   │   ├── useAuth.ts
│   │   └── useAnalytics.ts
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts
│   │   ├── pluginStore.ts
│   │   └── uiStore.ts
│   ├── utils/                    # Utilities
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   └── cn.ts
│   └── constants/                # Constants
│       ├── routes.ts
│       └── config.ts
│
├── i18n/                         # Internationalization
│   ├── messages/
│   │   ├── en.json
│   │   └── fr.json
│   ├── request.ts
│   └── routing.ts
│
├── public/                       # Static assets
│   ├── hex.svg
│   └── ...
│
├── types/                        # TypeScript types
│   ├── plugin.ts
│   ├── user.ts
│   └── index.ts
│
└── config files...
```

---

## System Boundaries

### 1. Public Ecosystem
**Pages:** `/`, `/plugins`, `/plugins/[slug]`, `/developers/[username]`
**Purpose:** Discovery, search, plugin details
**Rendering:** SSR + ISR for SEO
**State:** TanStack Query for caching

### 2. Developer Platform
**Pages:** `/dashboard/*`
**Purpose:** Plugin management, analytics, settings
**Rendering:** CSR with auth guard
**State:** Zustand + TanStack Query

### 3. Admin Interface (Future)
**Pages:** `/admin/*`
**Purpose:** Review submissions, manage users
**Rendering:** CSR with role guard
**State:** Separate admin store

---

## State Management Strategy

### Server State (TanStack Query)
- Plugin listings
- Plugin details
- User profiles
- Analytics data
- Search results

**Why:** Automatic caching, refetching, optimistic updates

### Client State (Zustand)
- Auth state (user, token)
- UI state (sidebar, modals, theme)
- Form state (drafts, unsaved changes)
- Filters state (search, categories)

**Why:** Lightweight, no boilerplate, devtools support

### Form State (React Hook Form)
- Plugin submission
- Settings forms
- Search filters

**Why:** Performance, validation with Zod

---

## Rendering Strategy

### SSR (Server-Side Rendering)
- Homepage (`/`)
- Plugin listing (`/plugins`)
- Plugin detail (`/plugins/[slug]`)
- Developer profiles (`/developers/[username]`)

**Why:** SEO, fast initial load

### ISR (Incremental Static Regeneration)
- Plugin detail pages (revalidate every 60s)
- Category pages

**Why:** Static speed + fresh data

### CSR (Client-Side Rendering)
- Dashboard pages
- Admin pages
- Realtime features

**Why:** Dynamic, auth-required, interactive

---

## Cache Strategy

### TanStack Query Cache
```typescript
// lib/api/client.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 min
      cacheTime: 5 * 60 * 1000, // 5 min
      refetchOnWindowFocus: false,
    },
  },
})
```

### Next.js Cache
```typescript
// app/plugins/[slug]/page.tsx
export const revalidate = 60 // ISR every 60s
```

### CDN Cache
- Static assets (images, fonts)
- API responses (via headers)

---

## Performance Optimizations

### Code Splitting
- Route-level splitting (automatic with App Router)
- Component-level splitting (dynamic imports)
- Dashboard lazy-loaded

### Image Optimization
- Next.js Image component
- WebP format
- Lazy loading

### Bundle Optimization
- Tree shaking
- Minimal dependencies
- No moment.js, lodash (use native)

### GPU Optimization
- Framer Motion (transform/opacity only)
- CSS containment
- will-change sparingly

---

## Realtime Strategy (Future)

### WebSockets
- Notification system
- Live analytics
- Collaboration features

### Implementation
```typescript
// lib/realtime/client.ts
import { io } from 'socket.io-client'

export const socket = io(process.env.NEXT_PUBLIC_WS_URL, {
  autoConnect: false,
})

// hooks/useRealtime.ts
export function useRealtime() {
  useEffect(() => {
    socket.connect()
    socket.on('notification', handleNotification)
    return () => socket.disconnect()
  }, [])
}
```

---

## Design System

### Colors (XCore Palette)
```typescript
// tailwind.config.ts
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

### Components
- Consistent spacing (4px grid)
- Rounded corners (8px default)
- Subtle shadows
- Smooth transitions (200ms)

---

## Security

### Auth Strategy
- JWT tokens (httpOnly cookies)
- Refresh token rotation
- CSRF protection

### API Security
- Rate limiting
- Input validation (Zod)
- XSS prevention
- CORS configuration

---

## Testing Strategy (Future)

### Unit Tests
- Components (Vitest + Testing Library)
- Hooks (Vitest)
- Utils (Vitest)

### Integration Tests
- API client (MSW)
- Forms (Testing Library)

### E2E Tests
- Critical flows (Playwright)
- Plugin submission
- Search & discovery

---

## Deployment

### Vercel
- Auto-deploy from git
- Preview deployments
- Edge functions
- Analytics

### Environment Variables
```
NEXT_PUBLIC_API_URL=https://api.xcorehub.dev
NEXT_PUBLIC_WS_URL=wss://ws.xcorehub.dev
```

---

## Extensibility

### Future Features
- **AI Copilot:** Plugin recommendations, code generation
- **Desktop App:** Electron wrapper
- **Realtime Collaboration:** Live editing, comments
- **Plugin Sandbox:** Visual testing environment
- **Embedded Runtimes:** Run plugins in browser

### Architecture Support
- Modular components
- Plugin system for UI extensions
- Event-driven architecture
- Microservices-ready

---

## Migration Path

### Phase 1: MVP (Current)
- Public marketplace
- Basic dashboard
- Plugin CRUD

### Phase 2: Enhanced
- Analytics dashboard
- Realtime notifications
- Advanced search

### Phase 3: Platform
- AI features
- Collaboration
- Desktop app

---

**Version:** 1.0.0  
**Status:** In Development  
**Updated:** May 2026
