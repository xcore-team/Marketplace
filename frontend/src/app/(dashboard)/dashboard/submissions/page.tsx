"use client"

import { useEffect, useState } from "react"
import { ClipboardList, ChevronRight } from "lucide-react"
import Link from "next/link"
import { getMySubmissions } from "@/services/submissionService"
import type { Submission, SubmissionStatus } from "@/types/submission"

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
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${classes}`}>
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
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-foreground/50 font-mono">{score}</span>
    </div>
  )
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMySubmissions()
      .then(setSubmissions)
      .catch(() => setError("Unable to load submissions right now"))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto overflow-x-hidden">

      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <ClipboardList size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">Submissions</h1>
        </div>
        <p className="text-sm text-foreground/50">Track your plugin submission history and security scores</p>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-foreground/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400 text-center py-12">{error}</p>}

      {!isLoading && !error && submissions.length === 0 && (
        <p className="text-center text-sm text-foreground/40 py-12">No submissions yet</p>
      )}

      {!isLoading && !error && submissions.length > 0 && (
        <>
          {/* -- Mobile: card list -- */}
          <div className="flex flex-col gap-2 md:hidden">
            {submissions.map((sub) => (
              <Link
                key={sub.id}
                href={`/dashboard/submissions/${sub.id}`}
                className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-3.5 hover:border-primary/20 hover:bg-primary/[0.02] transition-all duration-150 active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  {/* Plugin name + date */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {sub.plugin_name}
                    </span>
                    <span className="text-xs text-foreground/35 shrink-0">
                      {new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {/* Status + Score */}
                  <div className="flex items-center gap-3">
                    <StatusBadge status={sub.status} />
                    <ScoreBar score={sub.score} />
                  </div>
                </div>
                <ChevronRight size={15} className="text-foreground/25 shrink-0 ml-3" strokeWidth={2} />
              </Link>
            ))}
          </div>

          {/* -- Desktop: table -- */}
          <div className="hidden md:block bg-surface border border-border rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_140px_100px_80px] gap-4 px-5 py-3 border-b border-border">
              {["Plugin", "Status", "Score", "Date"].map(h => (
                <span key={h} className="text-xs font-medium text-foreground/35 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {/* Rows */}
            {submissions.map((sub, i) => (
              <Link
                key={sub.id}
                href={`/dashboard/submissions/${sub.id}`}
                className={`
                  grid grid-cols-[1fr_140px_100px_80px] gap-4 px-5 py-4 items-center
                  hover:bg-foreground/3 transition-colors duration-150
                  ${i < submissions.length - 1 ? "border-b border-border" : ""}
                `}
              >
                <span className="text-sm font-medium text-foreground truncate">{sub.plugin_name}</span>
                <StatusBadge status={sub.status} />
                <ScoreBar score={sub.score} />
                <span className="text-xs text-foreground/35">
                  {new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}