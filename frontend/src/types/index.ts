export interface Category {
  id: string
  name: string
  slug?: string
  description?: string
  plugin_count?: number
}

export interface PluginVersion {
  id: string
  version: string
  anomaly_score: number
  is_stable: boolean
  is_yanked: boolean
  yanked_reason?: string
  publish_status: string
  changelog?: string
  created_at: string
}

export interface Plugin {
  id: string
  developer_id: string
  name: string
  slug: string
  description?: string
  homepage?: string
  repository?: string
  license?: string
  author?: string
  is_published: boolean
  download_count: number
  latest_version?: string
  average_score?: number
  avg_rating?: number
  rating_count?: number
  category?: Category
  categories?: Category[]
  versions?: PluginVersion[]
  created_at: string
  published_at?: string
}

export interface User {
  id: string
  email: string
  is_active: boolean
  is_superuser?: boolean
  mfa_enabled?: boolean
  created_at?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  mfa_required?: boolean
  mfa_token?: string
  user_id?: string
  tenant_id?: string
}

export type SubmissionStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'manual_review' | 'failed'

export interface Submission {
  id: string
  developer_id: string
  plugin_name: string
  plugin_version: string
  status: SubmissionStatus
  score?: number
  anomaly_score?: number
  error_msg?: string
  source?: string
  github_repo?: string
  plugin?: Plugin
  created_at: string
  updated_at?: string
}

export interface Rating {
  id: string
  user_id: string
  plugin_id: string
  score: number
  comment?: string
  reviewer_name?: string
  created_at: string
}

export interface PagedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export interface ApiError {
  detail: string
  status: number
}

export interface PluginDoc {
  id: string
  plugin_id: string
  version: string
  readme: string | null
  integration: string | null
  contributor: Record<string, unknown> | null
  extracted_at: string
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type GateStatus = 'passed' | 'failed' | 'blocked'

export interface Finding {
  message: string
  severity: FindingSeverity
  file?: string | null
  line?: number | null
  code?: string | null
  remediation?: string | null
}

export interface PipelineGate {
  gate: string
  status: GateStatus
  anomaly_score: number
  findings: Finding[]
  duration_seconds: number
  completed_at?: number
}

export interface SeveritySummary {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface SubmissionReport {
  submission_id?: string
  plugin_name?: string
  plugin_version?: string
  status?: string
  anomaly_score?: number
  summary?: SeveritySummary
  merkle_root?: string | null
  recommendation?: string | null
  gates?: PipelineGate[]
  error?: string | null
  [key: string]: unknown
}

export interface Webhook {
  id: string
  url: string
  events: string
  is_active: boolean
  created_at: string
  last_triggered_at?: string
  last_status_code?: number
  last_error?: string
}

export interface GHLink {
  github_login: string
  github_user_id: string
  scopes: string | null
  linked: boolean
}

export interface GHRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  default_branch: string
  language: string | null
  stargazers_count: number
  updated_at: string
  html_url: string
}
