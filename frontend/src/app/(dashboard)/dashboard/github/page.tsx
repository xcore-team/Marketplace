"use client"

import { useCallback, useEffect, useState } from "react"
import { GitBranch, Link2, Link2Off, RefreshCw, ArrowRight } from "lucide-react"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"
import Input from "@/components/ui/Input"
import { getGitHubLink, linkGitHub, unlinkGitHub, getGitHubRepos, publishFromGitHub } from "@/services/githubService"
import type { GitHubAccount, GitHubRepo } from "@/types/github"

function LinkGitHubForm({ onLinked }: { onLinked: (account: GitHubAccount) => void }) {
  const [token, setToken] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true); setError(null)
    try {
      const account = await linkGitHub(token)
      onLinked(account)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect GitHub")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
        <GitBranch size={26} className="text-foreground/50" strokeWidth={1.5} />
      </div>
      <h2 className="text-base font-semibold text-foreground mb-1">Connect your GitHub account</h2>
      <p className="text-sm text-foreground/45 mb-6 max-w-sm mx-auto">
        Link your GitHub to publish plugins directly from your repositories
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm mx-auto text-left">
        <FormField label="Personal Access Token" hint="Generate a token with repo read access on github.com/settings/tokens">
          <Input type="password" icon={Link2} placeholder="ghp_xxxxxxxxxxxx"
            value={token} onChange={(e) => setToken(e.target.value)} />
        </FormField>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" fullWidth icon={ArrowRight} disabled={!token.trim()} isLoading={isLoading}>
          Connect GitHub
        </Button>
      </form>
    </div>
  )
}

function RepoList({ repos }: { repos: GitHubRepo[] }) {
  const [publishing, setPublishing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePublish = async (repo: GitHubRepo) => {
    setPublishing(repo.full_name); setError(null)
    try {
      await publishFromGitHub({
        full_name: repo.full_name,
        default_branch: repo.default_branch,
        plugin_version: "1.0.0",   // à rendre configurable plus tard
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setPublishing(null)
    }
  }

  return (
    <>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex flex-col gap-2">
        {repos.map(repo => (
          <div key={repo.full_name}
            className="flex items-center justify-between bg-surface border border-border rounded-xl px-5 py-4 hover:border-primary/20 transition-colors duration-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-foreground truncate">{repo.name}</span>
                <span className="text-xs text-foreground/30 font-mono shrink-0">{repo.default_branch}</span>
              </div>
              {repo.description && <p className="text-xs text-foreground/40 truncate">{repo.description}</p>}
            </div>
            <Button size="sm" variant="outline" icon={ArrowRight}
              isLoading={publishing === repo.full_name}
              onClick={() => handlePublish(repo)}
              className="ml-4 shrink-0">
              Publish
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}

export default function GitHubPage() {
  const [account, setAccount] = useState<GitHubAccount | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reposLoading, setReposLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRepos = useCallback(() => {
    setReposLoading(true)
    getGitHubRepos()
      .then(setRepos)
      .catch(() => setError("Unable to load your GitHub repositories right now"))
      .finally(() => setReposLoading(false))
  }, [])

  useEffect(() => {
    getGitHubLink()
      .then(acc => {
        setAccount(acc)
        if (acc) {
          loadRepos()
        }
      })
      .catch(() => setError("Unable to load your GitHub connection right now"))
      .finally(() => setIsLoading(false))
  }, [loadRepos])

  const handleUnlink = async () => {
    await unlinkGitHub()
    setAccount(null); setRepos([])
  }

  if (isLoading) return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="h-40 bg-foreground/5 rounded-2xl animate-pulse" />
    </div>
  )

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1">
          <GitBranch size={18} className="text-primary" strokeWidth={1.8} />
          <h1 className="text-xl font-semibold text-foreground">GitHub</h1>
        </div>
        <p className="text-sm text-foreground/50">Link your GitHub account to publish plugins from your repositories</p>
      </div>

      {error && <p className="text-sm text-red-400 mb-6">{error}</p>}

      {!account ? (
        <LinkGitHubForm onLinked={(acc) => { setAccount(acc); loadRepos() }} />
      ) : (
        <>
          <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-5 py-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <GitBranch size={15} className="text-emerald-400" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{account.github_login}</p>
                <p className="text-xs text-foreground/40">Connected GitHub account</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={loadRepos}>Refresh</Button>
              <Button variant="ghost" size="sm" icon={Link2Off} onClick={handleUnlink}
                className="text-red-400 hover:text-red-400 hover:bg-red-400/8">
                Disconnect
              </Button>
            </div>
          </div>

          <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3">
            Your Repositories {!reposLoading && `(${repos.length})`}
          </h2>
          {reposLoading
            ? <div className="flex flex-col gap-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-foreground/5 rounded-xl animate-pulse" />)}</div>
            : <RepoList repos={repos} />
          }
        </>
      )}
    </div>
  )
}