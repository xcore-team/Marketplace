import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch, FileText, ChevronDown, ChevronUp, Send, RefreshCw, Save, X, Loader2, Activity, Globe, Lock,
} from 'lucide-react'
import { submissions as subsApi, plugins as pluginsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading, Skeleton } from '../../components/Skeleton'
import { StatusIcon, Pill, RelativeTime } from '../../components/ui'
import { StatusBadge, ScoreBar } from './shared'
import type { Plugin, Submission, SubmissionReport, SubmissionStatus, Finding, PipelineGate } from '../../types'

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critique', color: '#ff4444', bg: 'rgba(255,68,68,0.12)' },
  high: { label: 'Élevé', color: '#ff8c00', bg: 'rgba(255,140,0,0.12)' },
  medium: { label: 'Modéré', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  low: { label: 'Faible', color: 'var(--acc)', bg: 'var(--acc-subtle)' },
  info: { label: 'Info', color: 'var(--text3)', bg: 'var(--surface2)' },
}

function FindingItem({ finding }: { finding: Finding }) {
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info
  return (
    <div className="finding-item" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="flex items-start gap-2" style={{ marginBottom: finding.file || finding.code || finding.remediation ? 8 : 0 }}>
        <span className="finding-severity" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
        <span className="text-xs" style={{ flex: 1, lineHeight: 1.5 }}>{finding.message}</span>
      </div>
      {finding.file && (
        <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
          <FileText size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <code className="text-xs font-mono" style={{ color: 'var(--acc)' }}>
            {finding.file}{finding.line != null ? `:${finding.line}` : ''}
          </code>
        </div>
      )}
      {finding.code && <pre className="finding-code">{finding.code}</pre>}
      {finding.remediation && (
        <div className="finding-remediation">
          <StatusIcon status="passed" size={11} />
          <span className="text-xs" style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{finding.remediation}</span>
        </div>
      )}
    </div>
  )
}

