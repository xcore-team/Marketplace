// Basé sur GitHubAccountOut, LinkGitHubRequest, SubmitGitHubRequest

export interface GitHubAccount {
  github_username: string
  github_url: string
  connected_at: string
}

export interface GitHubRepo {
  name: string
  full_name: string        // "username/repo"
  description: string | null
  html_url: string
  default_branch: string
  updated_at: string
}

export interface LinkGitHubRequest {
  github_token: string     // Personal Access Token GitHub
}

export interface PublishFromGitHubRequest {
  repo_full_name: string   // "username/repo"
  branch: string           // branche à publier
}