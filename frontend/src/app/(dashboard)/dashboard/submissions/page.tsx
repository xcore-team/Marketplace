"use client"


import { ClipboardList } from "lucide-react"
import Link from "next/link"
import type { Submission, SubmissionStatus } from "@/types/submission"


const MOCK_SUBMISSIONS: Submission[] = [
  {
    id: "sub-001",
    plugin_name: "XAuth Plugin",
    status: "approved",
    score: 22,
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:45:00Z",
  },
  {
    id: "sub-002",
    plugin_name: "Data Transformer",
    status: "manual_review",
    score: 55,
    created_at: "2026-05-14T08:00:00Z",
    updated_at: "2026-05-14T08:30:00Z",
  },
  {
    id: "sub-003",
    plugin_name: "Logger Pro",
    status: "pending",
    score: null,
    created_at: "2026-05-17T09:00:00Z",
    updated_at: "2026-05-17T09:00:00Z",
  },
]



const STATUS_CONFIG: Record<SubmissionStatus, { label: string; classes: string }> = {
  pending:       { label: "Pending",       classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  processing:    { label: "Processing",    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  approved:      { label: "Approved",      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected:      { label: "Rejected",      classes: "bg-red-500/10 text-red-400 border-red-500/20" },
  manual_review: { label: "Manual Review", classes: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const { label, classes } = STATUS_CONFIG[status]
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5
      text-xs font-medium rounded-full border ${classes}
    `}>
      {label}
    </span>
  )
}



function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-foreground/30">—</span>

  const color = score <= 30 ? "bg-emerald-400" : score <= 79 ? "bg-orange-400" : "bg-red-400"

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-foreground/50 font-mono">{score}</span>
    </div>
  )
}



export default function SubmissionsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">

      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <ClipboardList size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">Submissions</h1>
        </div>
        <p className="text-sm text-foreground/50">
          Track your plugin submission history and security scores
        </p>
      </div>

      {/* ── Table ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_100px_80px] gap-4 px-5 py-3 border-b border-border">
          {["Plugin", "Status", "Score", "Date"].map((h) => (
            <span key={h} className="text-xs font-medium text-foreground/35 uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>


        {MOCK_SUBMISSIONS.map((sub, i) => (
          <Link
            key={sub.id}
            href={`/dashboard/submissions/${sub.id}`}
            className={`
              grid grid-cols-[1fr_140px_100px_80px] gap-4
              px-5 py-4 items-center
              hover:bg-foreground/3 transition-colors duration-150
              ${i < MOCK_SUBMISSIONS.length - 1 ? "border-b border-border" : ""}
            `}
          >
            <span className="text-sm font-medium text-foreground truncate">
              {sub.plugin_name}
            </span>
            <StatusBadge status={sub.status} />
            <ScoreBar score={sub.score} />
            <span className="text-xs text-foreground/35">
              {new Date(sub.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric"
              })}
            </span>
          </Link>
        ))}
      </div>

    </div>
  )
}