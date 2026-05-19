import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch, Search, Star, AlertTriangle, ExternalLink, Check, Loader2,
  Link2, Link2Off, Package, Send, ChevronDown, ChevronUp, FileText,
  CheckCircle, XCircle, Clock, RefreshCw, Download, Edit2, Save, X,
  Activity, Webhook as WebhookIcon, Plus, Trash2, EyeOff
} from 'lucide-react'
import { submissions as subsApi, plugins as pluginsApi, categories as catsApi, github as githubApi, webhooks as hooksApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'
import { PageLoading, Skeleton } from '../components/Skeleton'
import { useXPulse } from '../hooks/useXPulse'
import type { Category, PagedResponse, Plugin, Submission, SubmissionReport, SubmissionStatus, Webhook, GHLink, GHRepo } from '../types'

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string }> = {
  pending:       { label: 'En attente',  className: 'badge-ghost'   },
  processing:    { label: 'En cours',    className: 'badge-warning'  },
  approved:      { label: 'Approuvé',    className: 'badge-success'  },
  rejected:      { label: 'Rejeté',      className: 'badge-danger'   },
  manual_review: { label: 'En révision', className: 'badge-amber'    },
  failed:        { label: 'Échoué',      className: 'badge-danger'   },
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'badge-ghost' }
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>
}

function ScoreBar({ score }: { score: number }) {
  const color = score < 20 ? 'var(--success)' : score < 50 ? 'var(--amber)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{score}</span>
    </div>
  )
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critique',  color: '#ff4444', bg: 'rgba(255,68,68,0.12)'  },
  high:     { label: 'Élevé',     color: '#ff8c00', bg: 'rgba(255,140,0,0.12)'  },
  medium:   { label: 'Modéré',    color: 'var(--amber)', bg: 'rgba(251,191,36,0.10)' },
  low:      { label: 'Faible',    color: 'var(--acc)',   bg: 'var(--acc-subtle)' },
  info:     { label: 'Info',      color: 'var(--text3)', bg: 'var(--surface2)'   },
}

const GATE_LABELS: Record<string, string> = {
  intake:          'Intake & Manifest',
  static_analysis: 'Analyse statique',
  supply_chain:    'Chaîne d\'approvisionnement',
  secrets:         'Détection de secrets',
  sandbox:         'Exécution sandbox',
  behavioral:      'Analyse comportementale',
  signing:         'Signature & Intégrité',
  compliance:      'Conformité & Licence',
  supply_health:   'Santé des dépendances',
}

function FindingItem({ finding }: { finding: import('../types').Finding }) {
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info
  return (
    <div className="finding-item" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="flex items-start gap-2" style={{ marginBottom: finding.file || finding.code || finding.remediation ? 8 : 0 }}>
        <span className="finding-severity" style={{ color: cfg.color, background: cfg.bg }}>
          {cfg.label}
        </span>
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
      {finding.code && (
        <pre className="finding-code">{finding.code}</pre>
      )}
      {finding.remediation && (
        <div className="finding-remediation">
          <Check size={11} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
          <span className="text-xs" style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{finding.remediation}</span>
        </div>
      )}
    </div>
  )
}

