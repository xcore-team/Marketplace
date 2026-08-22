import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Save, ExternalLink, Download, Star, Calendar,
  Globe, GitBranch, FileText, ChevronDown, ChevronUp, Lock,
  Loader2, Package, Tag, Hash, Activity, Check, Trash2,
} from 'lucide-react'
import { plugins as pluginsApi, submissions as subsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { Panel, Pill, StatusIcon, RelativeTime } from '../../components/ui'
import PipelineReport from '../../components/PipelineReport'
import CiWorkflowPanel from '../dashboard/CiWorkflowPanel'
import { parseGithubRepo } from '../../utils/github'
import type { Plugin, Submission, SubmissionStatus } from '../../types'

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: 'En attente', processing: 'En cours', approved: 'Approuvé',
  rejected: 'Rejeté', manual_review: 'En révision', failed: 'Échoué',
}

function ScoreChip({ score }: { score: number }) {
  const color = score <= 20 ? 'var(--success)' : score < 50 ? 'var(--warning)' : score < 80 ? '#ff8c00' : '#ff4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 64, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: 'var(--f-mono)', color, fontWeight: 700 }}>{score}</span>
    </div>
  )
}

export default function PluginEditPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [expandedSub, setExpandedSub] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [homepage, setHomepage] = useState('')
  const [repository, setRepository] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [formDirty, setFormDirty] = useState(false)

  const { data: plugin, isLoading: pluginLoading } = useQuery<Plugin>({
    queryKey: ['plugin-edit', slug],
    queryFn: async () => {
      const p = await pluginsApi.get(slug!)
      setDesc(p.description ?? ''); setHomepage(p.homepage ?? ''); setRepository(p.repository ?? '')
      setVisibility(p.visibility === 'private' ? 'private' : 'public')
      setFormDirty(false)
      return p
    },
    enabled: !!slug,
  })

  const { data: subs, isLoading: subsLoading } = useQuery<Submission[]>({
    queryKey: ['plugin-subs', slug],
    queryFn: () => pluginsApi.submissions(slug!),
    enabled: !!slug,
    refetchInterval: (q) => {
      const list = q.state.data as Submission[] | undefined
      return list?.some(s => s.status === 'pending' || s.status === 'processing') ? 8000 : false
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => pluginsApi.update(slug!, { description: desc || undefined, homepage: homepage || undefined, repository: repository || undefined, visibility }),
    onSuccess: (updated) => {
      toast('Plugin mis à jour !', 'success')
      setFormDirty(false)
      queryClient.setQueryData(['plugin-edit', slug], updated)
      queryClient.invalidateQueries({ queryKey: ['my-plugins'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => pluginsApi.delete(slug!),
    onSuccess: () => { toast('Plugin supprimé.', 'info'); queryClient.invalidateQueries({ queryKey: ['my-plugins'] }); navigate('/dashboard') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  if (!user) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><Package size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Connexion requise</div>
          <button className="btn btn-primary" onClick={() => navigate('/auth?mode=login')}>Se connecter</button>
        </div>
      </div>
    )
  }

  if (pluginLoading) return <PageLoading text="Chargement du plugin…" />

  if (!plugin) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><Package size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Plugin introuvable</div>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Retour au dashboard</button>
        </div>
      </div>
    )
  }

  const versions = plugin.versions ?? []
  const submissionList: Submission[] = subs ?? []
  const ghRepo = parseGithubRepo(plugin.repository)

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Sticky header */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 'var(--nav-h)', zIndex: 10 }}>
        <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: '0 var(--side-pad)', display: 'flex', alignItems: 'center', gap: 16, height: 56 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => navigate('/dashboard')} title="Retour au dashboard"><ArrowLeft size={16} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 'var(--r-md)', background: 'var(--acc-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={14} style={{ color: 'var(--acc)' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{plugin.name}</span>
              <span className="ledger-id" style={{ marginLeft: 8 }}>{plugin.slug}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <Pill variant={plugin.is_published ? 'success' : 'default'}>{plugin.is_published ? 'Publié' : 'Brouillon'}</Pill>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/plugins/${plugin.slug}`)}><ExternalLink size={13} /> Voir la fiche</button>
            {formDirty && (
              <button className="btn btn-primary btn-sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? <><Loader2 size={13} className="spin" /> Enregistrement…</> : <><Save size={13} /> Enregistrer</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 'var(--max-w)', margin: '0 auto', padding: 'clamp(24px, 3vw, 40px) var(--side-pad)', display: 'grid', gridTemplateColumns: `1fr var(--sidebar-w)`, gap: 24, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Panel title="Modifier les métadonnées">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="input-wrap">
                <label className="input-label">Description publique</label>
                <textarea className="input" style={{ resize: 'vertical', minHeight: 100, lineHeight: 1.6 }} placeholder="Décrivez les fonctionnalités et le cas d'usage principal…"
                  value={desc} onChange={e => { setDesc(e.target.value); setFormDirty(true) }} />
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Visible dans le catalogue et sur la fiche du plugin.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="input-wrap">
                  <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={12} style={{ color: 'var(--acc)' }} /> Site web</label>
                  <input type="url" className="input" placeholder="https://mon-projet.dev" value={homepage} onChange={e => { setHomepage(e.target.value); setFormDirty(true) }} />
                </div>
                <div className="input-wrap">
                  <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><GitBranch size={12} style={{ color: 'var(--acc)' }} /> Repository</label>
                  <input type="url" className="input" placeholder="https://github.com/user/repo" value={repository} onChange={e => { setRepository(e.target.value); setFormDirty(true) }} />
                </div>
              </div>

              <div className="input-wrap">
                <label className="input-label">Visibilité</label>
                <div className="segmented" style={{ width: 'fit-content' }}>
                  <button type="button" className={`segmented__item${visibility === 'public' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => { setVisibility('public'); setFormDirty(true) }}>
                    <Globe size={13} /> Public
                  </button>
                  <button type="button" className={`segmented__item${visibility === 'private' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => { setVisibility('private'); setFormDirty(true) }}>
                    <Lock size={13} /> Privé
                  </button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {visibility === 'public' ? 'Visible et installable par tous les utilisateurs du Hub.' : 'Visible uniquement par vous et votre équipe.'}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {[
                  { icon: Hash, label: 'Slug', value: plugin.slug },
                  { icon: Tag, label: 'Dernière version', value: plugin.latest_version ?? '—' },
                  { icon: FileText, label: 'Licence', value: plugin.license ?? 'Non renseignée' },
                  { icon: Calendar, label: 'Créé le', value: <RelativeTime date={plugin.created_at} /> },
                ].map((f, i) => {
                  const Icon = f.icon
                  return (
                    <div key={i} className="panel panel--muted" style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Icon size={11} style={{ color: 'var(--text3)' }} />
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--f-mono)', color: 'var(--text)', wordBreak: 'break-all' }}>{f.value}</div>
                    </div>
                  )
                })}
              </div>

              {formDirty && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--acc-subtle)', border: '1px solid var(--border-acc)', borderRadius: 'var(--r-md)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>Modifications non enregistrées</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setDesc(plugin.description ?? ''); setHomepage(plugin.homepage ?? ''); setRepository(plugin.repository ?? '')
                      setVisibility(plugin.visibility === 'private' ? 'private' : 'public')
                      setFormDirty(false)
                    }}>Annuler</button>
                    <button className="btn btn-primary btn-sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                      {saveMutation.isPending ? <><Loader2 size={13} className="spin" /> Enregistrement…</> : <><Save size={13} /> Enregistrer</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* CI/CD — republication auto sur push de tag. Accessible ici (pas
              seulement lors d'une nouvelle soumission depuis l'Atelier) pour
              un plugin déjà publié dont la clé CI n'a jamais été créée. */}
          {ghRepo ? (
            <CiWorkflowPanel owner={ghRepo.owner} repo={ghRepo.repo} />
          ) : (
            <Panel title="CI/CD — republication auto">
              <p className="text-sm text-muted">
                Renseignez un repository GitHub ci-dessus (champ « Repository ») pour activer la republication automatique à chaque tag Git.
              </p>
            </Panel>
          )}

          <Panel title={`Versions publiées (${versions.length})`}>
            {versions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>Aucune version disponible.</div>
            ) : (
              <div className="list" style={{ border: 'none' }}>
                {versions.map((v, i) => (
                  <div key={v.id} className="list-row" style={{ opacity: v.is_yanked ? 0.6 : 1 }}>
                    <StatusIcon status={v.is_yanked ? 'blocked' : i === 0 ? 'passed' : 'neutral'} size={14} />
                    <div className="list-row__main">
                      <div className="list-row__title" style={{ color: i === 0 ? 'var(--acc)' : 'var(--text)' }}>
                        v{v.version}
                        {i === 0 && !v.is_yanked && <Pill variant="acc">Dernière</Pill>}
                        {v.is_stable && !v.is_yanked && <Pill variant="success">Stable</Pill>}
                        {v.is_yanked && <Pill variant="danger">Retirée</Pill>}
                        {v.publish_status !== 'published' && <Pill>{v.publish_status}</Pill>}
                      </div>
                      {v.is_yanked && v.yanked_reason && <div className="list-row__meta"><span style={{ color: 'var(--danger)' }}>{v.yanked_reason}</span></div>}
                    </div>
                    <div className="list-row__side">
                      {v.anomaly_score != null && <ScoreChip score={v.anomaly_score} />}
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}><RelativeTime date={v.created_at} /></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`Historique des soumissions (${submissionList.length})`}>
            {subsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 13 }}><Loader2 size={14} className="spin" /> Chargement…</div>
            ) : submissionList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>Aucune soumission pour ce plugin.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {submissionList.map((sub) => {
                  const canExpand = sub.status === 'approved' || sub.status === 'rejected' || sub.status === 'manual_review' || sub.status === 'failed'
                  const isOpen = expandedSub === sub.id
                  return (
                    <div key={sub.id} className="panel" style={{ background: isOpen ? 'var(--surface2)' : 'var(--surface)' }}>
                      <div className="list-row" style={{ border: 'none', cursor: canExpand ? 'pointer' : 'default' }} onClick={() => canExpand && setExpandedSub(isOpen ? null : sub.id)}>
                        <StatusIcon status={sub.status} size={14} />
                        <div className="list-row__main">
                          <div className="list-row__title" style={{ color: 'var(--text)' }}>
                            v{sub.plugin_version}
                            <Pill variant={sub.status === 'approved' ? 'success' : sub.status === 'rejected' || sub.status === 'failed' ? 'danger' : 'warning'}>{STATUS_LABEL[sub.status as SubmissionStatus] ?? sub.status}</Pill>
                          </div>
                          <div className="list-row__meta">
                            {sub.source === 'github' && sub.github_repo && <span><GitBranch size={10} /> {sub.github_repo}</span>}
                            <span><RelativeTime date={sub.created_at} /></span>
                          </div>
                        </div>
                        <div className="list-row__side">
                          {sub.anomaly_score != null && <ScoreChip score={sub.anomaly_score} />}
                          {canExpand && (isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />)}
                        </div>
                      </div>
                      {isOpen && <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}><PipelineReport submissionId={sub.id} fetchReport={subsApi.report} /></div>}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Statistiques">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { icon: Download, label: 'Téléchargements', value: (plugin.download_count ?? 0).toLocaleString('fr') },
                { icon: Star, label: 'Note moyenne', value: plugin.avg_rating != null ? `${plugin.avg_rating.toFixed(1)} / 5` : '—' },
                { icon: Activity, label: 'Évaluations', value: (plugin.rating_count ?? 0).toLocaleString('fr') },
                { icon: Tag, label: 'Versions', value: versions.length.toString() },
              ].map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={i} className="panel panel--muted" style={{ padding: 12, textAlign: 'center' }}>
                    <Icon size={16} style={{ color: 'var(--acc)', margin: '0 auto 6px', display: 'block' }} strokeWidth={1.5} />
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{s.label}</div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {plugin.categories && plugin.categories.length > 0 && (
            <Panel title="Catégories">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {plugin.categories.map(c => <Pill key={c.id} variant="acc">{c.name}</Pill>)}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Les catégories sont gérées lors des soumissions.</p>
            </Panel>
          )}

          <Panel title="Actions rapides">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navigate(`/plugins/${plugin.slug}`)}><ExternalLink size={13} /> Voir la fiche publique</button>
              <button className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navigate('/dashboard')}><Activity size={13} /> Nouvelle soumission</button>
              {plugin.repository && (
                <a href={plugin.repository} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', textDecoration: 'none' }}>
                  <GitBranch size={13} /> Ouvrir le repository
                </a>
              )}
            </div>
          </Panel>

          <Panel title="Checklist publication">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { ok: !!plugin.description, label: 'Description renseignée' },
                { ok: !!plugin.homepage || !!plugin.repository, label: 'Site web ou repo renseigné' },
                { ok: !!plugin.latest_version, label: 'Au moins une version publiée' },
                { ok: (plugin.categories?.length ?? 0) > 0, label: 'Catégorie assignée' },
                { ok: plugin.is_published, label: 'Plugin visible dans le catalogue' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.ok ? <Check size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--border2)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, color: item.ok ? 'var(--text)' : 'var(--text3)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Zone de danger">
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>Supprime définitivement ce plugin, ses versions et son historique de soumissions.</p>
            <button className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center', color: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={deleteMutation.isPending}
              onClick={() => { if (confirm(`Supprimer définitivement "${plugin.name}" ? Cette action est irréversible.`)) deleteMutation.mutate() }}>
              {deleteMutation.isPending ? <><Loader2 size={13} className="spin" /> Suppression…</> : <><Trash2 size={13} /> Supprimer le plugin</>}
            </button>
          </Panel>
        </div>
      </div>
    </div>
  )
}
