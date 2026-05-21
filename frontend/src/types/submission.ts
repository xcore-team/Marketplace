// Basé sur SubmissionOut et Body_submit_plugin de l'API

export type SubmissionStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "manual_review"

// Résultat d'une gate de sécurité individuelle
export interface GateResult {
  name: string             // ex: "dependency_check", "code_scan"
  passed: boolean
  score: number            // 0-100
  message: string | null
  details: string | null
}

// Rapport complet des 9 gates
export interface SecurityReport {
  submission_id: string
  total_score: number      // 0-100 (≤30 auto-approved, 31-79 manual, ≥80 rejected)
  gates: GateResult[]
  created_at: string
}

export interface Submission {
  id: string
  plugin_name: string
  status: SubmissionStatus
  score: number | null     // null si pas encore traité
  created_at: string
  updated_at: string
}

export interface PaginatedSubmissions {
  items: Submission[]
  total: number
  page: number
  size: number
}