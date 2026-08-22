import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight, Package, Server, Download, Star, Tag } from 'lucide-react'
import { plugins as pluginsApi, services as servicesApi, categories as catsApi } from '../../api'
import { ListRow, Pill } from '../../components/ui'
import type { Category, PagedResponse, Plugin, ServiceCategory, ServiceSummary } from '../../types'

const LIMIT = 24
const HALF_LIMIT = 12 // par source, quand le type "Tous" mélange plugins + services

type CatalogType = 'all' | 'plugin' | 'service'

/** Forme commune utilisée pour fusionner plugins et services dans la vue
 * "Tous" — chaque source garde son slug/route de détail propres, seule
 * l'affichage de la ligne et le tri sont unifiés. */
interface CatalogItem {
  kind: 'plugin' | 'service'
  id: string
  slug: string
  name: string
  description?: string | null
  categoryName?: string | null
  count: number // downloads (plugin) / installs (service)
  rating: number
  ratingCount: number
  version?: string | null
  createdAt: string
}

function fromPlugin(p: Plugin): CatalogItem {
  return {
    kind: 'plugin',
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    categoryName: p.category?.name,
    count: p.download_count,
    rating: p.avg_rating ?? p.average_score ?? 0,
    ratingCount: p.rating_count ?? 0,
    version: p.latest_version,
    createdAt: p.created_at,
  }
}

function fromService(s: ServiceSummary): CatalogItem {
  return {
    kind: 'service',
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    categoryName: s.categories?.[0]?.name,
    count: s.install_count ?? 0,
    rating: s.avg_rating ?? 0,
    ratingCount: s.rating_count ?? 0,
    version: s.latest_version,
    createdAt: s.created_at,
  }
}

/** Catalogue unifié — plugins et services étaient deux pages/entrées de nav
 * séparées ; fusionnés ici derrière un simple filtre de type, à la façon du
 * "Marketplace" GitHub qui mélange Apps et Actions. Les pages de détail
 * (`/plugins/:slug`, `/services/:slug`) restent distinctes : seule la liste
 * est commune. */