function GateRow({ gate }: { gate: import('../types').PipelineGate }) {
  const hasFindings = gate.findings && gate.findings.length > 0
  const [open, setOpen] = useState(gate.status !== 'passed' && hasFindings)
  const passed = gate.status === 'passed'
  const blocked = gate.status === 'blocked'

  const critCount = gate.findings?.filter(f => f.severity === 'critical').length ?? 0
  const highCount = gate.findings?.filter(f => f.severity === 'high').length ?? 0
  const medCount  = gate.findings?.filter(f => f.severity === 'medium').length ?? 0

  return (
    <div className={`pipeline-gate-row${!passed ? ' pipeline-gate-row--failed' : ''}`}>
      <div
        className="pipeline-gate-header"
        style={{ cursor: hasFindings ? 'pointer' : 'default' }}
        onClick={() => hasFindings && setOpen(o => !o)}
      >
        <div style={{ flexShrink: 0 }}>
          {passed
            ? <CheckCircle size={15} style={{ color: 'var(--success)' }} />
            : blocked
              ? <XCircle size={15} style={{ color: '#ff4444' }} />
              : <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold" style={{ color: passed ? 'var(--text)' : 'var(--text)' }}>
              {GATE_LABELS[gate.gate] ?? gate.gate}
            </span>
            {blocked && <span className="badge badge-danger" style={{ fontSize: 9 }}>Bloquant</span>}
            {gate.anomaly_score > 0 && (
              <span className="font-mono text-xs" style={{ color: gate.anomaly_score >= 40 ? '#ff4444' : gate.anomaly_score >= 20 ? 'var(--amber)' : 'var(--text3)' }}>
                +{gate.anomaly_score} pts
              </span>
            )}
            {hasFindings && (
              <div className="flex items-center gap-1">
                {critCount > 0 && <span className="finding-count" style={{ background: 'rgba(255,68,68,0.15)', color: '#ff4444' }}>{critCount} critique{critCount > 1 ? 's' : ''}</span>}
                {highCount > 0 && <span className="finding-count" style={{ background: 'rgba(255,140,0,0.15)', color: '#ff8c00' }}>{highCount} élevé{highCount > 1 ? 's' : ''}</span>}
                {medCount > 0  && <span className="finding-count" style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--amber)' }}>{medCount} modéré{medCount > 1 ? 's' : ''}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          {gate.duration_seconds != null && (
            <span className="text-xs text-faint font-mono">{(gate.duration_seconds * 1000).toFixed(0)}ms</span>
          )}
          {hasFindings && (
            <div style={{ color: 'var(--text3)' }}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </div>
      </div>

      {open && hasFindings && (
        <div className="pipeline-gate-findings">
          {gate.findings.map((f, i) => <FindingItem key={i} finding={f} />)}
        </div>
      )}
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

  if (error || !data) return (
    <div className="text-xs text-faint" style={{ padding: '8px 0' }}>Rapport non disponible.</div>
  )

  const report = data as SubmissionReport
  const gates = report.gates ?? []
  const summary = report.summary
  const score = report.anomaly_score ?? 0
  const status = report.status

  const scoreColor = score <= 20 ? 'var(--success)' : score < 50 ? 'var(--amber)' : score < 80 ? '#ff8c00' : '#ff4444'

  return (
    <div className="pipeline-report">
      {/* En-tête résumé */}
      <div className="pipeline-report-header">
        <div className="flex items-center gap-3">
          {status === 'approved' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
          {status === 'rejected' && <XCircle size={18} style={{ color: '#ff4444' }} />}
          {status === 'manual_review' && <Clock size={18} style={{ color: 'var(--amber)' }} />}
          {status === 'failed' && <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />}
          <div>
            <div className="text-sm font-bold" style={{
              color: status === 'approved' ? 'var(--success)' : status === 'rejected' ? '#ff4444' : status === 'manual_review' ? 'var(--amber)' : 'var(--text)'
            }}>
              {status === 'approved' ? 'Approuvé automatiquement'
               : status === 'rejected' ? 'Rejeté automatiquement'
               : status === 'manual_review' ? 'Envoyé en révision manuelle'
               : status === 'failed' ? 'Erreur technique'
               : 'Pipeline terminé'}
            </div>
            {report.recommendation && (
              <div className="text-xs text-muted" style={{ marginTop: 2 }}>{report.recommendation}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {summary && (
            <div className="flex items-center gap-3">
              {summary.critical > 0 && <span className="text-xs font-bold" style={{ color: '#ff4444' }}>{summary.critical}C</span>}
              {summary.high     > 0 && <span className="text-xs font-bold" style={{ color: '#ff8c00' }}>{summary.high}H</span>}
              {summary.medium   > 0 && <span className="text-xs font-bold" style={{ color: 'var(--amber)' }}>{summary.medium}M</span>}
              {summary.low      > 0 && <span className="text-xs font-bold" style={{ color: 'var(--acc)' }}>{summary.low}L</span>}
              {summary.info     > 0 && <span className="text-xs text-faint">{summary.info}I</span>}
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

      {/* Gates */}
      {gates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {gates.map((gate) => <GateRow key={gate.gate} gate={gate} />)}
        </div>
      )}

      {report.error && (
        <div className="alert alert-danger" style={{ marginTop: 12 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
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
      <tr
        style={{ cursor: canExpand ? 'pointer' : 'default' }}
        onClick={() => canExpand && setExpanded((e) => !e)}
      >
        <td>
          <div className="font-bold" style={{ fontSize: 14 }}>{sub.plugin_name}</div>
          {/* source info */}
          <div className="text-xs text-faint flex items-center gap-1 mt-1">
             {sub.source === 'github' ? <GitBranch size={10} /> : <FileText size={10} />}
             {sub.source === 'github' ? sub.github_repo : 'Upload direct'}
          </div>
        </td>
        <td><span className="font-mono text-sm">{sub.plugin_version}</span></td>
        <td><StatusBadge status={sub.status as SubmissionStatus} /></td>
        <td>
          {sub.anomaly_score != null ? <ScoreBar score={sub.anomaly_score} /> : <span className="text-faint text-sm">—</span>}
        </td>
        <td>
          <span className="text-sm text-muted">
            {new Date(sub.created_at).toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </td>
        <td>
          {canExpand ? (
            <div style={{ color: 'var(--text3)' }}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          ) : null}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--surface2)' }}>
          <td colSpan={6} style={{ padding: '24px 32px' }}>
            <PipelineReport submissionId={sub.id} />
          </td>
        </tr>
      )}
    </>
  )
}

function SubmitForm() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [pat, setPat] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GHRepo | null>(null)
  const [repoSearch, setRepoSearch] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [categoryIds, setCategoryIds] = useState<string[]>([])

  const { data: catsData } = useQuery({ queryKey: ['categories'], queryFn: catsApi.list })
  const cats: Category[] = Array.isArray(catsData) ? catsData : (catsData as PagedResponse<Category>)?.items ?? []

  const toggleCategory = (id: string) => {
    setCategoryIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  // Check if GitHub is linked
  const { data: ghLink, isLoading: linkLoading, refetch: refetchLink } = useQuery<GHLink | null>({
    queryKey: ['github-link'],
    queryFn: async () => {
      try { return await githubApi.getLink() }
      catch { return null }
    },
  })

  // List repos (only if linked)
  const { data: repos, isLoading: reposLoading } = useQuery<GHRepo[]>({
    queryKey: ['github-repos'],
    queryFn: () => githubApi.repos(),
    enabled: !!ghLink,
  })

  // Recent submissions for quick feedback
  const { data: subsData } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: subsApi.list,
    enabled: !!ghLink,
  })
  const recentSubs = (subsData ?? []).slice(0, 3)

  // Auto-link using OAuth token if user logged in via GitHub
  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      const { token } = await githubApi.oauthToken()
      return githubApi.link(token)
    },
    onSuccess: () => { toast('Compte GitHub lié automatiquement !', 'success'); refetchLink() },
    onError: () => { /* silent — will show PAT form instead */ },
  })

  // Manual PAT link
  const linkMutation = useMutation({
    mutationFn: () => githubApi.link(pat.trim()),
    onSuccess: () => { toast('Compte GitHub lié !', 'success'); setPat(''); refetchLink() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Unlink
  const unlinkMutation = useMutation({
    mutationFn: () => githubApi.unlink(),
    onSuccess: () => {
      toast('Compte GitHub délié.', 'info')
      queryClient.removeQueries({ queryKey: ['github-repos'] })
      setSelectedRepo(null)
      refetchLink()
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Submit
  const submitMutation = useMutation({
    mutationFn: () => githubApi.publish({
      full_name: selectedRepo!.full_name,
      default_branch: selectedRepo!.default_branch,
      plugin_version: version.trim(),
      category_ids: categoryIds,
    }),
    onSuccess: () => {
      toast('Soumission envoyée ! Validation en cours…', 'success')
      setSelectedRepo(null)
      setVersion('1.0.0')
      setCategoryIds([])
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const filteredRepos = (repos ?? []).filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(repoSearch.toLowerCase())
  )

  const canSubmit = selectedRepo && version.trim() && !submitMutation.isPending

  // ── Not linked ────────────────────────────────────────────────────────────
  if (linkLoading) {
    return (
      <div className="section">
        <div className="submit-form">
          <div className="page-loading" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <span className="text-muted text-sm">Vérification du compte GitHub…</span>
          </div>
        </div>
      </div>
    )
  }

  if (!ghLink) {
    return (
      <div className="section">
        <div className="submit-form">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, background: 'var(--surface2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <GitBranch size={24} style={{ color: 'var(--acc)' }} />
            </div>
            <h3 className="font-display font-bold" style={{ fontSize: 24, letterSpacing: '-0.03em', marginBottom: 8 }}>
              Liez votre GitHub
            </h3>
            <p className="text-sm text-muted" style={{ maxWidth: 360, margin: '0 auto' }}>
              XCoreHub se connecte directement à vos repositories pour automatiser la publication.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Connexion rapide</div>
              <p className="text-xs text-muted" style={{ marginBottom: 20, flex: 1 }}>
                Utilisez les identifiants GitHub associés à votre compte XCoreHub.
              </p>
              <button
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center' }}
                disabled={autoLinkMutation.isPending}
                onClick={() => autoLinkMutation.mutate()}
              >
                {autoLinkMutation.isPending
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Liaison…</>
                  : <><GitBranch size={16} /> Lier automatiquement</>
                }
              </button>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: 24 }}>
              <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Personal Access Token</div>
              <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
                Recommandé pour un contrôle précis ou des comptes différents.
              </p>
              <div className="input-wrap mb-4">
                <input
                  type="password"
                  className="input"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  style={{ background: 'var(--surface2)' }}
                />
              </div>
              <button
                className="btn btn-secondary w-full"
                style={{ justifyContent: 'center' }}
                disabled={!pat.trim() || linkMutation.isPending}
                onClick={() => linkMutation.mutate()}
              >
                {linkMutation.isPending
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Liaison…</>
                  : <><Link2 size={14} /> Lier manuellement</>
                }
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <span className="text-xs text-faint">
              Scope requis : <code style={{ color: 'var(--acc)', fontFamily: 'var(--f-mono)' }}>repo</code> (lecture des repos privés)
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Linked ────────────────────────────────────────────────────────────────
  return (
    <div className="section" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, alignItems: 'start' }}>
      <div className="submit-form" style={{ maxWidth: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h3 className="font-display font-bold" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
              Nouvelle Publication
            </h3>
            <p className="text-xs text-muted">Sélectionnez un repository pour commencer le pipeline.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)', padding: '6px 12px', borderRadius: 'var(--r-full)', border: '1px solid var(--border)' }}>
             <div className="flex items-center gap-2">
                <img src={`https://github.com/${ghLink.github_login}.png`} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                <span className="text-xs font-bold">@{ghLink.github_login}</span>
             </div>
             <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
             <button
                className="text-xs font-medium"
                style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                disabled={unlinkMutation.isPending}
                onClick={() => unlinkMutation.mutate()}
              >
                Délier
              </button>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div className="search-bar mb-4">
            <Search size={16} style={{ color: 'var(--text3)' }} />
            <input
              placeholder="Filtrer mes repositories GitHub…"
              value={repoSearch}
              onChange={(e) => setRepoSearch(e.target.value)}
            />
          </div>

          {reposLoading ? (
            <div className="page-loading" style={{ minHeight: 160 }}>
              <div className="spinner" />
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
              gap: 12,
              maxHeight: 400,
              overflowY: 'auto',
              paddingRight: 8
            }}>
              {filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => setSelectedRepo(repo)}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--r-xl)',
                    border: '1px solid',
                    borderColor: selectedRepo?.id === repo.id ? 'var(--acc)' : 'var(--border)',
                    background: selectedRepo?.id === repo.id ? 'var(--acc-subtle)' : 'var(--surface)',
                    cursor: 'pointer',
                    transition: 'all var(--t-fast)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {selectedRepo?.id === repo.id && (
                    <div style={{ position: 'absolute', top: 0, right: 0, padding: '4px 8px', background: 'var(--acc)', color: '#000', borderBottomLeftRadius: 'var(--r-md)' }}>
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  <div className="font-bold text-sm mb-1 truncate" style={{ color: selectedRepo?.id === repo.id ? 'var(--acc)' : 'var(--text)' }}>
                    {repo.name}
                  </div>
                  <div className="text-xs text-muted truncate mb-3">{repo.full_name}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs text-faint">
                      <Star size={12} fill="var(--amber)" color="var(--amber)" />
                      {repo.stargazers_count}
                    </div>
                    {repo.language && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
                        {repo.language}
                      </span>
                    )}
                    {repo.private && <EyeOff size={12} style={{ color: 'var(--text3)' }} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedRepo && (
          <div style={{ 
            background: 'var(--surface2)', 
            padding: 24, 
            borderRadius: 'var(--r-2xl)', 
            border: '1px solid var(--border)',
            animation: 'fadeUp 0.3s ease'
          }}>
            <div className="flex items-center gap-3 mb-6">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--acc)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</div>
              <h4 className="font-display font-bold">Configuration du module</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              <div className="input-wrap">
                <label className="input-label">Version cible *</label>
                <input
                  type="text"
                  className="input"
                  style={{ background: 'var(--surface)' }}
                  placeholder="e.g. 1.0.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
                <p className="text-xs text-faint">Doit correspondre au manifest dans le repo.</p>
              </div>
              <div className="input-wrap">
                <label className="input-label">Catégories Hub (multi-sélection)</label>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 8, 
                  background: 'var(--surface)', 
                  padding: 12, 
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border2)'
                }}>
                  {cats.map(c => (
                    <div 
                      key={c.id}
                      onClick={() => toggleCategory(c.id)}
                      className={`badge ${categoryIds.includes(c.id) ? 'badge-acc' : 'badge-ghost'}`}
                      style={{ cursor: 'pointer', transition: 'all var(--t-fast)' }}
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
               <div className="text-xs text-muted">
                 Branche par défaut : <span className="font-mono text-acc">{selectedRepo.default_branch}</span>
               </div>
               <button
                  className="btn btn-primary btn-lg"
                  disabled={!canSubmit}
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending
                    ? <><Loader2 size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Traitement…</>
                    : <><Send size={18} /> Lancer la publication</>
                  }
                </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: 20 }}>
          <h4 className="text-xs font-bold uppercase mb-4" style={{ letterSpacing: '0.05em', color: 'var(--text3)' }}>
            Soumissions Récentes
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentSubs.length > 0 ? (
              recentSubs.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 
                    s.status === 'approved' ? 'var(--success)' : 
                    s.status === 'rejected' ? 'var(--danger)' : 
                    'var(--warning)'
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-xs font-bold truncate">{s.plugin_name}</div>
                    <div className="text-xs text-faint">v{s.plugin_version} · {STATUS_CONFIG[s.status as SubmissionStatus]?.label}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-faint italic">Aucune activité récente.</div>
            )}
            <button className="btn btn-ghost btn-sm w-full mt-2" style={{ fontSize: 11, justifyContent: 'center' }}>
              Voir tout l'historique
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--acc-subtle)', border: '1px solid var(--border-acc)', borderRadius: 'var(--r-xl)', padding: 20 }}>
          <h4 className="text-xs font-bold uppercase mb-3" style={{ color: 'var(--acc)' }}>
            Conseils
          </h4>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li className="text-xs text-muted" style={{ display: 'flex', gap: 8 }}>
              <Check size={12} style={{ color: 'var(--acc)', flexShrink: 0, marginTop: 2 }} />
              Assurez-vous que <code className="text-acc">plugin.yaml</code> est à la racine.
            </li>
            <li className="text-xs text-muted" style={{ display: 'flex', gap: 8 }}>
              <Check size={12} style={{ color: 'var(--acc)', flexShrink: 0, marginTop: 2 }} />
              Incrémentez la version à chaque nouvelle soumission.
            </li>
            <li className="text-xs text-muted" style={{ display: 'flex', gap: 8 }}>
              <Check size={12} style={{ color: 'var(--acc)', flexShrink: 0, marginTop: 2 }} />
              Utilisez un <code className="text-acc">README.md</code> clair pour la documentation.
            </li>
          </ul>
        </div>
      </div>
    </div>
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

  const saveMutation = useMutation({
    mutationFn: () => pluginsApi.update(p.slug, {
      description: desc || undefined,
      homepage: homepage || undefined,
      repository: repo || undefined,
    }),
    onSuccess: () => {
      toast('Plugin mis à jour !', 'success')
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['my-plugins'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div className="card" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 16,
      padding: 20,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      height: '100%'
    }}>
      <div className="flex justify-between items-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="font-display font-bold truncate" style={{ fontSize: 18, letterSpacing: '-0.02em' }}>{p.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-ghost font-mono" style={{ fontSize: '10px', padding: '1px 6px' }}>v{p.latest_version}</span>
            {p.is_published ? (
              <div className="flex items-center gap-1.5 text-acc font-bold" style={{ fontSize: 11 }}>
                 <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                 Public
              </div>
            ) : (
              <span className="text-xs text-faint">Draft</span>
            )}
          </div>
          {p.categories && p.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.categories.map(c => (
                <span key={c.id} className="badge badge-acc" style={{ fontSize: 9, padding: '1px 6px' }}>{c.name}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <Activity size={14} style={{ color: 'var(--acc)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--acc)' }}>Insights</span>
        </div>
      </div>

      {!editing ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-xs text-faint mb-1">Downloads</div>
              <div className="text-lg font-display font-bold">{(p.download_count ?? 0).toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-xs text-faint mb-1">Rating</div>
              <div className="text-lg font-display font-bold">{(p.avg_rating ?? 0).toFixed(1)} <span className="text-xs">/ 5</span></div>
            </div>
          </div>

          <p className="text-xs text-muted" style={{ 
            lineHeight: 1.6, 
            display: '-webkit-box', 
            WebkitLineClamp: 2, 
            WebkitBoxOrient: 'vertical', 
            overflow: 'hidden'
          }}>
            {p.description || "Pas de description fournie."}
          </p>
          
          <div className="flex gap-2 mt-auto">
            <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => navigate(`/plugins/${p.slug}`)}>
              Voir
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setDesc(p.description ?? ''); setHomepage(p.homepage ?? ''); setRepo(p.repository ?? ''); setEditing(true) }}>
              Gérer
            </button>
            <button className="btn btn-primary btn-sm btn-icon" title="Mettre à jour"
              onClick={() => onUpdate(p.slug)}>
              <RefreshCw size={14} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="input-wrap">
            <label className="input-label" style={{ fontSize: 11 }}>Description</label>
            <textarea
              className="input"
              style={{ resize: 'vertical', minHeight: 80, fontSize: 13, background: 'var(--surface2)' }}
              placeholder="Décrivez les fonctionnalités…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="input-wrap">
            <label className="input-label" style={{ fontSize: 11 }}>Site web (optionnel)</label>
            <input
              type="url"
              className="input"
              style={{ fontSize: 13, background: 'var(--surface2)' }}
              placeholder="https://…"
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Enregistrer
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(false)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionsList({ onGoSubmit }: { onGoSubmit: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: subsData, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: subsApi.list,
    refetchInterval: (query) => {
      const subs = query.state.data as Submission[] | undefined
      const hasActive = subs?.some((s) => s.status === 'pending' || s.status === 'processing')
      return hasActive ? 8000 : false
    },
  })

  const { data: myPlugins, isLoading: pluginsLoading } = useQuery({
    queryKey: ['my-plugins'],
    queryFn: pluginsApi.mine,
  })

  const subs: Submission[] = subsData ?? []
  const myPluginsList: Plugin[] = myPlugins ?? []

  if (isLoading) return <PageLoading text="Chargement des soumissions…" />

  return (
    <div className="section">
      {myPluginsList.length > 0 && (
        <div style={{ marginBottom: 48 }}>
          <div className="section__header" style={{ marginBottom: 24 }}>
            <div>
              <div className="section__label">Mes plugins</div>
              <h3 className="section__title" style={{ fontSize: 24 }}>Publiés ({myPluginsList.length})</h3>
            </div>
          </div>
          <div className="plugins-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {pluginsLoading
              ? [0,1,2].map(i => <Skeleton key={i} height="140px" radius="var(--r-xl)" />)
              : myPluginsList.map((p) => (
                <MyPluginCard key={p.id} p={p} onUpdate={onGoSubmit} />
              ))
            }
          </div>
        </div>
      )}

      <div>
        <div className="section__header" style={{ marginBottom: 24 }}>
          <div>
            <div className="section__label">Historique</div>
            <h3 className="section__title" style={{ fontSize: 24 }}>Mes soumissions ({subs.length})</h3>
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Send size={40} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucune soumission</div>
            <div className="empty__text">
              Soumettez votre premier plugin en utilisant le formulaire ci-dessus.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Version</th>
                  <th>Statut</th>
                  <th style={{ minWidth: 120 }}>Score</th>
                  <th>Date</th>
                  <th style={{ width: 48 }}><FileText size={13} /></th>
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

function WebhooksList() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newSecret, setNewSecret] = useState('')

  const { data: hooks, isLoading } = useQuery({
    queryKey: ['my-webhooks'],
    queryFn: hooksApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () => hooksApi.create({ url: newUrl, secret: newSecret || undefined }),
    onSuccess: () => {
      toast('Webhook ajouté avec succès !', 'success')
      setShowAdd(false); setNewUrl(''); setNewSecret('')
      queryClient.invalidateQueries({ queryKey: ['my-webhooks'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: hooksApi.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-webhooks'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: hooksApi.delete,
    onSuccess: () => {
      toast('Webhook supprimé.', 'info')
      queryClient.invalidateQueries({ queryKey: ['my-webhooks'] })
    },
  })

  if (isLoading) return <PageLoading text="Chargement des webhooks…" />

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h3 className="section__title">Webhooks Développeur</h3>
          <p className="text-xs text-muted">Recevez des notifications HTTP en temps réel pour vos soumissions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Ajouter un endpoint
        </button>
      </div>

      {showAdd && (
        <div className="card mb-6" style={{ background: 'var(--surface2)', border: '1px solid var(--acc-glow)' }}>
          <h4 className="font-bold mb-4">Nouveau Webhook</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="input-wrap">
              <label className="input-label">URL de destination</label>
              <input 
                className="input" 
                placeholder="https://mon-app.com/webhook" 
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
              />
            </div>
            <div className="input-wrap">
              <label className="input-label">Secret HMAC (optionnel)</label>
              <input 
                className="input" 
                type="password" 
                placeholder="Clé de signature" 
                value={newSecret}
                onChange={e => setNewSecret(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={!newUrl || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Création…' : 'Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!hooks?.length ? (
          <div className="empty">
            <div className="empty__icon"><WebhookIcon size={40} strokeWidth={1.5} /></div>
            <div className="empty__text">Vous n'avez pas encore de webhooks configurés.</div>
          </div>
        ) : hooks.map(h => (
          <div key={h.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: h.is_active ? 'var(--acc-subtle)' : 'var(--surface2)', color: h.is_active ? 'var(--acc)' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WebhookIcon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-bold truncate" style={{ opacity: h.is_active ? 1 : 0.5 }}>{h.url}</div>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-faint">Events: <code className="text-acc">{h.events}</code></span>
                {h.last_triggered_at && (
                  <span className="text-xs text-faint">Dernier appel: {new Date(h.last_triggered_at).toLocaleTimeString()}</span>
                )}
                {h.last_status_code && (
                  <span className={`text-xs font-bold ${h.last_status_code < 300 ? 'text-success' : 'text-danger'}`}>
                    HTTP {h.last_status_code}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
               <button 
                  className={`btn btn-sm ${h.is_active ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => toggleMutation.mutate(h.id)}
               >
                 {h.is_active ? 'Désactiver' : 'Activer'}
               </button>
               <button className="btn btn-ghost btn-sm btn-icon text-danger" onClick={() => deleteMutation.mutate(h.id)}>
                 <Trash2 size={16} />
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'submit' | 'submissions' | 'webhooks'>('submit')

  if (!user) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><GitBranch size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Connexion requise</div>
          <div className="empty__text">Vous devez être connecté pour accéder à votre espace développeur.</div>
          <button className="btn btn-primary" onClick={() => navigate('/auth?mode=login')}>
            Se connecter
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="section__label">Atelier Développeur</div>
              <h1 className="dash-header__title">
                Tableau de <span className="gradient-text">bord</span>
              </h1>
              <p className="dash-header__sub">
                Gérez vos extensions, suivez vos soumissions et faites grandir l'écosystème <strong style={{ color: 'var(--acc)' }}>XCoreHub</strong>.
              </p>
            </div>
            <div style={{ position: 'relative' }}>
              <img src="/mascot.svg" alt="" style={{ width: 72, opacity: 0.8, flexShrink: 0, marginTop: 8 }} />
              <div style={{ position: 'absolute', top: 0, right: -4, width: 12, height: 12, background: 'var(--acc)', borderRadius: '50%', border: '2px solid var(--surface)' }} />
            </div>
          </div>
          <div className="dash-tabs">
            <div
              className={`dash-tab${tab === 'submit' ? ' active' : ''}`}
              onClick={() => setTab('submit')}
            >
              Soumettre une extension
            </div>
            <div
              className={`dash-tab${tab === 'submissions' ? ' active' : ''}`}
              onClick={() => setTab('submissions')}
            >
              Mes modules & Historique
            </div>
            <div
              className={`dash-tab${tab === 'webhooks' ? ' active' : ''}`}
              onClick={() => setTab('webhooks')}
            >
              Webhooks
            </div>
          </div>
        </div>
      </div>

      {tab === 'submit' && <SubmitForm />}
      {tab === 'submissions' && <SubmissionsList onGoSubmit={() => setTab('submit')} />}
      {tab === 'webhooks' && <WebhooksList />}
    </div>
  )
}
