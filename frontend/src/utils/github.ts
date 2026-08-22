/** Extrait owner/repo d'une URL GitHub (https://github.com/owner/repo[.git]).
 * Partagé entre DeploymentsPage (manifeste .xdeploy) et PluginEditPage /
 * ServiceEditPage (panneau CI/CD) — un seul endroit pour ce parsing plutôt
 * qu'une copie par page. */
export function parseGithubRepo(url?: string | null): { owner: string; repo: string } | null {
  if (!url) return null
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/.]+)/i)
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null
}
