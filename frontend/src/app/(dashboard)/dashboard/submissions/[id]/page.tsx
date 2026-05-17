"use client"



import { ArrowLeft, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react"
import Link from "next/link"
import type { GateResult, SecurityReport, Submission } from "@/types/submission"



const MOCK_SUBMISSION: Submission = {
  id: "sub-002",
  plugin_name: "Data Transformer",
  status: "manual_review",
  score: 55,
  created_at: "2026-05-14T08:00:00Z",
  updated_at: "2026-05-14T08:30:00Z",
}

const MOCK_REPORT: SecurityReport = {
  submission_id: "sub-002",
  total_score: 55,
  created_at: "2026-05-14T08:30:00Z",
  gates: [
    { name: "Dependency Check",   passed: true,  score: 5,  message: "No vulnerable dependencies found", details: null },
    { name: "Code Scan",          passed: true,  score: 8,  message: "No malicious patterns detected",   details: null },
    { name: "License Check",      passed: true,  score: 3,  message: "All licenses compatible",          details: null },
    { name: "API Surface",        passed: false, score: 18, message: "Excessive permissions requested",  details: "Plugin requests filesystem write access beyond expected scope" },
    { name: "Network Activity",   passed: false, score: 12, message: "Unexpected external connections",  details: "Detected calls to 3 external domains not declared in manifest" },
    { name: "Resource Usage",     passed: true,  score: 4,  message: "Within resource limits",           details: null },
    { name: "Manifest Integrity", passed: true,  score: 2,  message: "Manifest valid and complete",      details: null },
    { name: "Signature Check",    passed: true,  score: 1,  message: "Valid developer signature",        details: null },
    { name: "Sandbox Test",       passed: false, score: 2,  message: "Sandbox exit detected",            details: "Plugin attempted to break sandbox containment during test execution" },
  ],
}



function GateCard({ gate }: { gate: GateResult }) {
  const Icon = gate.passed ? ShieldCheck : ShieldX

  return (
    <div className={`
      border rounded-xl p-4
      ${gate.passed
        ? "border-emerald-500/15 bg-emerald-500/[0.03]"
        : "border-red-500/15 bg-red-500/[0.03]"
      }
    `}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Icon
            size={15}
            strokeWidth={1.8}
            className={gate.passed ? "text-emerald-400" : "text-red-400"}
          />
          <span className="text-sm font-medium text-foreground">
            {gate.name}
          </span>
        </div>
        <span className={`
          text-xs font-mono font-semibold shrink-0
          ${gate.passed ? "text-emerald-400" : "text-red-400"}
        `}>
          +{gate.score}
        </span>
      </div>

      <p className="text-xs text-foreground/50 mb-1">{gate.message}</p>

      {gate.details && (
        <p className="text-xs text-foreground/35 leading-relaxed border-t border-border pt-2 mt-2">
          {gate.details}
        </p>
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
          <span>0 — Auto</span>
          <span>30</span>
          <span>79</span>
          <span>100 — Rejected</span>
        </div>
        <div className="w-full h-2 bg-foreground/8 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${verdict.bg} transition-all duration-700`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className={`text-sm font-semibold mt-2 ${verdict.color}`}>
          {verdict.label}
        </div>
      </div>
    </div>
  )
}



export default function SubmissionDetailPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">

      <Link
        href="/dashboard/submissions"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Back to submissions
      </Link>


      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground mb-1">
          {MOCK_SUBMISSION.plugin_name}
        </h1>
        <p className="text-sm text-foreground/40">
          Submitted {new Date(MOCK_SUBMISSION.created_at).toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric"
          })}
        </p>
      </div>


      <div className="mb-6">
        <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3 flex items-center gap-2">
          <ShieldAlert size={14} strokeWidth={1.8} />
          Security Score
        </h2>
        <ScoreGauge score={MOCK_REPORT.total_score} />
      </div>


      <div>
        <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3">
          Security Gates ({MOCK_REPORT.gates.filter(g => g.passed).length}/{MOCK_REPORT.gates.length} passed)
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {MOCK_REPORT.gates.map((gate) => (
            <GateCard key={gate.name} gate={gate} />
          ))}
        </div>
      </div>

    </div>
  )
}