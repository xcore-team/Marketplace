import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, Star, Download, Globe, GitBranch, Copy, Check,
  BookOpen, Wrench, Users, History, MessageSquare, Package,
  ExternalLink, AlertTriangle, Shield, Loader2, Tag,
} from 'lucide-react'
import { plugins as pluginsApi, docs as docsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { Tabs, Panel, AboutPanel, Pill, StatusIcon, RelativeTime, Avatar } from '../../components/ui'
import type { TabItem } from '../../components/ui'
import type { Rating, PluginDoc, SubmissionReport, PipelineGate } from '../../types'

// ── Star Rating ────────────────────────────────────────────────────────────────
function StarRating({ value, onChange, readonly = false }: {
  value: number; onChange?: (v: number) => void; readonly?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={`star${(hover || value) >= s ? ' filled' : ''}`}
          onClick={() => !readonly && onChange?.(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{ cursor: readonly ? 'default' : 'pointer' }}
        >★</span>
      ))}
    </div>
  )
}

// ── Install block ──────────────────────────────────────────────────────────────
function CodeBlock({ slug, version }: { slug: string; version?: string }) {
  const [copied, setCopied] = useState(false)
  const cmd = `xcli install ${slug}${version ? `@${version}` : ''}`
  const copy = async () => {
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">Installation</span>
        <span className="code-block__copy flex items-center gap-1" onClick={copy}>
          {copied ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
        </span>
      </div>
      <div className="code-block__body">
        <div className="code-comment"># via xcli (recommandé)</div>
        <div><span className="code-cmd">$ </span>{cmd}</div>
        <br />
        <div className="code-comment"># via pip</div>
        <div><span className="code-cmd">$ </span>pip install xcore-{slug}</div>
      </div>
    </div>
  )
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

// ── Contributor card ───────────────────────────────────────────────────────────
function ContributorSection({ contributor }: { contributor: Record<string, unknown> }) {
  const maintainers = (contributor.maintainers ?? contributor.contributors ?? []) as unknown[]
  const name = contributor.name as string | undefined
  const description = contributor.description as string | undefined
  const license = contributor.license as string | undefined
  const homepage = contributor.homepage as string | undefined
  const repository = contributor.repository as string | undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(name || description) && (
        <Panel title="Projet">
          {name && <div className="font-bold" style={{ fontSize: 18, marginBottom: 8 }}>{name}</div>}
          {description && <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{description}</p>}
          <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            {license && <Pill>{license}</Pill>}
            {homepage && (
              <a href={homepage} target="_blank" rel="noreferrer"><Pill variant="acc" icon={<Globe size={11} />}>Site web</Pill></a>
            )}
            {repository && (
              <a href={repository} target="_blank" rel="noreferrer"><Pill icon={<GitBranch size={11} />}>Repository</Pill></a>
            )}
          </div>
        </Panel>
      )}

      {Array.isArray(maintainers) && maintainers.length > 0 && (
        <Panel title={`Contributeurs (${maintainers.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {(maintainers as Record<string, unknown>[]).map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <Avatar name={String(m.name ?? m.login ?? '?')} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-bold text-sm">{String(m.name ?? m.login ?? 'Anonyme')}</div>
                  {m.email != null && <div className="text-xs text-faint truncate">{String(m.email)}</div>}
                  {m.role != null && <div className="text-xs" style={{ color: 'var(--acc)', marginTop: 2 }}>{String(m.role)}</div>}
                  {m.github != null && (
                    <a href={`https://github.com/${m.github}`} target="_blank" rel="noreferrer"
                      className="text-xs text-faint" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                      <GitBranch size={10} /> @{String(m.github)}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Raw fields not covered above */}
      {Object.entries(contributor)
        .filter(([k]) => !['maintainers', 'contributors', 'name', 'description', 'license', 'homepage', 'repository'].includes(k))
        .map(([k, v]) => (
          <Panel title={k} key={k}>
            <pre style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
              {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
            </pre>
          </Panel>
        ))
      }
    </div>
  )
}

// ── Pipeline gate row ────────────────────────────────────────────────────────
function GateRow({ gate }: { gate: PipelineGate }) {
  const passed = gate.status === 'passed'
  const findingCount = gate.findings?.length ?? 0
  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <StatusIcon status={gate.status} />
      <div className="list-row__main">
        <div className="list-row__title" style={{ color: 'var(--text)' }}>{gate.gate}</div>
        {findingCount > 0 && (
          <div className="list-row__meta">
            <span>{findingCount} finding{findingCount > 1 ? 's' : ''} détecté{findingCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <div className="list-row__side">
        {gate.anomaly_score > 0 && (
          <span className="font-mono text-xs" style={{ color: gate.anomaly_score >= 40 ? 'var(--danger)' : 'var(--warning)' }}>+{gate.anomaly_score}</span>
        )}
        <Pill variant={passed ? 'success' : 'warning'}>{passed ? 'OK' : gate.status}</Pill>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
type Tab = 'apercu' | 'readme' | 'integration' | 'contributeurs' | 'versions' | 'avis' | 'securite'

export default function PluginDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('apercu')
  const [myRating, setMyRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [showRatingForm, setShowRatingForm] = useState(false)

  const { data: plugin, isLoading, error } = useQuery({
    queryKey: ['plugin', slug],
    queryFn: () => pluginsApi.get(slug!),
    enabled: !!slug,
  })

  // Fetch security report for the latest version
  const { data: reportData } = useQuery({
    queryKey: ['plugin-security', slug, plugin?.latest_version],
    queryFn: async () => {
      const subs = await pluginsApi.submissions(slug!)
      const approved = subs.find(s => s.status === 'approved')
      if (approved) return pluginsApi.report(approved.id)
      return null
    },
    enabled: !!plugin?.latest_version,
  })

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['plugin-docs', slug],
    queryFn: () => docsApi.get(slug!),
    enabled: !!slug,
    retry: false,
  })

  const { data: ratingsData } = useQuery({
    queryKey: ['plugin-ratings', slug],
    queryFn: () => pluginsApi.ratings(slug!),
    enabled: !!slug,
  })

  const { data: myRatingData } = useQuery({
    queryKey: ['my-rating', slug],
    queryFn: () => pluginsApi.myRating(slug!),
    enabled: !!slug && !!user,
    retry: false,
  })

  const rateMutation = useMutation({
    mutationFn: () => pluginsApi.rate(slug!, myRating, ratingComment || undefined),
    onSuccess: () => {
      toast('Avis soumis !', 'success')
      setShowRatingForm(false)
      queryClient.invalidateQueries({ queryKey: ['plugin-ratings', slug] })
      queryClient.invalidateQueries({ queryKey: ['my-rating', slug] })
      queryClient.invalidateQueries({ queryKey: ['plugin', slug] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const pluginDoc = docsData as PluginDoc | undefined
  const ratings: Rating[] = (ratingsData as { items?: Rating[] })?.items ?? (ratingsData as unknown as Rating[]) ?? []
  const existingRating = myRatingData as Rating | undefined

  if (isLoading) return <PageLoading text="Chargement du plugin…" />
  if (error || !plugin) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><Package size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Plugin introuvable</div>
          <div className="empty__text">Ce plugin n'existe pas ou n'est plus disponible.</div>
          <button className="btn btn-primary" onClick={() => navigate('/plugins')}>Retour au catalogue</button>
        </div>
      </div>
    )
  }

  const hasReadme = !!pluginDoc?.readme
  const hasIntegration = !!pluginDoc?.integration
  const hasContributor = !!pluginDoc?.contributor
  const avgRating = plugin.avg_rating ?? plugin.average_score ?? 0
  const report = reportData as SubmissionReport | null | undefined

  const tabs: TabItem<Tab>[] = [
    { id: 'apercu', label: 'Aperçu', icon: <Package size={14} /> },
    { id: 'readme', label: 'Documentation', icon: <BookOpen size={14} />, hidden: !hasReadme && !docsLoading },
    { id: 'securite', label: 'Sécurité', icon: <Shield size={14} /> },
    { id: 'integration', label: 'Intégration', icon: <Wrench size={14} />, hidden: !hasIntegration && !docsLoading },
    { id: 'contributeurs', label: 'Contributeurs', icon: <Users size={14} />, hidden: !hasContributor && !docsLoading },
    { id: 'versions', label: 'Versions', icon: <History size={14} />, count: plugin.versions?.length || undefined },
    { id: 'avis', label: 'Avis', icon: <MessageSquare size={14} />, count: (ratingsData as any)?.total ?? ratings.length },
  ]

  return (
    <div>
      {/* Header */}
      <div className="detail-hero">
        <div className="detail-hero__inner">
          <div className="detail-hero__back" onClick={() => navigate('/plugins')}>
            <ArrowLeft size={14} /> Retour au catalogue
          </div>

          <div className="eyebrow" style={{ marginBottom: 8 }}>Réf. {plugin.slug}</div>
          <h1 className="detail-hero__name" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {plugin.name}
            {plugin.latest_version && <Pill>v{plugin.latest_version}</Pill>}
            <Pill variant={plugin.is_published ? 'success' : 'warning'}>{plugin.is_published ? 'Publié' : 'Brouillon'}</Pill>
          </h1>

          <div className="detail-hero__meta" style={{ marginTop: 12 }}>
            {avgRating > 0 && (
              <div className="flex items-center gap-2">
                <StarRating value={Math.round(avgRating)} readonly />
                <span className="text-muted text-sm">{avgRating.toFixed(1)} ({plugin.rating_count ?? 0} avis)</span>
              </div>
            )}
            <span className="text-muted text-sm flex items-center gap-1">
              <Download size={13} /> {(plugin.download_count ?? 0).toLocaleString('fr')} téléchargements
            </span>
            {plugin.homepage && (
              <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="text-sm text-acc flex items-center gap-1">
                <Globe size={13} /> Site web <ExternalLink size={11} />
              </a>
            )}
            {plugin.repository && (
              <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="text-sm text-acc flex items-center gap-1">
                <GitBranch size={13} /> Code source <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="detail-tabs-bar">
        <Tabs items={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Body */}
      <div className="detail-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* ── Aperçu ── */}
          {tab === 'apercu' && (
            <>
              <CodeBlock slug={plugin.slug} version={plugin.latest_version} />
              {plugin.description && (
                <Panel title="Description">
                  <p style={{ color: 'var(--text2)', lineHeight: 1.8, fontSize: 14, margin: 0 }}>{plugin.description}</p>
                </Panel>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Téléchargements', value: (plugin.download_count ?? 0).toLocaleString('fr'), icon: <Download size={16} /> },
                  { label: 'Note moyenne', value: avgRating > 0 ? `${avgRating.toFixed(1)} / 5` : '—', icon: <Star size={16} /> },
                  { label: 'Versions', value: plugin.versions?.length ?? 0, icon: <History size={16} /> },
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

          {/* ── README ── */}
          {tab === 'readme' && (
            docsLoading
              ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /><span className="text-muted text-sm">Chargement de la documentation…</span></div>
              : pluginDoc?.readme
                ? <Panel><MarkdownContent content={pluginDoc.readme} /></Panel>
                : <div className="empty"><div className="empty__icon"><BookOpen size={40} strokeWidth={1.5} /></div><div className="empty__title">Pas de README</div><div className="empty__text">Ce plugin ne contient pas de documentation README.md.</div></div>
          )}

          {/* ── Intégration ── */}
          {tab === 'integration' && (
            docsLoading
              ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /><span className="text-muted text-sm">Chargement…</span></div>
              : pluginDoc?.integration
                ? <Panel><MarkdownContent content={pluginDoc.integration} /></Panel>
                : <div className="empty"><div className="empty__icon"><Wrench size={40} strokeWidth={1.5} /></div><div className="empty__title">Pas de guide d'intégration</div><div className="empty__text">Ce plugin ne contient pas de fichier integration.md.</div></div>
          )}

          {/* ── Contributeurs ── */}
          {tab === 'contributeurs' && (
            docsLoading
              ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /><span className="text-muted text-sm">Chargement…</span></div>
              : pluginDoc?.contributor
                ? <ContributorSection contributor={pluginDoc.contributor} />
                : <div className="empty"><div className="empty__icon"><Users size={40} strokeWidth={1.5} /></div><div className="empty__title">Pas de contributors</div><div className="empty__text">Ce plugin ne contient pas de fichier contributor.yaml.</div></div>
          )}

          {/* ── Security ── */}
          {tab === 'securite' && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <Shield size={16} style={{ color: 'var(--acc)' }} />
                  Rapport de sécurité Hub — v{plugin.latest_version}
                </span>
              }
            >
              {report ? (
                <div className="list" style={{ border: 'none' }}>
                  {report.gates?.map((gate) => <GateRow key={gate.gate} gate={gate} />)}
                </div>
              ) : (
                <div className="empty">
                  <Loader2 size={24} className="spin mb-4" />
                  <div className="empty__text">Génération du rapport public en cours…</div>
                </div>
              )}
            </Panel>
          )}

          {/* ── Versions ── */}
          {tab === 'versions' && (
            <Panel title={`Historique des versions (${plugin.versions?.length ?? 0})`}>
              {(!plugin.versions || plugin.versions.length === 0) ? (
                <div className="text-faint text-sm" style={{ padding: '24px 0' }}>Aucune version disponible.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {plugin.versions.map((v, i) => (
                    <div key={v.id} className="version-row">
                      <div className="version-row__indicator">
                        <div className={`version-row__dot${i === 0 ? ' latest' : ''}`} />
                        {i < plugin.versions!.length - 1 && <div className="version-row__line" />}
                      </div>
                      <div className="version-row__content">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold" style={{ color: i === 0 ? 'var(--acc)' : 'var(--text)' }}>v{v.version}</span>
                          {i === 0 && <Pill variant="acc">Dernière</Pill>}
                          {v.is_yanked && <Pill variant="danger">Retiré</Pill>}
                          {v.is_stable && !v.is_yanked && <Pill variant="success">Stable</Pill>}
                          <span className="text-faint text-xs"><RelativeTime date={v.created_at} /></span>
                          {v.anomaly_score != null && (
                            <span className="text-xs font-mono" style={{ color: v.anomaly_score < 20 ? 'var(--success)' : v.anomaly_score < 50 ? 'var(--warning)' : 'var(--danger)' }}>
                              score: {v.anomaly_score}
                            </span>
                          )}
                        </div>
                        {v.changelog && <p className="text-sm text-muted" style={{ marginTop: 4 }}>{v.changelog}</p>}
                        {v.is_yanked && v.yanked_reason && (
                          <div className="flex items-center gap-1 mt-1" style={{ color: 'var(--danger)', fontSize: 12 }}>
                            <AlertTriangle size={11} /> {v.yanked_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Avis ── */}
          {tab === 'avis' && (
            <Panel
              title={`Avis des utilisateurs (${(ratingsData as any)?.total ?? ratings.length})`}
              action={
                user && !existingRating ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowRatingForm(!showRatingForm)}>
                    {showRatingForm ? 'Annuler' : <><Star size={13} /> Laisser un avis</>}
                  </button>
                ) : !user ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/auth?mode=login')}>
                    Connexion pour noter
                  </button>
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
                    <textarea className="textarea" placeholder="Partagez votre expérience…" rows={3}
                      value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={myRating === 0 || rateMutation.isPending}
                    onClick={() => rateMutation.mutate()}>
                    {rateMutation.isPending ? 'Envoi…' : 'Soumettre mon avis'}
                  </button>
                </div>
              )}

              {existingRating && (
                <div className="my-rating-box">
                  <div className="flex items-center gap-2 mb-1">
                    <StarRating value={existingRating.score} readonly />
                    <span className="text-xs text-acc font-bold">Mon avis</span>
                  </div>
                  {existingRating.comment && <p className="text-sm text-muted">{existingRating.comment}</p>}
                </div>
              )}

              {ratings.length === 0 ? (
                <div className="text-center text-faint text-sm" style={{ padding: '24px 0' }}>Aucun avis pour l'instant. Soyez le premier !</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {ratings.map((r) => (
                    <div key={r.id} className="rating-item">
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar name={r.reviewer_name ?? 'Anonyme'} size={28} />
                        <span className="text-sm font-bold">{r.reviewer_name ?? 'Anonyme'}</span>
                        <StarRating value={r.score} readonly />
                        <span className="text-xs text-faint"><RelativeTime date={r.created_at} /></span>
                      </div>
                      {r.comment && <p className="text-sm text-muted" style={{ marginLeft: 36 }}>{r.comment}</p>}
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
            description={plugin.description}
            topics={plugin.categories?.map((c) => c.name)}
            stats={[
              { value: (plugin.download_count ?? 0).toLocaleString('fr'), label: 'téléchargements' },
              { value: avgRating > 0 ? avgRating.toFixed(1) : '—', label: `note (${plugin.rating_count ?? 0})` },
              { value: plugin.versions?.length ?? 0, label: 'versions' },
            ]}
            links={[
              plugin.homepage && { icon: <Globe size={13} />, content: 'Site officiel', href: plugin.homepage },
              plugin.repository && { icon: <GitBranch size={13} />, content: 'Code source', href: plugin.repository },
              plugin.license && { icon: <Tag size={13} />, content: plugin.license },
            ].filter(Boolean) as any}
          >
            {plugin.published_at && (
              <div className="about-panel__row">
                <History size={13} />
                <span>Publié le <RelativeTime date={plugin.published_at} /></span>
              </div>
            )}
          </AboutPanel>

          <Panel title="Niveau de confiance">
            {report?.merkle_root ? (
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <StatusIcon status="passed" size={16} />
                <div style={{ minWidth: 0 }}>
                  <div className="text-xs font-bold" style={{ color: 'var(--success)' }}>Pipeline signé</div>
                  <div className="eyebrow" style={{ color: 'var(--text3)', wordBreak: 'break-all' }}>
                    {report.merkle_root.slice(0, 16)}…
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-faint" style={{ marginBottom: 10 }}>Rapport de signature en attente.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plugin.slug.includes('xcore') && (
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--warning)' }}>
                  <Shield size={14} /> Extension officielle
                </div>
              )}
              <div className="flex items-center gap-2 text-xs font-bold text-muted">
                <Users size={14} /> Développeur vérifié
              </div>
            </div>
          </Panel>

          <Panel title="Soutenir le projet">
            <p className="text-xs text-muted mb-3">Ce module est gratuit et open-source. Soutenez son auteur pour assurer sa maintenance.</p>
            <button
              className="btn btn-primary btn-sm w-full"
              style={{ justifyContent: 'center', background: '#ea4aaa', borderColor: '#ea4aaa', color: '#fff' }}
              onClick={() => window.open('https://github.com/sponsors', '_blank')}
            >
              <Users size={14} /> Sponsoriser l'auteur
            </button>
          </Panel>

          {pluginDoc && (
            <Panel title="Documentation">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pluginDoc.readme && (
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => setTab('readme')}>
                    <BookOpen size={13} /> README
                  </button>
                )}
                {pluginDoc.integration && (
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => setTab('integration')}>
                    <Wrench size={13} /> Intégration
                  </button>
                )}
                {pluginDoc.contributor && (
                  <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => setTab('contributeurs')}>
                    <Users size={13} /> Contributeurs
                  </button>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
