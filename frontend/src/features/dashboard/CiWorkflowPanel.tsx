import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Copy, Check, KeyRound, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { devkeys as devkeysApi, github as githubApi } from '../../api'
import { useToast } from '../../components/Toast'
import { RevealedKeyBanner } from '../../components/ui'
import type { ApiKeyCreated, Project } from '../../types'

/**
 * CI/CD (GitHub Actions) — republication automatique à chaque push de tag.
 * Réutilise EXACTEMENT le chemin déjà validé manuellement (POST .../recompute
 * avec X-API-Key) : voir routes/github.py::recompute_from_ci côté backend.
 * Regroupe ici les deux étapes qu'un développeur devait auparavant faire à
 * des endroits séparés (créer une clé sur la page Déploiements, deviner le
 * contenu du workflow) — tout se passe désormais depuis l'Atelier, au même
 * endroit que le choix du repo.
 */
export default function CiWorkflowPanel({ owner, repo }: { owner: string; repo: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState<{ key: ApiKeyCreated; projectName: string } | null>(null)

  // Même dérivation que le backend (plugin_name = repo_name, slug =
  // plugin_name.lower().replace(" ", "-") — voir tasks.py::_run_pipeline) —
  // purement indicatif ici : /github/.../recompute accepte n'importe quelle
  // clé active du développeur, pas seulement une rattachée à ce slug précis
  // (_resolve_api_key, sans vérification de projet — contrairement à
  // _resolve_api_key_for_plugin utilisée par l'installation marketplace).
  const derivedSlug = repo.toLowerCase().replace(/\s+/g, '-')

  const { data: workflow, isLoading: workflowLoading, refetch: fetchWorkflow } = useQuery({
    queryKey: ['ci-workflow', owner, repo],
    queryFn: () => githubApi.ciWorkflow(owner, repo),
    enabled: false,
  })

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['devkeys-projects'],
    queryFn: devkeysApi.projects.list,
    enabled: open,
  })
  const existingProject = (projects ?? []).find((p) => p.kind === 'plugin' && p.slug === derivedSlug)

  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const project =
        existingProject ??
        (await devkeysApi.projects.create({ name: repo, kind: 'plugin', slug: derivedSlug }))
      const created = await devkeysApi.create({ name: `ci-${repo}`, project_id: project.id })
      return { created, projectName: project.name }
    },
    onSuccess: ({ created, projectName }) => {
      toast('Clé API créée pour la CI.', 'success')
      setRevealed({ key: created, projectName })
      queryClient.invalidateQueries({ queryKey: ['devkeys-projects'] })
      queryClient.invalidateQueries({ queryKey: ['devkeys'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const copyWorkflow = async () => {
    if (!workflow?.content) return
    await navigator.clipboard.writeText(workflow.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <button
        className="panel__header"
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && !workflow) fetchWorkflow()
        }}
      >
        <span className="flex items-center gap-2">
          <GitBranch size={15} /> CI/CD — republier automatiquement à chaque tag Git
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="panel__body">
          <p className="text-xs text-muted mb-4">
            Ajoutez ce workflow à <code>.github/workflows/xcore-publish.yml</code> dans {owner}/{repo} : chaque{' '}
            <code>git push --tags</code> republiera automatiquement cette version sur le Hub, sans repasser par ce
            formulaire.
          </p>

          {revealed && (
            <RevealedKeyBanner created={revealed.key} projectName={revealed.projectName} onDismiss={() => setRevealed(null)} />
          )}

          <div className="input-label" style={{ marginBottom: 4 }}>
            1. Clé API — à stocker comme secret du repo, nommé <code className="text-acc">XCORE_API_KEY</code>
          </div>
          {existingProject ? (
            <p className="text-xs text-faint mb-3">
              Un projet « {existingProject.name} » existe déjà pour ce repo. Créez-lui une clé si vous n'en avez pas
              gardé une.
            </p>
          ) : (
            <p className="text-xs text-faint mb-3">Aucun projet pour ce repo pour l'instant — la clé en créera un.</p>
          )}
          <button className="btn btn-secondary btn-sm mb-4" disabled={createKeyMutation.isPending} onClick={() => createKeyMutation.mutate()}>
            {createKeyMutation.isPending ? (
              <><Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Création…</>
            ) : (
              <><KeyRound size={13} /> Créer une clé pour ce repo</>
            )}
          </button>

          <div className="input-label" style={{ marginBottom: 4 }}>2. Workflow GitHub Actions</div>
          {workflowLoading ? (
            <div className="flex items-center gap-2 text-muted text-xs"><div className="spinner" /> Génération…</div>
          ) : workflow ? (
            <>
              <div style={{ position: 'relative' }}>
                <pre
                  className="font-mono text-xs"
                  style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
                    padding: '14px 16px', overflowX: 'auto', maxHeight: 320, overflowY: 'auto', margin: 0,
                  }}
                >
                  {workflow.content}
                </pre>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ position: 'absolute', top: 10, right: 10 }}
                  onClick={copyWorkflow}
                >
                  {copied ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
                </button>
              </div>
              <p className="text-xs text-faint mt-2">
                Chemin : <code>{workflow.filename}</code>
              </p>
            </>
          ) : (
            <p className="text-xs text-faint">Le workflow apparaîtra ici.</p>
          )}
        </div>
      )}
    </div>
  )
}