export default function CatalogPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [type, setType] = useState<CatalogType>((searchParams.get('type') as CatalogType) || 'all')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [inputVal, setInputVal] = useState(search)
  const [categoryId, setCategoryId] = useState(searchParams.get('category') ?? '')
  const [sortBy, setSortBy] = useState(searchParams.get('sort') ?? 'newest')
  const [page, setPage] = useState(0) // offset = page * LIMIT (ou * HALF_LIMIT par source en mode "Tous")

  useEffect(() => {
    setSearchParams((p) => {
      if (type !== 'all') p.set('type', type); else p.delete('type')
      if (search) p.set('q', search); else p.delete('q')
      if (categoryId) p.set('category', categoryId); else p.delete('category')
      if (sortBy !== 'newest') p.set('sort', sortBy); else p.delete('sort')
      return p
    }, { replace: true })
  }, [type, search, categoryId, sortBy, setSearchParams])

  const changeType = (t: CatalogType) => {
    setType(t); setCategoryId(''); setPage(0)
  }

  // ── Catégories (dépendent du type actif — les deux catalogues n'ont pas
  // le même référentiel de catégories, on ne les fusionne pas) ──────────
  const { data: pluginCats } = useQuery({
    queryKey: ['categories'],
    queryFn: catsApi.list,
    enabled: type === 'plugin',
  })
  const { data: serviceCats } = useQuery<ServiceCategory[]>({
    queryKey: ['service-categories'],
    queryFn: servicesApi.categories,
    enabled: type === 'service',
  })
  const cats: Category[] = Array.isArray(pluginCats)
    ? pluginCats
    : (pluginCats as PagedResponse<Category>)?.items ?? []

  // ── Plugins ─────────────────────────────────────────────────────────
  const pluginLimit = type === 'all' ? HALF_LIMIT : LIMIT
  const pluginOffset = page * pluginLimit
  const { data: pluginsData, isLoading: pluginsLoading, isFetching: pluginsFetching } = useQuery({
    queryKey: ['plugins', search, type === 'plugin' ? categoryId : '', sortBy === 'security' ? sortBy : (sortBy === 'downloads' || sortBy === 'rating' ? sortBy : 'newest'), pluginOffset, pluginLimit],
    queryFn: () => pluginsApi.list({
      search,
      category_id: type === 'plugin' ? categoryId : undefined,
      limit: pluginLimit,
      offset: pluginOffset,
      sort: sortBy === 'security' ? sortBy : (sortBy === 'downloads' || sortBy === 'rating' ? sortBy : 'newest'),
    }),
    placeholderData: (prev) => prev,
    enabled: type === 'all' || type === 'plugin',
  })

  // ── Services ────────────────────────────────────────────────────────
  const serviceLimit = type === 'all' ? HALF_LIMIT : LIMIT
  const serviceOffset = page * serviceLimit
  const { data: servicesData, isLoading: servicesLoading, isFetching: servicesFetching } = useQuery<ServiceSummary[]>({
    queryKey: ['services', search, type === 'service' ? categoryId : '', sortBy === 'downloads' || sortBy === 'rating' ? sortBy : 'newest', serviceOffset, serviceLimit],
    queryFn: () => servicesApi.list({
      search,
      category_id: type === 'service' ? categoryId : undefined,
      limit: serviceLimit,
      offset: serviceOffset,
      sort: sortBy === 'downloads' || sortBy === 'rating' ? sortBy : 'newest',
    }),
    placeholderData: (prev) => prev,
    enabled: type === 'all' || type === 'service',
  })

  const pluginItems: Plugin[] = (pluginsData as PagedResponse<Plugin>)?.items ?? []
  const pluginTotal = (pluginsData as PagedResponse<Plugin>)?.total ?? 0
  const pluginHasMore = (pluginsData as PagedResponse<Plugin>)?.has_more ?? false
  const serviceItems: ServiceSummary[] = servicesData ?? []

  const isLoading = type === 'all' ? (pluginsLoading || servicesLoading) : type === 'plugin' ? pluginsLoading : servicesLoading
  const isFetching = type === 'all' ? (pluginsFetching || servicesFetching) : type === 'plugin' ? pluginsFetching : servicesFetching

  const merged: CatalogItem[] = useMemo(() => {
    if (type === 'plugin') return pluginItems.map(fromPlugin)
    if (type === 'service') return serviceItems.map(fromService)
    const combined = [...pluginItems.map(fromPlugin), ...serviceItems.map(fromService)]
    combined.sort((a, b) => {
      if (sortBy === 'downloads') return b.count - a.count
      if (sortBy === 'rating') return (b.rating - a.rating) || (b.ratingCount - a.ratingCount)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return combined
  }, [type, pluginItems, serviceItems, sortBy])

  const total = type === 'plugin' ? pluginTotal : type === 'service' ? undefined : undefined
  const hasMore = type === 'plugin'
    ? pluginHasMore
    : type === 'service'
      ? serviceItems.length >= LIMIT
      : (pluginItems.length >= HALF_LIMIT || serviceItems.length >= HALF_LIMIT)

  const doSearch = useCallback(() => { setSearch(inputVal.trim()); setPage(0) }, [inputVal])
  const selectCat = (id: string) => { setCategoryId(id === categoryId ? '' : id); setPage(0) }
  const clearFilters = () => { setSearch(''); setInputVal(''); setCategoryId(''); setSortBy('newest'); setPage(0) }
  const hasFilters = search || categoryId || sortBy !== 'newest'

  const activeCats = type === 'service' ? (serviceCats ?? []) : cats

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Catalogue XCoreHub</div>
          <h1 className="dash-header__title">
            Découvrez l'écosystème
          </h1>
        </div>
      </div>

      <div className="section">
        <div className="filter-bar mb-6">
          <div className={`filter-pill${type === 'all' ? ' active' : ''}`} onClick={() => changeType('all')}>Tout</div>
          <div className={`filter-pill${type === 'plugin' ? ' active' : ''}`} onClick={() => changeType('plugin')}><Package size={12} /> Plugins</div>
          <div className={`filter-pill${type === 'service' ? ' active' : ''}`} onClick={() => changeType('service')}><Server size={12} /> Services</div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 280 }}>
            <Search size={16} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <input
              placeholder="Ex: Redis, Auth, Monitoring…"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
            {inputVal && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setInputVal(''); setSearch(''); setPage(0) }} style={{ padding: '4px 6px', color: 'var(--text3)' }}>
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 180, background: 'var(--surface2)' }}
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(0) }}
          >
            <option value="newest">Plus récents</option>
            <option value="downloads">Plus téléchargés</option>
            <option value="rating">Mieux notés</option>
            {type === 'plugin' && <option value="security">Score sécurité</option>}
          </select>
        </div>

        {type !== 'all' && activeCats.length > 0 && (
          <div className="filter-bar mb-6">
            <div className={`filter-pill${!categoryId ? ' active' : ''}`} onClick={() => selectCat('')}>Tout</div>
            {activeCats.map((cat) => (
              <div key={cat.id} className={`filter-pill${categoryId === cat.id ? ' active' : ''}`} onClick={() => selectCat(cat.id)}>
                {cat.name}
                {type === 'plugin' && (cat as Category).plugin_count != null && (
                  <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '11px' }}>{(cat as Category).plugin_count}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {isLoading && merged.length === 0 ? (
          <div className="list">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="list-row" key={i}>
                <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 'var(--r-md)' }} />
                <div className="list-row__main">
                  <div className="skeleton" style={{ width: '30%', height: 14, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: '60%', height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : merged.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Search size={40} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucun résultat</div>
            <div className="empty__text">
              {hasFilters ? 'Rien ne correspond à votre recherche.' : "Le catalogue est vide pour l'instant."}
            </div>
            {hasFilters && (
              <button className="btn btn-secondary" onClick={clearFilters}>Effacer les filtres</button>
            )}
          </div>
        ) : (
          <>
            {isFetching && (
              <div className="flex items-center gap-2 mb-4 text-muted text-sm">
                <div className="spinner" />
                Actualisation…
              </div>
            )}
            <div className="list">
              {merged.map((it) => (
                <ListRow
                  key={`${it.kind}-${it.id}`}
                  icon={it.kind === 'plugin'
                    ? <Package size={16} style={{ color: 'var(--text3)', marginTop: 2, flexShrink: 0 }} />
                    : <Server size={16} style={{ color: 'var(--text3)', marginTop: 2, flexShrink: 0 }} />}
                  onClick={() => navigate(it.kind === 'plugin' ? `/plugins/${it.slug}` : `/services/${it.slug}`)}
                  title={
                    <>
                      {it.name}
                      {type === 'all' && it.kind === 'service' && <Pill variant="acc">Service</Pill>}
                      {it.version && <Pill>v{it.version}</Pill>}
                    </>
                  }
                  description={it.description || 'Aucune description.'}
                  meta={[
                    it.categoryName && (
                      <span key="cat"><Tag size={12} /> {it.categoryName}</span>
                    ),
                    <span key="dl"><Download size={12} /> {it.count.toLocaleString('fr')}</span>,
                    it.rating > 0 && (
                      <span key="rating"><Star size={12} /> {it.rating.toFixed(1)} ({it.ratingCount})</span>
                    ),
                  ].filter(Boolean)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-8" style={{ flexWrap: 'wrap', gap: 12 }}>
              <span className="text-sm text-faint">
                {type === 'plugin' && total != null
                  ? `${pluginOffset + 1}–${Math.min(pluginOffset + LIMIT, total)} sur ${total.toLocaleString('fr')} plugins`
                  : `${merged.length} résultat${merged.length > 1 ? 's' : ''}`}
              </span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft size={14} /> Précédent
                </button>
                <button className="btn btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                  Suivant <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
