"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { getSubmission, getSubmissionReport } from "@/services/submissionService"
import type { Submission, SecurityReport, GateResult } from "@/types/submission"

function GateCard({ gate }: { gate: GateResult }) {
  const Icon = gate.passed ? ShieldCheck : ShieldX
  return (
    <div className={`border rounded-xl p-4 ${gate.passed ? "border-emerald-500/15 bg-emerald-500/[0.03]" : "border-red-500/15 bg-red-500/[0.03]"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Icon size={15} strokeWidth={1.8} className={gate.passed ? "text-emerald-400" : "text-red-400"} />
          <span className="text-sm font-medium text-foreground">{gate.name}</span>
        </div>
        <span className={`text-xs font-mono font-semibold shrink-0 ${gate.passed ? "text-emerald-400" : "text-red-400"}`}>
          +{gate.score}
        </span>
      </div>
      <p className="text-xs text-foreground/50 mb-1">{gate.message}</p>
      {gate.details && (
        <p className="text-xs text-foreground/35 leading-relaxed border-t border-border pt-2 mt-2">{gate.details}</p>
      )}
    </div>
  )
}

function ScoreGauge({ score }: { score: number }) {
  const verdict =
    score <= 30 ? { label: "Auto-approved", color: "text-emerald-400", bg: "bg-emerald-400" } :
    score <= 79 ? { label: "Manual Review", color: "text-orange-400", bg: "bg-orange-400" } :
                  { label: "Rejected",      color: "text-red-400",    bg: "bg-red-400" }
  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex items-center gap-6">
      <div className="text-center shrink-0">
        <div className={`text-4xl font-bold font-mono ${verdict.color}`}>{score}</div>
        <div className="text-xs text-foreground/35 mt-0.5">/ 100</div>
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-xs text-foreground/35 mb-1.5">
          <span>0 — Auto</span><span>30</span><span>79</span><span>100 — Rejected</span>
        </div>
        <div className="w-full h-2 bg-foreground/8 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${verdict.bg} transition-all duration-700`} style={{ width: `${score}%` }} />
        </div>
        <div className={`text-sm font-semibold mt-2 ${verdict.color}`}>{verdict.label}</div>
      </div>
    </div>
  )
}

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [report, setReport] = useState<SecurityReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([getSubmission(id), getSubmissionReport(id)])
      .then(([sub, rep]) => { setSubmission(sub); setReport(rep) })
      .catch(() => setError("Failed to load submission"))
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="h-6 w-32 bg-foreground/5 rounded animate-pulse mb-8" />
      <div className="h-40 bg-foreground/5 rounded-xl animate-pulse mb-4" />
      <div className="grid grid-cols-1 gap-2">
        {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-foreground/5 rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  if (error || !submission) return (
    <div className="p-8 text-center">
      <p className="text-sm text-red-400">{error ?? "Submission not found"}</p>
      <Link href="/dashboard/submissions" className="text-sm text-primary mt-4 inline-block">← Back</Link>
    </div>
  )

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/dashboard/submissions" className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground transition-colors mb-6">
        <ArrowLeft size={14} strokeWidth={2} /> Back to submissions
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground mb-1">{submission.plugin_name}</h1>
        <p className="text-sm text-foreground/40">
          Submitted {new Date(submission.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {report && (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShieldAlert size={14} strokeWidth={1.8} /> Security Score
            </h2>
            <ScoreGauge score={report.total_score} />
          </div>
          <div>
            <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3">
              Security Gates ({report.gates.filter(g => g.passed).length}/{report.gates.length} passed)
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {report.gates.map(gate => <GateCard key={gate.name} gate={gate} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}