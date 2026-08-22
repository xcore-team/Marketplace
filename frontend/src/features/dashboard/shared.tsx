import { Pill, StatusIcon, statusKind } from '../../components/ui'
import type { SubmissionStatus } from '../../types'

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: 'En attente',
  processing: 'En cours',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  manual_review: 'En révision',
  failed: 'Échoué',
}

/** Status chip shared by the submissions/services panels — built on the
 * StatusIcon/Pill primitives (replaces the local StatusBadge + GateStamp
 * that used to live in DashboardPage.tsx). */
export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const kind = statusKind(status)
  const variant = kind === 'success' ? 'success' : kind === 'danger' ? 'danger' : kind === 'warning' ? 'warning' : 'default'
  return (
    <Pill variant={variant} icon={<StatusIcon status={status} size={11} />}>
      {STATUS_LABEL[status] ?? status}
    </Pill>
  )
}

export function ScoreBar({ score }: { score: number }) {
  const color = score < 20 ? 'var(--success)' : score < 50 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--border2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{score}</span>
    </div>
  )
}
