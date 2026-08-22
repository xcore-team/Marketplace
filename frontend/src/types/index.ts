export interface Category {
  id: string
  name: string
  slug?: string
  description?: string
  plugin_count?: number
}

export interface LinkedAccount {
  provider: string
  provider_email: string | null
  provider_name: string | null
  provider_avatar: string | null
  linked_at: string
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

export interface Tenant {
  id: string
  name: string
  slug: string
  created_at?: string
  is_owner?: boolean
  license_state?: string
}

export interface TenantMembership {
  id: string
  user_id: string
  tenant_id: string
  role_id?: string
  joined_at: string
  is_owner: boolean
  email?: string
}

export interface Permission {
  id: string
  name: string
  description?: string
  source_plugin?: string
  tenant_grantable: boolean
  group?: string
  active: boolean
}

export interface Role {
  id: string
  name: string
  tenant_id?: string
  description?: string
  permissions: Permission[]
}

export interface Invite {
  id: string
  tenant_id: string
  tenant_name?: string
  email: string
  token: string
  role_id?: string
  expires_at: string
  used_at?: string
  is_active: boolean
  invited_by: string
}

export interface TenantMemberWithRoles {
  user_id: string
  email?: string
  primary_role_id?: string
  role_ids: string[]
  is_owner: boolean
}

export interface Plugin {
  id: string
  developer_id: string
  tenant_id?: string
  name: string
  slug: string
  description?: string
  homepage?: string
  repository?: string
  license?: string
  author?: string
  visibility?: string
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
  tenant_id?: string
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
  tenant_id?: string
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

export interface GHTag {
  name: string
  commit_sha?: string
  [key: string]: unknown
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  tenant_id?: string | null
  ip_address?: string | null
  device_fingerprint?: string | null
  last_seen: string
  expires_at: string
  is_current: boolean
}

// ── Notifications (backend) ─────────────────────────────────────────────────

export interface BackendNotification {
  id: string
  user_id: string
  tenant_id?: string | null
  title: string
  message?: string | null
  type: string
  link?: string | null
  is_read: boolean
  created_at: string
}

// ── Tenant settings ──────────────────────────────────────────────────────────

export interface TenantSettings {
  tenant_id: string
  settings: Record<string, unknown>
}

// ── Services (xservices) ────────────────────────────────────────────────────

export interface ServiceCategory {
  id: string
  name: string
  slug: string
  description?: string | null
}

export interface ServiceVersion {
  id: string
  version: string
  anomaly_score: number
  is_stable: boolean
  is_yanked: boolean
  yanked_reason?: string | null
  publish_status: string
  changelog?: string | null
  created_at: string
}

export interface ServiceSummary {
  id: string
  name: string
  slug: string
  description?: string | null
  entry_class?: string | null
  repository?: string | null
  is_published: boolean
  visibility?: string
  avg_rating: number
  rating_count: number
  install_count: number
  categories: ServiceCategory[]
  latest_version?: string | null
  created_at: string
}

export interface Service extends ServiceSummary {
  developer_id: string
  homepage?: string | null
  repository?: string | null
  visibility: string
  tenant_id?: string | null
  versions: ServiceVersion[]
  updated_at: string
}

export interface ServiceDoc {
  id: string
  service_id: string
  version: string
  readme: string | null
  integration: string | null
  contributor: Record<string, unknown> | null
  extracted_at: string
}

export interface ServiceRating {
  id: string
  service_id: string
  user_id: string
  score: number
  comment?: string | null
  created_at: string
}

export type ServiceSubmissionStatus = SubmissionStatus

export interface ServiceSubmission {
  id: string
  developer_id: string
  service_name: string
  service_version: string
  status: ServiceSubmissionStatus
  anomaly_score: number
  category_ids?: string[] | string | null
  source?: string | null
  github_repo?: string | null
  github_branch?: string | null
  created_at: string
  completed_at?: string | null
}

// ── Deployments (xdeployments) ──────────────────────────────────────────────

export interface Deployment {
  id: string
  deployer_id: string
  kind: string
  slug: string
  version: string
  host_id: string
  status: string
  repo?: string | null
  error_message?: string | null
  started_at: string
  completed_at: string
  created_at: string
}

// ── Artefacts .xdeploy (app/xdeploy) ────────────────────────────────────────

export interface XDeployArtifact {
  id: string
  project_id: string
  project_name: string
  version: string
  size_bytes: number
  content_sha256: string
  publisher_id: string
  created_at: string
}

// ── Admin extras ─────────────────────────────────────────────────────────────

export interface DeploymentAdmin extends Deployment {
  deployer_email?: string | null
}

export interface DeveloperOut {
  id: string
  email: string
  github_login?: string | null
  plugin_count: number
}

export interface PluginAdmin {
  id: string
  name: string
  slug: string
  developer_id: string
  developer_email?: string | null
  is_published: boolean
  avg_rating: number
  rating_count: number
  version_count: number
  created_at: string
}

export interface Contributor {
  login: string
  contributions: number
  avatar_url?: string | null
  html_url?: string | null
}

export interface UserGithubLink {
  github_login: string
  github_user_id: string
  linked_at: string
}

// ── Projets & clés de déploiement (xdevkeys) ─────────────────────────────────
//
// Un "projet" cible un plugin ou un service (kind + slug). Une clé API est
// rattachée à un projet : l'agent XCore l'utilise (en-tête X-API-Key) pour
// rapporter les déploiements de cette cible précise. Le secret n'est renvoyé
// qu'une seule fois, à la création (`ApiKeyCreated.key`).

export interface Project {
  id: string
  name: string
  kind: "plugin" | "service" | "xdeploy"
  slug: string
  created_at: string
}

export interface ManifestItem {
  kind: "plugin" | "service"
  slug: string
  version?: string | null
}

export interface Manifest {
  id: string
  project_id: string
  tag: string
  items: ManifestItem[]
  created_by: string
  created_at: string
}

export interface ApiKey {
  id: string
  name: string
  project_id?: string | null
  prefix: string
  is_active: boolean
  created_at: string
  last_used_at?: string | null
  // Clé "personnelle" (xcli login — flux device-code) : pas de projet,
  // valide pour n'importe quel plugin/service public. Toujours false pour
  // les clés créées via ce panneau (projet requis) ; true seulement pour
  // celles nées d'une confirmation /cli/confirm.
  is_personal?: boolean
}

export interface ApiKeyCreated extends ApiKey {
  key: string
  // Uniquement pour un projet kind="xdeploy" (voir ApiKey.deployment_credential_hash
  // côté backend) — second secret requis par `xcore-agent deploy --deployment-credential`,
  // distinct de `key` (xdevkey), révélé une seule fois comme lui.
  deployment_credential?: string | null
}

export interface SigningKey {
  id: string
  label: string
  created_at: string
  updated_at: string
  configured: boolean
}
