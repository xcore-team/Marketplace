import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, Star, Download, Globe, GitBranch, Copy, Check,
  BookOpen, Wrench, History, MessageSquare, Server,
  ExternalLink, AlertTriangle, Shield, Loader2, Edit2, Save, X, Trash2,
} from 'lucide-react'
import { services as servicesApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { Tabs, Panel, AboutPanel, Pill, StatusIcon, RelativeTime } from '../../components/ui'
import type { TabItem } from '../../components/ui'
import type { ServiceRating, ServiceDoc, SubmissionReport, Service } from '../../types'

function StarRating({ value, onChange, readonly = false }: {
  value: number; onChange?: (v: number) => void; readonly?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`star${(hover || value) >= s ? ' filled' : ''}`}
          onClick={() => !readonly && onChange?.(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{ cursor: readonly ? 'default' : 'pointer' }}>★</span>
      ))}
    </div>
  )
}

function InstallBlock({ slug, version }: { slug: string; version?: string | null }) {
  const [copied, setCopied] = useState(false)
  const cmd = `xcli service install ${slug}${version ? `@${version}` : ''}`
  const copy = async () => { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">Installation</span>
        <span className="code-block__copy flex items-center gap-1" onClick={copy}>
          {copied ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
        </span>
      </div>
      <div className="code-block__body">
        <div className="code-comment"># via xcli</div>
        <div><span className="code-cmd">$ </span>{cmd}</div>
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return <div className="markdown-body"><ReactMarkdown>{content}</ReactMarkdown></div>
}

type Tab = 'apercu' | 'readme' | 'integration' | 'securite' | 'versions' | 'avis'

export default function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('apercu')
  const [myRating, setMyRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [showRatingForm, setShowRatingForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState('')
  const [homepage, setHomepage] = useState('')
  const [repository, setRepository] = useState('')

  const { data: service, isLoading, error } = useQuery<Service>({
    queryKey: ['service', slug],
    queryFn: () => servicesApi.get(slug!),
    enabled: !!slug,
  })

  const { data: reportData } = useQuery({
    queryKey: ['service-security', slug, service?.latest_version],
    queryFn: async () => {
      const subs = await servicesApi.submissions.list()
      const approved = subs.find((s) => s.service_name === service?.name && s.status === 'approved')
      if (approved) return servicesApi.submissions.report(approved.id)
      return null
    },
    enabled: !!service?.latest_version,
  })

  const { data: docsData, isLoading: docsLoading } = useQuery<ServiceDoc>({
    queryKey: ['service-docs', slug],
    queryFn: () => servicesApi.docs.get(slug!),
    enabled: !!slug,
    retry: false,
  })

  const { data: ratings } = useQuery<ServiceRating[]>({ queryKey: ['service-ratings', slug], queryFn: () => servicesApi.ratings(slug!), enabled: !!slug })

  const { data: myRatingData } = useQuery<ServiceRating>({
    queryKey: ['my-service-rating', slug],
    queryFn: () => servicesApi.myRating(slug!),
    enabled: !!slug && !!user,
    retry: false,
  })

  const rateMutation = useMutation({
    mutationFn: () => servicesApi.rate(slug!, myRating, ratingComment || undefined),
    onSuccess: () => {
      toast('Avis soumis !', 'success')
      setShowRatingForm(false)
      queryClient.invalidateQueries({ queryKey: ['service-ratings', slug] })
      queryClient.invalidateQueries({ queryKey: ['my-service-rating', slug] })
      queryClient.invalidateQueries({ queryKey: ['service', slug] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const saveMutation = useMutation({
    mutationFn: () => servicesApi.update(slug!, { description: desc || undefined, homepage: homepage || undefined, repository: repository || undefined }),
    onSuccess: () => { toast('Service mis à jour !', 'success'); setEditing(false); queryClient.invalidateQueries({ queryKey: ['service', slug] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => servicesApi.delete(slug!),
    onSuccess: () => { toast('Service supprimé.', 'info'); navigate('/dashboard') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  if (isLoading) return <PageLoading text="Chargement du service…" />
  if (error || !service) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><Server size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Service introuvable</div>
          <div className="empty__text">Ce service n'existe pas ou n'est plus disponible.</div>
          <button className="btn btn-primary" onClick={() => navigate('/services')}>Retour au catalogue</button>
        </div>
      </div>
    )
  }

  const isOwner = !!user && user.id === service.developer_id
  const hasReadme = !!docsData?.readme
  const hasIntegration = !!docsData?.integration
  const ratingList = ratings ?? []
  const report = reportData as SubmissionReport | null | undefined

  const tabs: TabItem<Tab>[] = [
    { id: 'apercu', label: 'Aperçu', icon: <Server size={14} /> },
    { id: 'readme', label: 'Documentation', icon: <BookOpen size={14} />, hidden: !hasReadme && !docsLoading },
    { id: 'securite', label: 'Sécurité', icon: <Shield size={14} /> },
    { id: 'integration', label: 'Intégration', icon: <Wrench size={14} />, hidden: !hasIntegration && !docsLoading },
    { id: 'versions', label: 'Versions', icon: <History size={14} />, count: service.versions?.length || undefined },
    { id: 'avis', label: 'Avis', icon: <MessageSquare size={14} />, count: ratingList.length },
  ]

  return (
    <div>
      <div className="detail-hero">
        <div className="detail-hero__inner">
          <div className="detail-hero__back" onClick={() => navigate('/services')}>
            <ArrowLeft size={14} /> Retour au catalogue
          </div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Réf. {service.slug}</div>
          <h1 className="detail-hero__name" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {service.name}
            {service.latest_version && <Pill>v{service.latest_version}</Pill>}
            <Pill variant={service.is_published ? 'success' : 'warning'}>{service.is_published ? 'Publié' : 'Brouillon'}</Pill>
          </h1>
          <div className="detail-hero__meta" style={{ marginTop: 12 }}>
            {service.avg_rating > 0 && (
              <div className="flex items-center gap-2">
                <StarRating value={Math.round(service.avg_rating)} readonly />
                <span className="text-muted text-sm">{service.avg_rating.toFixed(1)} ({service.rating_count} avis)</span>
              </div>
            )}
            <span className="text-muted text-sm flex items-center gap-1"><Download size={13} /> {(service.install_count ?? 0).toLocaleString('fr')} installations</span>
            {service.homepage && <a href={service.homepage} target="_blank" rel="noopener noreferrer" className="text-sm text-acc flex items-center gap-1"><Globe size={13} /> Site web <ExternalLink size={11} /></a>}
            {service.repository && <a href={service.repository} target="_blank" rel="noopener noreferrer" className="text-sm text-acc flex items-center gap-1"><GitBranch size={13} /> Code source <ExternalLink size={11} /></a>}
          </div>
        </div>
      </div>

      <div className="detail-tabs-bar">
        <Tabs items={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="detail-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {tab === 'apercu' && (
            <>
              <InstallBlock slug={service.slug} version={service.latest_version} />
              {service.description && <Panel title="Description"><p style={{ color: 'var(--text2)', lineHeight: 1.8, fontSize: 14, margin: 0 }}>{service.description}</p></Panel>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Installations', value: (service.install_count ?? 0).toLocaleString('fr'), icon: <Download size={16} /> },
                  { label: 'Note moyenne', value: service.avg_rating > 0 ? `${service.avg_rating.toFixed(1)} / 5` : '—', icon: <Star size={16} /> },
                  { label: 'Versions', value: service.versions?.length ?? 0, icon: <History size={16} /> },
                ].map(({ label, value, icon }) => (
                  <Panel key={label}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--acc)', marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                      <div className="font-bold" style={{ fontSize: 20, color: 'var(--acc)' }}>{value}</div>
                      <div className="text-xs text-faint" style={{ marginTop: 4 }}>{label}</div>
                    </div>
                  </Panel>
                ))}
              </div>
            </>
          )}

          {tab === 'readme' && (
            docsLoading ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /></div>
              : docsData?.readme ? <Panel><MarkdownContent content={docsData.readme} /></Panel>
                : <div className="empty"><div className="empty__title">Pas de README</div></div>
          )}

          {tab === 'integration' && (
            docsLoading ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /></div>
              : docsData?.integration ? <Panel><MarkdownContent content={docsData.integration} /></Panel>
                : <div className="empty"><div className="empty__title">Pas de guide d'intégration</div></div>
          )}

          {tab === 'securite' && (
            <Panel title={<span className="flex items-center gap-2"><Shield size={16} style={{ color: 'var(--acc)' }} /> Rapport de sécurité Hub — v{service.latest_version}</span>}>
              {report ? (
                <div className="list" style={{ border: 'none' }}>
                  {report.gates?.map((gate) => (
                    <div className="list-row" key={gate.gate} style={{ cursor: 'default' }}>
                      <StatusIcon status={gate.status} />
                      <div className="list-row__main"><div className="list-row__title" style={{ color: 'var(--text)' }}>{gate.gate}</div></div>
                      <div className="list-row__side"><Pill variant={gate.status === 'passed' ? 'success' : 'warning'}>{gate.status === 'passed' ? 'OK' : gate.status}</Pill></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty"><Loader2 size={24} className="spin mb-4" /><div className="empty__text">Génération du rapport public en cours…</div></div>
              )}
            </Panel>
          )}

          {tab === 'versions' && (
            <Panel title={`Historique des versions (${service.versions?.length ?? 0})`}>
              {(!service.versions || service.versions.length === 0) ? (
                <div className="text-faint text-sm" style={{ padding: '24px 0' }}>Aucune version disponible.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {service.versions.map((v, i) => (
                    <div key={v.id} className="version-row">
                      <div className="version-row__indicator">
                        <div className={`version-row__dot${i === 0 ? ' latest' : ''}`} />
                        {i < service.versions.length - 1 && <div className="version-row__line" />}
                      </div>
                      <div className="version-row__content">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold" style={{ color: i === 0 ? 'var(--acc)' : 'var(--text)' }}>v{v.version}</span>
                          {i === 0 && <Pill variant="acc">Dernière</Pill>}
                          {v.is_yanked && <Pill variant="danger">Retiré</Pill>}
                          <span className="text-faint text-xs"><RelativeTime date={v.created_at} /></span>
                        </div>
                        {v.changelog && <p className="text-sm text-muted" style={{ marginTop: 4 }}>{v.changelog}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {tab === 'avis' && (
            <Panel
              title={`Avis des utilisateurs (${ratingList.length})`}
              action={
                user && !myRatingData ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowRatingForm(!showRatingForm)}>
                    {showRatingForm ? 'Annuler' : <><Star size={13} /> Laisser un avis</>}
                  </button>
                ) : !user ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/auth?mode=login')}>Connexion pour noter</button>
                ) : null
              }
            >
              {showRatingForm && (
                <div className="rating-form">
                  <div className="mb-4">
                    <div className="input-label mb-2">Votre note</div>
                    <StarRating value={myRating} onChange={setMyRating} />
                  </div>
                  <div className="input-wrap mb-4">
                    <label className="input-label">Commentaire (optionnel)</label>
                    <textarea className="textarea" rows={3} value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={myRating === 0 || rateMutation.isPending} onClick={() => rateMutation.mutate()}>
                    {rateMutation.isPending ? 'Envoi…' : 'Soumettre mon avis'}
                  </button>
                </div>
              )}

              {myRatingData && (
                <div className="my-rating-box">
                  <div className="flex items-center gap-2 mb-1">
                    <StarRating value={myRatingData.score} readonly />
                    <span className="text-xs text-acc font-bold">Mon avis</span>
                  </div>
                  {myRatingData.comment && <p className="text-sm text-muted">{myRatingData.comment}</p>}
                </div>
              )}

              {ratingList.length === 0 ? (
                <div className="text-center text-faint text-sm" style={{ padding: '24px 0' }}>Aucun avis pour l'instant.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ratingList.map((r) => (
                    <div key={r.id} className="rating-item">
                      <div className="flex items-center gap-2 mb-1">
                        <StarRating value={r.score} readonly />
                        <span className="text-xs text-faint"><RelativeTime date={r.created_at} /></span>
                      </div>
                      {r.comment && <p className="text-sm text-muted">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          <AboutPanel
            description={service.description}
            topics={service.categories?.map((c) => c.name)}
            stats={[
              { value: (service.install_count ?? 0).toLocaleString('fr'), label: 'installations' },
              { value: service.avg_rating > 0 ? service.avg_rating.toFixed(1) : '—', label: `note (${service.rating_count})` },
              { value: service.versions?.length ?? 0, label: 'versions' },
            ]}
            links={[
              service.homepage && { icon: <Globe size={13} />, content: 'Site officiel', href: service.homepage },
              service.repository && { icon: <GitBranch size={13} />, content: 'Code source', href: service.repository },
            ].filter(Boolean) as any}
          />

          {isOwner && (
            <Panel title="Gestion (propriétaire)">
              {!editing ? (
                <button className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center' }}
                  onClick={() => { setDesc(service.description ?? ''); setHomepage(service.homepage ?? ''); setRepository(service.repository ?? ''); setEditing(true) }}>
                  <Edit2 size={13} /> Modifier
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <textarea className="input" style={{ minHeight: 70, fontSize: 13 }} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <input className="input" style={{ fontSize: 13 }} placeholder="Site web" value={homepage} onChange={(e) => setHomepage(e.target.value)} />
                  <input className="input" style={{ fontSize: 13 }} placeholder="Repository" value={repository} onChange={(e) => setRepository(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                      {saveMutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}><X size={14} /></button>
                  </div>
                </div>
              )}
              <button className="btn btn-secondary btn-sm w-full mt-3" style={{ justifyContent: 'center', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                disabled={deleteMutation.isPending}
                onClick={() => { if (confirm(`Supprimer définitivement "${service.name}" ?`)) deleteMutation.mutate() }}>
                <Trash2 size={13} /> Supprimer le service
              </button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
