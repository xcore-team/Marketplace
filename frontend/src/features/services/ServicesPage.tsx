import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight, Server, Download, Star, Tag } from 'lucide-react'
import { services as servicesApi } from '../../api'
import { ListRow, Pill } from '../../components/ui'
import type { ServiceCategory, ServiceSummary } from '../../types'

const LIMIT = 24

export default function ServicesPage() {
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

  const { data: cats } = useQuery<ServiceCategory[]>({ queryKey: ['service-categories'], queryFn: servicesApi.categories })

  const { data: items, isLoading, isFetching } = useQuery<ServiceSummary[]>({
    queryKey: ['services', search, categoryId, sortBy, offset],
    queryFn: () => servicesApi.list({ search, category_id: categoryId, limit: LIMIT, offset, sort: sortBy }),
    placeholderData: (prev) => prev,
  })

  const list = items ?? []
  const catList = cats ?? []

  const doSearch = useCallback(() => { setSearch(inputVal.trim()); setOffset(0) }, [inputVal])
  const selectCat = (id: string) => { setCategoryId(id === categoryId ? '' : id); setOffset(0) }
  const clearFilters = () => { setSearch(''); setInputVal(''); setCategoryId(''); setSortBy('newest'); setOffset(0) }
  const hasFilters = search || categoryId || sortBy !== 'newest'

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Catalogue XCoreHub</div>
          <h1 className="dash-header__title">
            Découvrez les services
            {list.length > 0 && <span className="text-muted" style={{ fontSize: '45%', fontWeight: 400, marginLeft: 12 }}>({list.length})</span>}
          </h1>
        </div>
      </div>

      <div className="section">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 280 }}>
            <Search size={16} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <input placeholder="Ex: Auth, Stockage, Queue…" value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
            {inputVal && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setInputVal(''); setSearch(''); setOffset(0) }} style={{ padding: '4px 6px', color: 'var(--text3)' }}>
                <X size={14} />
              </button>
            )}
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 180 }} value={sortBy} onChange={(e) => { setSortBy(e.target.value); setOffset(0) }}>
            <option value="newest">Plus récents</option>
            <option value="downloads">Plus installés</option>
            <option value="rating">Mieux notés</option>
          </select>
        </div>

        {catList.length > 0 && (
          <div className="filter-bar mb-6">
            <div className={`filter-pill${!categoryId ? ' active' : ''}`} onClick={() => selectCat('')}>Tout</div>
            {catList.map((cat) => (
              <div key={cat.id} className={`filter-pill${categoryId === cat.id ? ' active' : ''}`} onClick={() => selectCat(cat.id)}>{cat.name}</div>
            ))}
          </div>
        )}

        {(isLoading || isFetching) && list.length === 0 ? (
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
        ) : list.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Search size={40} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucun résultat</div>
            <div className="empty__text">{hasFilters ? 'Aucun service ne correspond à votre recherche.' : "Le catalogue de services est vide pour l'instant."}</div>
            {hasFilters && <button className="btn btn-secondary" onClick={clearFilters}>Effacer les filtres</button>}
          </div>
        ) : (
          <>
            {isFetching && <div className="flex items-center gap-2 mb-4 text-muted text-sm"><div className="spinner" /> Actualisation…</div>}
            <div className="list">
              {list.map((s) => (
                <ListRow
                  key={s.id}
                  icon={<Server size={16} style={{ color: 'var(--text3)', marginTop: 2, flexShrink: 0 }} />}
                  onClick={() => navigate(`/services/${s.slug}`)}
                  title={<>{s.name}{s.latest_version && <Pill>v{s.latest_version}</Pill>}</>}
                  description={s.description || 'Aucune description.'}
                  meta={[
                    s.categories?.[0] && <span key="cat"><Tag size={12} /> {s.categories[0].name}</span>,
                    <span key="dl"><Download size={12} /> {(s.install_count ?? 0).toLocaleString('fr')}</span>,
                    s.avg_rating > 0 && <span key="rating"><Star size={12} /> {s.avg_rating.toFixed(1)} ({s.rating_count})</span>,
                  ].filter(Boolean)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-8" style={{ flexWrap: 'wrap', gap: 12 }}>
              <span className="text-sm text-faint">{offset + 1}–{offset + list.length} services</span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft size={14} /> Précédent</button>
                <button className="btn btn-secondary btn-sm" disabled={list.length < LIMIT} onClick={() => setOffset(offset + LIMIT)}>Suivant <ChevronRight size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