function GateRow({ gate }: { gate: PipelineGate }) {
  const hasFindings = gate.findings && gate.findings.length > 0
  const [open, setOpen] = useState(gate.status !== 'passed' && hasFindings)
  const blocked = gate.status === 'blocked'
  const critCount = gate.findings?.filter(f => f.severity === 'critical').length ?? 0
  const highCount = gate.findings?.filter(f => f.severity === 'high').length ?? 0
  const medCount = gate.findings?.filter(f => f.severity === 'medium').length ?? 0

  return (
    <div className="list-row" style={{ cursor: hasFindings ? 'pointer' : 'default' }} onClick={() => hasFindings && setOpen(o => !o)}>
      <StatusIcon status={gate.status} />
      <div className="list-row__main">
        <div className="list-row__title" style={{ color: 'var(--text)' }}>
          {gate.gate}
          {blocked && <Pill variant="danger">Bloquant</Pill>}
          {gate.anomaly_score > 0 && (
            <span className="font-mono text-xs" style={{ color: gate.anomaly_score >= 40 ? 'var(--danger)' : gate.anomaly_score >= 20 ? 'var(--warning)' : 'var(--text3)' }}>
              +{gate.anomaly_score} pts
            </span>
          )}
        </div>
        {hasFindings && (
          <div className="list-row__meta">
            {critCount > 0 && <span style={{ color: '#ff4444' }}>{critCount} critique{critCount > 1 ? 's' : ''}</span>}
            {highCount > 0 && <span style={{ color: '#ff8c00' }}>{highCount} élevé{highCount > 1 ? 's' : ''}</span>}
            {medCount > 0 && <span style={{ color: 'var(--warning)' }}>{medCount} modéré{medCount > 1 ? 's' : ''}</span>}
          </div>
        )}
        {open && hasFindings && (
          <div className="pipeline-gate-findings" style={{ marginTop: 10 }}>
            {gate.findings.map((f, i) => <FindingItem key={i} finding={f} />)}
          </div>
        )}
      </div>
      <div className="list-row__side">
        {gate.duration_seconds != null && <span className="text-xs text-faint font-mono">{(gate.duration_seconds * 1000).toFixed(0)}ms</span>}
        {hasFindings && (open ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </div>
    </div>
  )
}

function PipelineReport({ submissionId }: { submissionId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['submission-report', submissionId],
    queryFn: () => subsApi.report(submissionId),
    retry: false,
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 text-muted text-sm" style={{ padding: '12px 0' }}>
      <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Chargement du rapport…
    </div>
  )
  if (error || !data) return <div className="text-xs text-faint" style={{ padding: '8px 0' }}>Rapport non disponible.</div>

  const report = data as SubmissionReport
  const gates = report.gates ?? []
  const summary = report.summary
  const score = report.anomaly_score ?? 0
  const status = report.status as SubmissionStatus | undefined
  const scoreColor = score <= 20 ? 'var(--success)' : score < 50 ? 'var(--warning)' : score < 80 ? '#ff8c00' : '#ff4444'

  return (
    <div className="pipeline-report">
      <div className="pipeline-report-header">
        <div className="flex items-center gap-3">
          {status && <StatusIcon status={status} size={18} />}
          <div>
            <div className="text-sm font-bold">
              {status === 'approved' ? 'Approuvé automatiquement'
                : status === 'rejected' ? 'Rejeté automatiquement'
                : status === 'manual_review' ? "Envoyé en révision manuelle"
                : status === 'failed' ? 'Erreur technique'
                : 'Pipeline terminé'}
            </div>
            {report.recommendation && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{report.recommendation}</div>}
          </div>
        </div>
        <div className="flex items-center gap-6">
          {summary && (
            <div className="flex items-center gap-3">
              {summary.critical > 0 && <span className="text-xs font-bold" style={{ color: '#ff4444' }}>{summary.critical}C</span>}
              {summary.high > 0 && <span className="text-xs font-bold" style={{ color: '#ff8c00' }}>{summary.high}H</span>}
              {summary.medium > 0 && <span className="text-xs font-bold" style={{ color: 'var(--warning)' }}>{summary.medium}M</span>}
              {summary.low > 0 && <span className="text-xs font-bold" style={{ color: 'var(--acc)' }}>{summary.low}L</span>}
              {summary.info > 0 && <span className="text-xs text-faint">{summary.info}I</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div style={{ width: 80, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: scoreColor, borderRadius: 2 }} />
            </div>
            <span className="font-mono text-sm font-bold" style={{ color: scoreColor }}>{score}</span>
          </div>
        </div>
      </div>

      {gates.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {gates.map((gate) => <GateRow key={gate.gate} gate={gate} />)}
        </div>
      )}

      {report.error && (
        <div className="alert alert-danger" style={{ marginTop: 12 }}>
          <StatusIcon status="failed" size={14} />
          <span className="text-xs">{String(report.error)}</span>
        </div>
      )}

      {report.merkle_root && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
          <span className="text-xs text-faint font-mono">merkle: {report.merkle_root}</span>
        </div>
      )}
    </div>
  )
}

function SubmissionRow({ sub }: { sub: Submission }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = sub.status === 'approved' || sub.status === 'rejected' || sub.status === 'manual_review'

  return (
    <>
      <tr style={{ cursor: canExpand ? 'pointer' : 'default' }} onClick={() => canExpand && setExpanded((e) => !e)}>
        <td>
          <div className="font-bold" style={{ fontSize: 14 }}>{sub.plugin_name}</div>
          <div className="text-xs text-faint flex items-center gap-1 mt-1">
            {sub.source === 'github' ? <GitBranch size={10} /> : <FileText size={10} />}
            {sub.source === 'github' ? sub.github_repo : 'Upload direct'}
          </div>
        </td>
        <td><span className="ledger-id">{sub.plugin_version}</span></td>
        <td><StatusBadge status={sub.status as SubmissionStatus} /></td>
        <td>{sub.anomaly_score != null ? <ScoreBar score={sub.anomaly_score} /> : <span className="text-faint text-sm">—</span>}</td>
        <td><span className="text-sm text-muted"><RelativeTime date={sub.created_at} /></span></td>
        <td>{canExpand ? <div style={{ color: 'var(--text3)' }}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div> : null}</td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--surface2)' }}>
          <td colSpan={6} style={{ padding: '24px 32px' }}><PipelineReport submissionId={sub.id} /></td>
        </tr>
      )}
    </>
  )
}

