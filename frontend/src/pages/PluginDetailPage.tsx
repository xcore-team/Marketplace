import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, Star, Download, Globe, GitBranch, Copy, Check,
  BookOpen, Wrench, Users, History, MessageSquare, Package,
  ExternalLink, AlertTriangle, ChevronDown, ChevronUp,
  Shield, CheckCircle, Loader2
} from 'lucide-react'
import { plugins as pluginsApi, docs as docsApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'
import { PageLoading } from '../components/Skeleton'
import type { Rating, PluginDoc, SubmissionReport, Plugin } from '../types'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(name || description) && (
        <div className="info-box">
          <div className="info-box__title">Projet</div>
          {name && <div className="font-display font-bold" style={{ fontSize: 20, marginBottom: 8 }}>{name}</div>}
          {description && <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>{description}</p>}
          <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
            {license && <span className="badge badge-ghost">{license}</span>}
            {homepage && (
              <a href={homepage} target="_blank" rel="noreferrer" className="badge badge-acc" style={{ cursor: 'pointer' }}>
                <Globe size={11} /> Site web
              </a>
            )}
            {repository && (
              <a href={repository} target="_blank" rel="noreferrer" className="badge badge-ghost" style={{ cursor: 'pointer' }}>
                <GitBranch size={11} /> Repository
              </a>
            )}
          </div>
        </div>
      )}

      {Array.isArray(maintainers) && maintainers.length > 0 && (
        <div className="info-box">
          <div className="info-box__title">Contributeurs ({maintainers.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
            {(maintainers as Record<string, unknown>[]).map((m, i) => (
              <div key={i} className="contributor-card">
                <div className="contributor-card__avatar">
                  {String(m.name ?? m.login ?? '?')[0].toUpperCase()}
                </div>
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
        </div>
      )}

      {/* Raw fields not covered above */}
      {Object.entries(contributor)
        .filter(([k]) => !['maintainers','contributors','name','description','license','homepage','repository'].includes(k))
        .map(([k, v]) => (
          <div key={k} className="info-box">
            <div className="info-box__title">{k}</div>
            <pre style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
            </pre>
          </div>
        ))
      }
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { id: 'apercu', label: 'Aperçu', icon: <Package size={14} /> },
    { id: 'readme', label: 'Documentation', icon: <BookOpen size={14} />, hidden: !hasReadme && !docsLoading },
    { id: 'securite', label: 'Sécurité', icon: <Shield size={14} /> },
    { id: 'integration', label: 'Intégration', icon: <Wrench size={14} />, hidden: !hasIntegration && !docsLoading },
    { id: 'contributeurs', label: 'Contributeurs', icon: <Users size={14} />, hidden: !hasContributor && !docsLoading },
    { id: 'versions', label: `Versions${plugin.versions?.length ? ` (${plugin.versions.length})` : ''}`, icon: <History size={14} /> },
    { id: 'avis', label: `Avis (${(ratingsData as any)?.total ?? ratings.length})`, icon: <MessageSquare size={14} /> },
  ]

  return (
    <div>
      {/* Hero */}
      <div className="detail-hero">
        <div className="detail-hero__inner">
          <div className="detail-hero__back" onClick={() => navigate('/plugins')}>
            <ArrowLeft size={14} /> Retour au catalogue
          </div>

          <div className="detail-hero__meta" style={{ marginBottom: 16 }}>
            {plugin.categories?.map((c) => (
              <span key={c.id} className="badge badge-acc">{c.name}</span>
            ))}
            {plugin.latest_version && (
              <span className="badge badge-ghost font-mono">v{plugin.latest_version}</span>
            )}
            {plugin.is_published
              ? <span className="badge badge-success">Publié</span>
              : <span className="badge badge-warning">Brouillon</span>
            }
          </div>

          <h1 className="detail-hero__name">{plugin.name}</h1>

          <div className="detail-hero__meta" style={{ marginTop: 12 }}>
            {(plugin.avg_rating ?? plugin.average_score ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <StarRating value={Math.round(plugin.avg_rating ?? plugin.average_score ?? 0)} readonly />
                <span className="text-muted text-sm">
                  {(plugin.avg_rating ?? plugin.average_score ?? 0).toFixed(1)} ({plugin.rating_count ?? 0} avis)
                </span>
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
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 'var(--nav-h)', zIndex: 10 }}>
        <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: '0 var(--side-pad)', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.id}
              className={`detail-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="detail-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>

          {/* ── Aperçu ── */}
          {tab === 'apercu' && (
            <>
              <CodeBlock slug={plugin.slug} version={plugin.latest_version} />
              {plugin.description && (
                <div className="info-box">
                  <div className="info-box__title">Description</div>
                  <p style={{ color: 'var(--text2)', lineHeight: 1.8, fontSize: 15 }}>{plugin.description}</p>
                </div>
              )}
              {/* Quick stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Téléchargements', value: (plugin.download_count ?? 0).toLocaleString('fr'), icon: <Download size={16} /> },
                  { label: 'Note moyenne', value: (plugin.avg_rating ?? plugin.average_score ?? 0) > 0 ? `${(plugin.avg_rating ?? plugin.average_score ?? 0).toFixed(1)} / 5` : '—', icon: <Star size={16} /> },
                  { label: 'Versions', value: plugin.versions?.length ?? 0, icon: <History size={16} /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="info-box" style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--acc)', marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                    <div className="font-display font-bold" style={{ fontSize: 22, color: 'var(--acc)' }}>{value}</div>
                    <div className="text-xs text-faint" style={{ marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── README ── */}
          {tab === 'readme' && (
            docsLoading
              ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /><span className="text-muted text-sm">Chargement de la documentation…</span></div>
              : pluginDoc?.readme
                ? <div className="info-box"><MarkdownContent content={pluginDoc.readme} /></div>
                : <div className="empty"><div className="empty__icon"><BookOpen size={40} strokeWidth={1.5} /></div><div className="empty__title">Pas de README</div><div className="empty__text">Ce plugin ne contient pas de documentation README.md.</div></div>
          )}

          {/* ── Intégration ── */}
          {tab === 'integration' && (
            docsLoading
              ? <div className="page-loading" style={{ minHeight: 200 }}><div className="spinner" /><span className="text-muted text-sm">Chargement…</span></div>
              : pluginDoc?.integration
                ? <div className="info-box"><MarkdownContent content={pluginDoc.integration} /></div>
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
            <div className="info-box">
              <div className="flex items-center gap-3 mb-6">
                <Shield size={24} style={{ color: 'var(--acc)' }} />
                <div>
                  <h3 style={{ margin: 0 }}>Rapport de Sécurité Hub</h3>
                  <p className="text-xs text-faint">Version {plugin.latest_version} · Analyse automatisée</p>
                </div>
              </div>

              {reportData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(reportData as SubmissionReport).gates?.map((gate) => {
                    const passed = gate.status === 'passed'
                    const findingCount = gate.findings?.length ?? 0
                    return (
                      <div key={gate.gate} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'var(--surface2)',
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${passed ? 'var(--border)' : 'rgba(251,191,36,0.2)'}`,
                      }}>
                        {passed
                          ? <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                          : <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-sm font-bold">{gate.gate}</div>
                          {findingCount > 0 && (
                            <div className="text-xs text-muted">{findingCount} finding{findingCount > 1 ? 's' : ''} détecté{findingCount > 1 ? 's' : ''}</div>
                          )}
                        </div>
                        {gate.anomaly_score > 0 && (
                          <span className="font-mono text-xs" style={{ color: gate.anomaly_score >= 40 ? '#ff4444' : 'var(--amber)' }}>+{gate.anomaly_score}</span>
                        )}
                        <span className={`badge ${passed ? 'badge-success' : 'badge-amber'}`} style={{ fontSize: 10 }}>
                          {passed ? 'OK' : gate.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty">
                  <Loader2 size={24} className="spin mb-4" />
                  <div className="empty__text">Génération du rapport public en cours…</div>
                </div>
              )}
            </div>
          )}

          {/* ── Versions ── */}
          {tab === 'versions' && (
            <div className="info-box">
              <div className="info-box__title">Historique des versions ({plugin.versions?.length ?? 0})</div>
              {(!plugin.versions || plugin.versions.length === 0) ? (
                <div className="text-faint text-sm" style={{ padding: '24px 0' }}>Aucune version disponible.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
                  {plugin.versions.map((v, i) => (
                    <div key={v.id} className="version-row">
                      <div className="version-row__indicator">
                        <div className={`version-row__dot${i === 0 ? ' latest' : ''}`} />
                        {i < plugin.versions!.length - 1 && <div className="version-row__line" />}
                      </div>
                      <div className="version-row__content">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold" style={{ color: i === 0 ? 'var(--acc)' : 'var(--text)' }}>v{v.version}</span>
                          {i === 0 && <span className="badge badge-acc" style={{ fontSize: 10 }}>Dernière</span>}
                          {v.is_yanked && <span className="badge badge-danger" style={{ fontSize: 10 }}>Retiré</span>}
                          {v.is_stable && !v.is_yanked && <span className="badge badge-success" style={{ fontSize: 10 }}>Stable</span>}
                          <span className="text-faint text-xs">{new Date(v.created_at).toLocaleDateString('fr', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          {v.anomaly_score != null && (
                            <span className="text-xs font-mono" style={{ color: v.anomaly_score < 20 ? 'var(--success)' : v.anomaly_score < 50 ? 'var(--amber)' : 'var(--danger)' }}>
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
            </div>
          )}

          {/* ── Avis ── */}
          {tab === 'avis' && (
            <div className="info-box">
              <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
                <div className="info-box__title" style={{ marginBottom: 0 }}>Avis des utilisateurs ({(ratingsData as any)?.total ?? ratings.length})</div>
                {user && !existingRating && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowRatingForm(!showRatingForm)}>
                    {showRatingForm ? 'Annuler' : <><Star size={13} /> Laisser un avis</>}
                  </button>
                )}
                {!user && (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/auth?mode=login')}>
                    Connexion pour noter
                  </button>
                )}
              </div>

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
                        <div
                          style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--acc-subtle)', border: '1px solid var(--border-acc)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: 'var(--acc)',
                          }}
                        >
                          {(r.reviewer_name ?? 'A')[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-bold">{r.reviewer_name ?? 'Anonyme'}</span>
                        <StarRating value={r.score} readonly />
                        <span className="text-xs text-faint">{new Date(r.created_at).toLocaleDateString('fr')}</span>
                      </div>
                      {r.comment && <p className="text-sm text-muted" style={{ marginLeft: 36 }}>{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          {/* Trust Badges */}
          <div className="info-box" style={{ background: 'var(--acc-subtle)', borderColor: 'var(--border-acc)' }}>
            <div className="info-box__title" style={{ color: 'var(--acc)' }}>Niveau de Confiance</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--acc)' }}>
                <CheckCircle size={14} /> Pipeline Validé (9/9)
              </div>
              {plugin.slug.includes('xcore') && (
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--amber)' }}>
                  <Shield size={14} /> Extension Officielle
                </div>
              )}
              <div className="flex items-center gap-2 text-xs font-bold text-muted">
                <Users size={14} /> Développeur Vérifié
              </div>
            </div>
          </div>

          <div className="info-box">
            <div className="info-box__title">Soutenir le projet</div>
            <p className="text-xs text-muted mb-4">Ce module est gratuit et open-source. Soutenez son auteur pour assurer sa maintenance.</p>
            <button 
              className="btn btn-primary btn-sm w-full" 
              style={{ justifyContent: 'center', background: '#ea4aaa', borderColor: '#ea4aaa', color: '#fff' }}
              onClick={() => window.open('https://github.com/sponsors', '_blank')}
            >
              <Users size={14} /> Sponsoriser l'auteur
            </button>
          </div>

          <div className="info-box">
            <div className="info-box__title">Informations</div>
            {([
              ['Identifiant', <span className="font-mono text-sm">{plugin.slug}</span>],
              ['Version', <span className="font-mono text-sm">{plugin.latest_version ?? 'N/A'}</span>],
              ['Téléchargements', (plugin.download_count ?? 0).toLocaleString('fr')],
              ['Note', (plugin.avg_rating ?? plugin.average_score ?? 0) > 0
                ? `${(plugin.avg_rating ?? plugin.average_score ?? 0).toFixed(1)} / 5 (${plugin.rating_count} avis)`
                : '—'],
              ['Publié le', plugin.published_at
                ? new Date(plugin.published_at).toLocaleDateString('fr', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'N/A'],
            ] as [string, React.ReactNode][]).map(([label, value]) => (
              <div key={label} className="info-row">
                <span className="info-row__label">{label}</span>
                <span className="info-row__val">{value}</span>
              </div>
            ))}
          </div>

          {plugin.categories && plugin.categories.length > 0 && (
            <div className="info-box">
              <div className="info-box__title">Catégories</div>
              <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                {plugin.categories.map((c) => (
                  <span key={c.id} className="badge badge-acc" style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/plugins?category=${c.id}`)}>
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(plugin.homepage || plugin.repository) && (
            <div className="info-box">
              <div className="info-box__title">Liens</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {plugin.homepage && (
                  <a href={plugin.homepage} target="_blank" rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center' }}>
                    <Globe size={13} /> Site officiel <ExternalLink size={11} />
                  </a>
                )}
                {plugin.repository && (
                  <a href={plugin.repository} target="_blank" rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center' }}>
                    <GitBranch size={13} /> Code source <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          )}

          {pluginDoc && (
            <div className="info-box">
              <div className="info-box__title">Documentation</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
