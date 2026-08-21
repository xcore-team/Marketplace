import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Send, Loader2, Save, X, Trash2, Server, Check, Globe, Lock } from 'lucide-react'
import { github as githubApi, services as servicesApi } from '../../api'
import { useToast } from '../../components/Toast'
import { StatusBadge, ScoreBar } from './shared'
import { RelativeTime, ListRow } from '../../components/ui'
import type { GHLink, GHRepo, GHTag, ServiceSummary, ServiceSubmission, ServiceCategory } from '../../types'

function MyServiceCard({ s, onEdited }: { s: ServiceSummary; onEdited: () => void }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(s.description ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(s.visibility === 'private' ? 'private' : 'public')

  const saveMutation = useMutation({
    mutationFn: () => servicesApi.update(s.slug, { description: desc || undefined, visibility }),
    onSuccess: () => { toast('Service mis à jour !', 'success'); setEditing(false); onEdited() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => servicesApi.delete(s.slug),
    onSuccess: () => { toast('Service supprimé.', 'info'); onEdited() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, height: '100%' }}>
      <div className="flex justify-between items-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="font-bold truncate" style={{ fontSize: 15 }}>{s.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-faint">v{s.latest_version ?? '—'}</span>
            {s.is_published ? <span className="text-xs font-bold text-acc">Publié</span> : <span className="text-xs text-faint">Draft</span>}
            {s.visibility === 'private' && <span className="text-xs text-faint flex items-center gap-1"><Lock size={10} /> Privé</span>}
          </div>
        </div>
        <Server size={16} style={{ color: 'var(--acc)', flexShrink: 0 }} />
      </div>

      {!editing ? (
        <>
          <p className="text-xs text-muted" style={{ lineHeight: 1.6, flex: 1 }}>{s.description || 'Pas de description fournie.'}</p>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/services/${s.slug}`)}>Voir</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setDesc(s.description ?? ''); setVisibility(s.visibility === 'private' ? 'private' : 'public'); setEditing(true) }}>Gérer</button>
            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }}
              onClick={() => { if (confirm(`Supprimer le service "${s.name}" ?`)) deleteMutation.mutate() }}><Trash2 size={14} /></button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea className="input" style={{ minHeight: 70, fontSize: 13 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="segmented" style={{ width: 'fit-content' }}>
            <button type="button" className={`segmented__item${visibility === 'public' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
              onClick={() => setVisibility('public')}><Globe size={11} /> Public</button>
            <button type="button" className={`segmented__item${visibility === 'private' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
              onClick={() => setVisibility('private')}><Lock size={11} /> Privé</button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ServicesPanel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [selectedRepo, setSelectedRepo] = useState<GHRepo | null>(null)
  const [repoSearch, setRepoSearch] = useState('')
  const [tag, setTag] = useState('')
  const [serviceVersion, setServiceVersion] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const { data: ghLink, isLoading: linkLoading } = useQuery<GHLink | null>({
    queryKey: ['github-link'],
    queryFn: async () => { try { return await githubApi.getLink() } catch { return null } },
  })

  // manifest=service.yaml : ne montre que les repos qui sont réellement des
  // extensions de service XCore, pas tous les repos GitHub du compte lié.
  const { data: repos, isLoading: reposLoading } = useQuery<GHRepo[]>({
    queryKey: ['github-repos', 'service.yaml'],
    queryFn: () => githubApi.repos(1, 'service.yaml'),
    enabled: !!ghLink,
  })

  const [repoOwner, repoNameOnly] = selectedRepo ? selectedRepo.full_name.split('/') : [null, null]
  const { data: repoTags, isLoading: tagsLoading } = useQuery<GHTag[]>({
    queryKey: ['github-tags', selectedRepo?.full_name],
    queryFn: () => githubApi.tags(repoOwner!, repoNameOnly!),
    enabled: !!selectedRepo,
    retry: false,
  })

  const { data: catsData } = useQuery<ServiceCategory[]>({ queryKey: ['service-categories'], queryFn: servicesApi.categories })
  const cats = catsData ?? []
  const toggleCategory = (id: string) => setCategoryIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))

  const { data: myServices, isLoading: myServicesLoading } = useQuery<ServiceSummary[]>({ queryKey: ['my-services'], queryFn: servicesApi.mine })

  const { data: serviceSubs, isLoading: subsLoading } = useQuery<ServiceSubmission[]>({
    queryKey: ['my-service-submissions'],
    queryFn: servicesApi.submissions.list,
    refetchInterval: (q) => {
      const list = q.state.data as ServiceSubmission[] | undefined
      return list?.some((s) => s.status === 'pending' || s.status === 'processing') ? 8000 : false
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => servicesApi.github.publish({
      full_name: selectedRepo!.full_name, tag, service_version: serviceVersion.trim(), category_ids: categoryIds, visibility,
    }),
    onSuccess: () => {
      toast('Service soumis ! Validation en cours…', 'success')
      queryClient.invalidateQueries({ queryKey: ['my-service-submissions'] })
      setSelectedRepo(null); setTag(''); setServiceVersion(''); setCategoryIds([]); setVisibility('public')
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const filteredRepos = (repos ?? []).filter((r) => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()))

  if (linkLoading) return <div className="panel"><div className="panel__body"><div className="page-loading" style={{ minHeight: 160 }}><div className="spinner" /></div></div></div>

  if (!ghLink) {
    return (
      <div className="empty">
        <div className="empty__icon"><Server size={40} strokeWidth={1.5} /></div>
        <div className="empty__title">Liez votre GitHub</div>
        <div className="empty__text">Rendez-vous dans l'onglet "Soumettre" pour lier votre compte GitHub — il sera aussi utilisé ici.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div className="panel"><div className="panel__body">
        <h3 className="font-bold mb-1" style={{ fontSize: 18 }}>Publier un service</h3>
        <p className="text-xs text-muted mb-4">La publication d'un service s'appuie sur un tag Git existant (release).</p>
        <div className="search-bar mb-4">
          <Search size={16} style={{ color: 'var(--text3)' }} />
          <input placeholder="Filtrer mes repositories GitHub…" value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)} />
        </div>
        {reposLoading ? (
          <div className="page-loading" style={{ minHeight: 120 }}><div className="spinner" /></div>
        ) : (
          <div className="list" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filteredRepos.map((repo) => (
              <ListRow
                key={repo.id}
                onClick={() => setSelectedRepo(repo)}
                selected={selectedRepo?.id === repo.id}
                title={repo.name}
                description={repo.full_name}
                side={selectedRepo?.id === repo.id ? <Check size={16} style={{ color: 'var(--acc)' }} strokeWidth={3} /> : undefined}
              />
            ))}
            {filteredRepos.length === 0 && (
              <div className="text-xs text-faint" style={{ padding: 16 }}>Aucun repository ne correspond à ce filtre.</div>
            )}
          </div>
        )}

        {selectedRepo && (
          <div className="panel panel--muted" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="input-wrap">
                <label className="input-label">Tag Git *</label>
                {tagsLoading ? (
                  <div className="text-xs text-faint flex items-center gap-1"><Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> Chargement…</div>
                ) : (repoTags?.length ?? 0) > 0 ? (
                  <select className="select" value={tag} onChange={(e) => { setTag(e.target.value); if (!serviceVersion) setServiceVersion(e.target.value.replace(/^v/, '')) }}>
                    <option value="">Choisir un tag…</option>
                    {repoTags!.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-faint">Aucun tag trouvé sur ce repo — publiez une release Git (tag) avant de soumettre ici.</p>
                )}
              </div>
              <div className="input-wrap">
                <label className="input-label">Version du service *</label>
                <input className="input" placeholder="e.g. 1.0.0" value={serviceVersion} onChange={(e) => setServiceVersion(e.target.value)} />
              </div>
            </div>
            <div className="input-wrap mb-4">
              <label className="input-label">Catégories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cats.map((c) => (
                  <div key={c.id} onClick={() => toggleCategory(c.id)} className={`badge ${categoryIds.includes(c.id) ? 'badge-acc' : 'badge-ghost'}`} style={{ cursor: 'pointer' }}>{c.name}</div>
                ))}
              </div>
            </div>
            <div className="input-wrap mb-4">
              <label className="input-label">Visibilité</label>
              <div className="segmented" style={{ width: 'fit-content' }}>
                <button type="button" className={`segmented__item${visibility === 'public' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setVisibility('public')}>
                  <Globe size={13} /> Public
                </button>
                <button type="button" className={`segmented__item${visibility === 'private' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setVisibility('private')}>
                  <Lock size={13} /> Privé
                </button>
              </div>
            </div>
            <button className="btn btn-primary" disabled={!tag || !serviceVersion.trim() || publishMutation.isPending} onClick={() => publishMutation.mutate()}>
              {publishMutation.isPending ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Traitement…</> : <><Send size={16} /> Lancer la publication</>}
            </button>
          </div>
        )}
      </div></div>

      <div>
        <h3 className="font-bold mb-3" style={{ fontSize: 18 }}>Mes services ({(myServices ?? []).length})</h3>
        {myServicesLoading ? (
          <div className="page-loading" style={{ minHeight: 120 }}><div className="spinner" /></div>
        ) : (myServices ?? []).length === 0 ? (
          <div className="empty"><div className="empty__text">Aucun service publié pour l'instant.</div></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {(myServices ?? []).map((s) => <MyServiceCard key={s.id} s={s} onEdited={() => queryClient.invalidateQueries({ queryKey: ['my-services'] })} />)}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold mb-3" style={{ fontSize: 18 }}>Historique des soumissions ({(serviceSubs ?? []).length})</h3>
        {subsLoading ? (
          <div className="page-loading" style={{ minHeight: 120 }}><div className="spinner" /></div>
        ) : (serviceSubs ?? []).length === 0 ? (
          <div className="empty"><div className="empty__text">Aucune soumission de service.</div></div>
        ) : (
          <div className="table-wrap">
            <table className="table ledger-table">
              <thead><tr><th>Service</th><th>Version</th><th>Statut</th><th>Score</th><th>Date</th></tr></thead>
              <tbody>
                {(serviceSubs ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="font-bold text-sm">{s.service_name}</td>
                    <td><span className="ledger-id">{s.service_version}</span></td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.anomaly_score != null ? <ScoreBar score={s.anomaly_score} /> : <span className="text-faint text-sm">—</span>}</td>
                    <td><span className="text-sm text-muted"><RelativeTime date={s.created_at} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
