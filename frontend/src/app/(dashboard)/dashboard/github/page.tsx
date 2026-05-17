"use client"



import { useState } from "react"
import { GitBranch, Link2, Link2Off, RefreshCw, ArrowRight } from "lucide-react"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"
import Input from "@/components/ui/Input"
import type { GitHubAccount, GitHubRepo } from "@/types/github"



const MOCK_ACCOUNT: GitHubAccount | null = null 

const MOCK_REPOS: GitHubRepo[] = [
  {
    name: "xauth-plugin",
    full_name: "moussa/xauth-plugin",
    description: "Authentication middleware for xcore",
    html_url: "https://github.com/moussa/xauth-plugin",
    default_branch: "main",
    updated_at: "2026-05-10T12:00:00Z",
  },
  {
    name: "data-transformer",
    full_name: "moussa/data-transformer",
    description: "Real-time data transformation plugin",
    html_url: "https://github.com/moussa/data-transformer",
    default_branch: "main",
    updated_at: "2026-05-14T09:00:00Z",
  },
]



function LinkGitHubForm({ onLinked }: { onLinked: () => void }) {
  const [token, setToken] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log("Linking GitHub with token:", token)
    onLinked()
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
        <Link2 size={26} className="text-foreground/50" strokeWidth={1.5} />
      </div>

      <h2 className="text-base font-semibold text-foreground mb-1">
        Connect your GitHub account
      </h2>
      <p className="text-sm text-foreground/45 mb-6 max-w-sm mx-auto">
        Link your GitHub to publish plugins directly from your repositories
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm mx-auto text-left">
        <FormField
          label="Personal Access Token"
          hint="Generate a token with repo read access on github.com/settings/tokens"
        >
          <Input
            type="password"
            icon={Link2}
            placeholder="ghp_xxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </FormField>

        <Button
          type="submit"
          fullWidth
          icon={ArrowRight}
          disabled={!token.trim()}
        >
          Connect GitHub
        </Button>
      </form>
    </div>
  )
}



function RepoList({ repos }: { repos: GitHubRepo[] }) {
  const [publishing, setPublishing] = useState<string | null>(null)

  const handlePublish = (repo: GitHubRepo) => {
    setPublishing(repo.full_name)

    console.log("Publishing from:", repo.full_name)
    setTimeout(() => setPublishing(null), 2000)
  }

  return (
    <div className="flex flex-col gap-2">
      {repos.map((repo) => (
        <div
          key={repo.full_name}
          className="flex items-center justify-between bg-surface border border-border rounded-xl px-5 py-4 hover:border-primary/20 transition-colors duration-200"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-foreground truncate">
                {repo.name}
              </span>
              <span className="text-xs text-foreground/30 font-mono shrink-0">
                {repo.default_branch}
              </span>
            </div>
            {repo.description && (
              <p className="text-xs text-foreground/40 truncate">{repo.description}</p>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            icon={ArrowRight}
            isLoading={publishing === repo.full_name}
            onClick={() => handlePublish(repo)}
            className="ml-4 shrink-0"
          >
            Publish
          </Button>
        </div>
      ))}
    </div>
  )
}



export default function GitHubPage() {
  const [account, setAccount] = useState<GitHubAccount | null>(MOCK_ACCOUNT)

  return (
    <div className="p-8 max-w-3xl mx-auto">

      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <GitBranch size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">GitHub</h1>
        </div>
        <p className="text-sm text-foreground/50">
          Link your GitHub account to publish plugins from your repositories
        </p>
      </div>

      {!account ? (
        <LinkGitHubForm onLinked={() => setAccount({
          github_username: "moussa",
          github_url: "https://github.com/moussa",
          connected_at: new Date().toISOString(),
        })} />
      ) : (

        <>
          <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-5 py-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <GitBranch size={15} className="text-emerald-400" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {account.github_username}
                </p>
                <p className="text-xs text-foreground/40">Connected GitHub account</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                onClick={() => console.log("Refreshing repos...")}
              >
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Link2Off}
                onClick={() => setAccount(null)}
                className="text-red-400 hover:text-red-400 hover:bg-red-400/8"
              >
                Disconnect
              </Button>
            </div>
          </div>

          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3">
            Your Repositories ({MOCK_REPOS.length})
          </h2>
          <RepoList repos={MOCK_REPOS} />
        </>
      )}

    </div>
  )
}