import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, ChevronDown, ChevronUp, Loader2, Lightbulb } from 'lucide-react'
import { StatusIcon, Pill } from './ui'
import type { Finding, PipelineGate, SubmissionReport, SubmissionStatus } from '../types'

/**
 * Rapport de pipeline (11 gates) — partagé entre plugins et services, qui
 * partagent le même pipeline (SandboxedPipeline → PipelineOrchestrator côté
 * backend, voir docs/backend/architecture.md) et donc le même SubmissionReport.
 * Anciennement dupliqué en local dans SubmissionsPanel.tsx (plugins) et
 * absent côté ServicesPanel.tsx (services) — extrait ici pour les deux.
 */

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
        <span className="text-xs" style={{ flex: 1, lineHeight: 1.5, minWidth: 0, wordBreak: 'break-word' }}>{finding.message}</span>
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
          <Lightbulb size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
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

export default function PipelineReport({
  submissionId,
  fetchReport,
}: {
  submissionId: string
  /** subsApi.report (plugins) ou servicesApi.submissions.report (services) —
   * même forme de réponse (SubmissionReport) des deux côtés, seul le chemin
   * d'API diffère. */
  fetchReport: (id: string) => Promise<SubmissionReport>
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['submission-report', submissionId],
    queryFn: () => fetchReport(submissionId),
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
