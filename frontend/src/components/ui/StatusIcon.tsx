import { CheckCircle2, XCircle, Clock, AlertTriangle, CircleDot, MinusCircle } from 'lucide-react'

export type StatusKind = 'success' | 'danger' | 'warning' | 'pending' | 'neutral'

// Maps every status vocabulary used across the app (submissions, pipeline
// gates, deployments) onto one shared visual language.
const STATUS_MAP: Record<string, StatusKind> = {
  // Submission / plugin
  approved: 'success',
  passed: 'success',
  rejected: 'danger',
  blocked: 'danger',
  failed: 'danger',
  manual_review: 'warning',
  processing: 'pending',
  pending: 'pending',
  // Deployments
  success: 'success',
  succeeded: 'success',
  running: 'pending',
  rolled_back: 'warning',
}

const ICONS: Record<StatusKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  pending: Clock,
  neutral: MinusCircle,
}

export function statusKind(status: string): StatusKind {
  return STATUS_MAP[status] ?? 'neutral'
}

/** Status icon — GitHub's Issues/PRs open/closed/draft dot, generalized to
 * this app's status vocabularies (submissions, pipeline gates, deployments).
 * Replaces GateStamp.tsx. */
export default function StatusIcon({
  status,
  size = 15,
  dot = false,
}: {
  status: string
  size?: number
  dot?: boolean
}) {
  const kind = statusKind(status)
  const Icon = dot ? CircleDot : ICONS[kind]
  const cls = kind === 'neutral' || kind === 'pending' ? 'muted' : kind
  return <Icon size={size} className={`status-icon status-icon--${cls}`} />
}