function MyPluginCard({ p, onUpdate }: { p: Plugin; onUpdate: (slug: string) => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(p.description ?? '')
  const [homepage, setHomepage] = useState(p.homepage ?? '')
  const [repo, setRepo] = useState(p.repository ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(p.visibility === 'private' ? 'private' : 'public')

  const saveMutation = useMutation({
    mutationFn: () => pluginsApi.update(p.slug, {
      description: desc || undefined,
      homepage: homepage || undefined,
      repository: repo || undefined,
      visibility,
    }),
    onSuccess: () => {
      toast('Plugin mis à jour !', 'success')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['my-plugins'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, height: '100%' }}>
      <div className="flex justify-between items-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="font-bold truncate" style={{ fontSize: 16 }}>{p.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Pill>v{p.latest_version}</Pill>
            {p.is_published ? <Pill variant="success">Publié</Pill> : <span className="text-xs text-faint">Draft</span>}
            {p.visibility === 'private' && <Pill icon={<Lock size={9} />}>Privé</Pill>}
          </div>
          {p.categories && p.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.categories.map(c => <Pill key={c.id} variant="acc">{c.name}</Pill>)}
            </div>
          )}
        </div>
        <Activity size={14} style={{ color: 'var(--acc)', flexShrink: 0 }} />
      </div>

      {!editing ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="panel panel--muted" style={{ padding: 10 }}>
              <div className="text-xs text-faint mb-1">Downloads</div>
              <div className="font-bold" style={{ fontSize: 16 }}>{(p.download_count ?? 0).toLocaleString()}</div>
            </div>
            <div className="panel panel--muted" style={{ padding: 10 }}>
              <div className="text-xs text-faint mb-1">Rating</div>
              <div className="font-bold" style={{ fontSize: 16 }}>{(p.avg_rating ?? 0).toFixed(1)} <span className="text-xs">/ 5</span></div>
            </div>
          </div>
          <p className="text-xs text-muted" style={{ lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {p.description || 'Pas de description fournie.'}
          </p>
          <div className="flex gap-2 mt-auto">
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/plugins/${p.slug}`)}>Voir</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                setDesc(p.description ?? ''); setHomepage(p.homepage ?? ''); setRepo(p.repository ?? '')
                setVisibility(p.visibility === 'private' ? 'private' : 'public')
                setEditing(true)
              }}>Gérer</button>
            <button className="btn btn-primary btn-sm btn-icon" title="Mettre à jour" onClick={() => onUpdate(p.slug)}><RefreshCw size={14} /></button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="input-wrap">
            <label className="input-label" style={{ fontSize: 11 }}>Description</label>
            <textarea className="input" style={{ resize: 'vertical', minHeight: 80, fontSize: 13 }} placeholder="Décrivez les fonctionnalités…" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="input-wrap">
            <label className="input-label" style={{ fontSize: 11 }}>Site web (optionnel)</label>
            <input type="url" className="input" style={{ fontSize: 13 }} placeholder="https://…" value={homepage} onChange={(e) => setHomepage(e.target.value)} />
          </div>
          <div className="input-wrap">
            <label className="input-label" style={{ fontSize: 11 }}>Visibilité</label>
            <div className="segmented">
              <button type="button" className={`segmented__item${visibility === 'public' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
                onClick={() => setVisibility('public')}><Globe size={11} /> Public</button>
              <button type="button" className={`segmented__item${visibility === 'private' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
                onClick={() => setVisibility('private')}><Lock size={11} /> Privé</button>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
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

export default function SubmissionsPanel({ onGoSubmit }: { onGoSubmit: () => void }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [scope, setScope] = useState<'mine' | 'team'>('mine')

  const { data: subsData, isLoading } = useQuery({
    queryKey: ['my-submissions', scope],
    queryFn: () => subsApi.list(scope),
    refetchInterval: (query) => {
      const subs = query.state.data as Submission[] | undefined
      const hasActive = subs?.some((s) => s.status === 'pending' || s.status === 'processing')
      return hasActive ? 8000 : false
    },
  })

  const { data: myPlugins, isLoading: pluginsLoading } = useQuery({
    queryKey: ['my-plugins', scope],
    queryFn: () => pluginsApi.mine(scope),
  })

  const subs: Submission[] = subsData ?? []
  const myPluginsList: Plugin[] = myPlugins ?? []

  if (isLoading) return <PageLoading text="Chargement des soumissions…" />

  return (
    <div>
      {user?.tenant_id && (
        <div className="segmented" style={{ marginBottom: 24 }}>
          <button className={`segmented__item${scope === 'mine' ? ' active' : ''}`} onClick={() => setScope('mine')}>Mes plugins</button>
          <button className={`segmented__item${scope === 'team' ? ' active' : ''}`} onClick={() => setScope('team')}>Équipe</button>
        </div>
      )}

      {myPluginsList.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div className="section__header" style={{ marginBottom: 16 }}>
            <div>
              <div className="section__label">{scope === 'team' ? 'Équipe' : 'Mes plugins'}</div>
              <h3 className="section__title" style={{ fontSize: 20 }}>Publiés ({myPluginsList.length})</h3>
            </div>
          </div>
          <div className="plugins-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {pluginsLoading
              ? [0, 1, 2].map(i => <Skeleton key={i} height="140px" radius="var(--r-md)" />)
              : myPluginsList.map((p) => <MyPluginCard key={p.id} p={p} onUpdate={onGoSubmit} />)}
          </div>
        </div>
      )}

      <div>
        <div className="section__header" style={{ marginBottom: 16 }}>
          <div>
            <div className="section__label">Historique</div>
            <h3 className="section__title" style={{ fontSize: 20 }}>
              {scope === 'team' ? "Soumissions de l'équipe" : 'Mes soumissions'} ({subs.length})
            </h3>
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Send size={40} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucune soumission</div>
            <div className="empty__text">Soumettez votre premier plugin depuis l'onglet "Soumettre".</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="submissions-table ledger-table">
              <thead>
                <tr>
                  <th>Plugin</th><th>Version</th><th>Statut</th>
                  <th style={{ minWidth: 120 }}>Score</th><th>Date</th><th style={{ width: 48 }}><FileText size={13} /></th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => <SubmissionRow key={s.id} sub={s} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
