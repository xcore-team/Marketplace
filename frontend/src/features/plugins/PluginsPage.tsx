import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight, Package, Download, Star, Tag } from 'lucide-react'
import { plugins as pluginsApi, categories as catsApi } from '../../api'
import { ListRow, Pill } from '../../components/ui'
import type { Category, PagedResponse, Plugin } from '../../types'

const LIMIT = 24

export default function PluginsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [inputVal, setInputVal] = useState(search)
  const [categoryId, setCategoryId] = useState(searchParams.get('category') ?? '')
  const [sortBy, setSortBy] = useState(searchParams.get('sort') ?? 'newest')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    setSearchParams((p) => {
      if (search) p.set('q', search); else p.delete('q')
      if (categoryId) p.set('category', categoryId); else p.delete('category')
      if (sortBy !== 'newest') p.set('sort', sortBy); else p.delete('sort')
      return p
    }, { replace: true })
  }, [search, categoryId, sortBy, setSearchParams])

  const { data: catsData } = useQuery({
    queryKey: ['categories'],
    queryFn: catsApi.list,
  })

  const { data: pluginsData, isLoading, isFetching } = useQuery({
    queryKey: ['plugins', search, categoryId, sortBy, offset],
    queryFn: () => pluginsApi.list({ search, category_id: categoryId, limit: LIMIT, offset, sort: sortBy }),
    placeholderData: (prev) => prev,
  })

  const cats: Category[] = Array.isArray(catsData)
    ? catsData
    : (catsData as PagedResponse<Category>)?.items ?? []

  const items: Plugin[] = (pluginsData as PagedResponse<Plugin>)?.items ?? []
  const total = (pluginsData as PagedResponse<Plugin>)?.total ?? 0
  const hasMore = (pluginsData as PagedResponse<Plugin>)?.has_more ?? false

  const doSearch = useCallback(() => {
    setSearch(inputVal.trim())
    setOffset(0)
  }, [inputVal])

  const selectCat = (id: string) => {
    setCategoryId(id === categoryId ? '' : id)
    setOffset(0)
  }

  const clearFilters = () => {
    setSearch(''); setInputVal(''); setCategoryId(''); setSortBy('newest'); setOffset(0)
  }

  const hasFilters = search || categoryId || sortBy !== 'newest'

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Catalogue XCoreHub</div>
          <h1 className="dash-header__title">
            Découvrez les extensions
            {total > 0 && (
              <span className="text-muted" style={{ fontSize: '45%', fontWeight: 400, marginLeft: 12 }}>
                ({total.toLocaleString('fr')})
              </span>
            )}
          </h1>
        </div>
      </div>

      <div className="section">
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
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setInputVal(''); setSearch(''); setOffset(0) }} style={{ padding: '4px 6px', color: 'var(--text3)' }}>
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 180, background: 'var(--surface2)' }}
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setOffset(0) }}
          >
            <option value="newest">Plus récents</option>
            <option value="downloads">Plus téléchargés</option>
            <option value="rating">Mieux notés</option>
            <option value="security">Score sécurité</option>
          </select>
        </div>

        {cats.length > 0 && (
          <div className="filter-bar mb-6">
            <div
              className={`filter-pill${!categoryId ? ' active' : ''}`}
              onClick={() => selectCat('')}
            >
              Tout
            </div>
            {cats.map((cat) => (
              <div
                key={cat.id}
                className={`filter-pill${categoryId === cat.id ? ' active' : ''}`}
                onClick={() => selectCat(cat.id)}
              >
                {cat.name}
                {cat.plugin_count != null && (
                  <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '11px' }}>
                    {cat.plugin_count}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {(isLoading || isFetching) && items.length === 0 ? (
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
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Search size={40} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucun résultat</div>
            <div className="empty__text">
              {hasFilters
                ? 'Aucun plugin ne correspond à votre recherche.'
                : "Le catalogue est vide pour l'instant."}
            </div>
            {hasFilters && (
              <button className="btn btn-secondary" onClick={clearFilters}>
                Effacer les filtres
              </button>
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
              {items.map((p) => (
                <ListRow
                  key={p.id}
                  icon={<Package size={16} style={{ color: 'var(--text3)', marginTop: 2, flexShrink: 0 }} />}
                  onClick={() => navigate(`/plugins/${p.slug}`)}
                  title={
                    <>
                      {p.name}
                      {p.latest_version && <Pill>v{p.latest_version}</Pill>}
                    </>
                  }
                  description={p.description || 'Aucune description.'}
                  meta={[
                    p.category && (
                      <span key="cat"><Tag size={12} /> {p.category.name}</span>
                    ),
                    <span key="dl"><Download size={12} /> {p.download_count.toLocaleString('fr')}</span>,
                    (p.avg_rating ?? p.average_score ?? 0) > 0 && (
                      <span key="rating"><Star size={12} /> {(p.avg_rating ?? p.average_score ?? 0).toFixed(1)} ({p.rating_count ?? 0})</span>
                    ),
                  ].filter(Boolean)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-8" style={{ flexWrap: 'wrap', gap: 12 }}>
              <span className="text-sm text-faint">
                {offset + 1}–{Math.min(offset + LIMIT, total)} sur {total.toLocaleString('fr')} plugins
              </span>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                >
                  <ChevronLeft size={14} /> Précédent
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!hasMore}
                  onClick={() => setOffset(offset + LIMIT)}
                >
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
