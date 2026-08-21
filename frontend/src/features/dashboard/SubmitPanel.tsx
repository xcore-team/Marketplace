import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Search, Star, Check, Loader2, Link2, Send, EyeOff, Inbox, Globe, Lock } from 'lucide-react'
import { categories as catsApi, github as githubApi, submissions as subsApi } from '../../api'
import { useToast } from '../../components/Toast'
import { ListRow } from '../../components/ui'
import CiWorkflowPanel from './CiWorkflowPanel'
import type { Category, PagedResponse, GHLink, GHRepo, GHTag } from '../../types'

export default function SubmitPanel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [pat, setPat] = useState('')
  const [showPat, setShowPat] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<GHRepo | null>(null)
  const [repoSearch, setRepoSearch] = useState('')
  const [version, setVersion] = useState('1.0.0')
  // Le tag Git réel (ex. "v1.0.0") est distinct de `version` (ex. "1.0.0") —
  // le backend exige les deux et force le déploiement sur ce tag précis
  // (SubmitGitHubRequest.tag, jamais une branche). Sans ce champ séparé,
  // seul `version` était envoyé sous `default_branch`, un champ que le
  // backend ignore totalement : la publication échouait toujours en 422.
  const [tag, setTag] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const { data: catsData } = useQuery({ queryKey: ['categories'], queryFn: catsApi.list })
  const cats: Category[] = Array.isArray(catsData) ? catsData : (catsData as PagedResponse<Category>)?.items ?? []

  const toggleCategory = (id: string) => {
    setCategoryIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const { data: ghLink, isLoading: linkLoading, refetch: refetchLink } = useQuery<GHLink | null>({
    queryKey: ['github-link'],
    queryFn: async () => { try { return await githubApi.getLink() } catch { return null } },
  })

  // Retour de githubApi.linkViaOAuth() — xauth a déjà notifié le marketplace
  // en interne (xauth.oauth.linked) avant même cette redirection, donc
  // DeveloperGitHubToken est à jour ; on rafraîchit juste la query locale.
  useEffect(() => {
    if (searchParams.get('success') === 'true' && searchParams.get('provider') === 'github') {
      toast('GitHub lié avec accès aux repos !', 'success')
      refetchLink()
      searchParams.delete('success'); searchParams.delete('provider'); searchParams.delete('email')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // manifest=plugin.yaml : ne montre que les repos qui sont réellement des
  // plugins XCore, pas tous les repos GitHub du compte lié.
  const { data: repos, isLoading: reposLoading } = useQuery<GHRepo[]>({
    queryKey: ['github-repos', 'plugin.yaml'],
    queryFn: () => githubApi.repos(1, 'plugin.yaml'),
    enabled: !!ghLink,
  })

  const [repoOwner, repoNameOnly] = selectedRepo ? selectedRepo.full_name.split('/') : [null, null]
  const { data: repoTags, isLoading: tagsLoading } = useQuery<GHTag[]>({
    queryKey: ['github-tags', selectedRepo?.full_name],
    queryFn: () => githubApi.tags(repoOwner!, repoNameOnly!),
    enabled: !!selectedRepo,
    retry: false,
  })

  const { data: subsData } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => subsApi.list(),
    enabled: !!ghLink,
  })
  const recentSubs = (subsData ?? []).slice(0, 3)

  const linkMutation = useMutation({
    mutationFn: () => githubApi.link(pat.trim()),
    onSuccess: () => { toast('Compte GitHub lié !', 'success'); setPat(''); refetchLink() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const unlinkMutation = useMutation({
    mutationFn: () => githubApi.unlink(),
    onSuccess: () => {
      toast('Compte GitHub délié.', 'info')
      queryClient.removeQueries({ queryKey: ['github-repos'] })
      setSelectedRepo(null)
      refetchLink()
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const submitMutation = useMutation({
    mutationFn: () => githubApi.publish({
      full_name: selectedRepo!.full_name,
      tag,
      plugin_version: version.trim(),
      category_ids: categoryIds,
      visibility,
    }),
    onSuccess: () => {
      toast('Soumission envoyée ! Validation en cours…', 'success')
      setSelectedRepo(null)
      setVersion('1.0.0')
      setTag('')
      setCategoryIds([])
      setVisibility('public')
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const filteredRepos = (repos ?? []).filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(repoSearch.toLowerCase())
  )

  const canSubmit = selectedRepo && version.trim() && tag && !submitMutation.isPending

  if (linkLoading) {
    return (
      <div className="panel"><div className="panel__body">
        <div className="page-loading" style={{ minHeight: 200 }}>
          <div className="spinner" /><span className="text-muted text-sm">Vérification du compte GitHub…</span>
        </div>
      </div></div>
    )
  }

  if (!ghLink) {
    return (
      <div className="panel"><div className="panel__body">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="auth-icon-circle"><GitBranch size={24} /></div>
          <h3 className="font-bold" style={{ fontSize: 22, marginBottom: 8 }}>Liez votre GitHub</h3>
          <p className="text-sm text-muted" style={{ maxWidth: 360, margin: '0 auto' }}>
            XCoreHub se connecte directement à vos repositories pour automatiser la publication.
          </p>
        </div>
        <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '12px 24px', margin: '0 auto', display: 'flex' }}
          onClick={() => githubApi.linkViaOAuth()}>
          <GitBranch size={18} /> Lier via GitHub
        </button>
        <p className="text-xs text-faint" style={{ textAlign: 'center', marginTop: 10 }}>
          Déjà connecté(e) avec GitHub ? Ceci redemande juste l'accès aux repos (scope <code style={{ color: 'var(--acc)', fontFamily: 'var(--f-mono)' }}>repo</code>), pas une reconnexion.
        </p>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          {showPat ? (
            <div className="panel panel--muted" style={{ padding: 20, maxWidth: 360, margin: '0 auto', textAlign: 'left' }}>
              <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Personal Access Token</div>
              <p className="text-xs text-muted" style={{ marginBottom: 16 }}>Pour un compte différent, ou si votre organisation restreint les apps OAuth.</p>
              <div className="input-wrap mb-4">
                <input type="password" className="input" placeholder="ghp_xxxxxxxxxxxx" value={pat} onChange={(e) => setPat(e.target.value)} />
              </div>
              <button className="btn btn-secondary w-full" style={{ justifyContent: 'center' }} disabled={!pat.trim() || linkMutation.isPending} onClick={() => linkMutation.mutate()}>
                {linkMutation.isPending ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Liaison…</> : <><Link2 size={14} /> Lier manuellement</>}
              </button>
            </div>
          ) : (
            <span className="text-xs text-faint" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowPat(true)}>
              Lier avec un Personal Access Token à la place
            </span>
          )}
        </div>
      </div></div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="panel"><div className="panel__body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 className="font-bold" style={{ fontSize: 18 }}>Nouvelle publication</h3>
            <p className="text-xs text-muted">Sélectionnez un repository pour commencer le pipeline.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)', padding: '6px 12px', borderRadius: 'var(--r-full)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <img src={`https://github.com/${ghLink.github_login}.png`} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
              <span className="text-xs font-bold">@{ghLink.github_login}</span>
            </div>
            <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
            <button className="text-xs font-medium" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              disabled={unlinkMutation.isPending} onClick={() => unlinkMutation.mutate()}>Délier</button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="search-bar mb-4">
            <Search size={16} style={{ color: 'var(--text3)' }} />
            <input placeholder="Filtrer mes repositories GitHub…" value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)} />
          </div>

          {reposLoading ? (
            <div className="page-loading" style={{ minHeight: 160 }}><div className="spinner" /></div>
          ) : (
            <div className="list" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {filteredRepos.map((repo) => (
                <ListRow
                  key={repo.id}
                  onClick={() => setSelectedRepo(repo)}
                  selected={selectedRepo?.id === repo.id}
                  title={<>{repo.name}{repo.private && <EyeOff size={12} style={{ color: 'var(--text3)' }} />}</>}
                  description={repo.full_name}
                  meta={[
                    <span className="flex items-center gap-1"><Star size={11} fill="var(--warning)" color="var(--warning)" /> {repo.stargazers_count}</span>,
                    ...(repo.language ? [repo.language] : []),
                  ]}
                  side={selectedRepo?.id === repo.id ? <Check size={16} style={{ color: 'var(--acc)' }} strokeWidth={3} /> : undefined}
                />
              ))}
              {filteredRepos.length === 0 && (
                <div className="text-xs text-faint" style={{ padding: 16 }}>Aucun repository ne correspond à ce filtre.</div>
              )}
            </div>
          )}
        </div>

        {selectedRepo && (
          <div className="panel panel--muted" style={{ padding: 20 }}>
            <div className="flex items-center gap-3 mb-5">
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--acc)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</div>
              <h4 className="font-bold">Configuration du module</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div className="input-wrap">
                <label className="input-label">Tag Git *</label>
                {tagsLoading ? (
                  <div className="text-xs text-faint flex items-center gap-1"><Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> Chargement des tags…</div>
                ) : (repoTags?.length ?? 0) > 0 ? (
                  <select className="select" value={tag} onChange={(e) => {
                    setTag(e.target.value)
                    if (!version || version === '1.0.0') setVersion(e.target.value.replace(/^v/, ''))
                  }}>
                    <option value="">Choisir un tag…</option>
                    {repoTags!.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-faint">Aucun tag trouvé sur ce repo — publiez une release Git (tag) avant de soumettre ici.</p>
                )}
              </div>
              <div className="input-wrap">
                <label className="input-label">Version cible *</label>
                <input type="text" className="input" placeholder="e.g. 1.0.0" value={version} onChange={(e) => setVersion(e.target.value)} />
                <p className="text-xs text-faint" style={{ marginTop: 4 }}>Doit correspondre au tag choisi ('1.0.0' ou 'v1.0.0').</p>
              </div>
            </div>
            <div className="input-wrap" style={{ marginBottom: 20 }}>
              <label className="input-label">Catégories Hub (multi-sélection)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-md)', border: '1px solid var(--border2)' }}>
                {cats.map(c => (
                  <div key={c.id} onClick={() => toggleCategory(c.id)} className={`badge ${categoryIds.includes(c.id) ? 'badge-acc' : 'badge-ghost'}`} style={{ cursor: 'pointer' }}>{c.name}</div>
                ))}
              </div>
            </div>
            <div className="input-wrap" style={{ marginBottom: 20 }}>
              <label className="input-label">Visibilité</label>
              <div className="segmented" style={{ width: 'fit-content' }}>
                <button type="button" className={`segmented__item${visibility === 'public' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setVisibility('public')}>
                  <Globe size={13} /> Public
                </button>
                <button type="button" className={`segmented__item${visibility === 'private' ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setVisibility('private')}>
                  <Lock size={13} /> Privé
                </button>
              </div>
              <p className="text-xs text-faint" style={{ marginTop: 6 }}>
                {visibility === 'public' ? 'Visible et installable par tous les utilisateurs du Hub.' : 'Visible uniquement par vous et votre équipe.'}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="text-xs text-muted">Branche par défaut : <span className="font-mono text-acc">{selectedRepo.default_branch}</span> — informatif, la publication se fait toujours depuis le tag choisi</div>
              <button className="btn btn-primary" disabled={!canSubmit} onClick={() => submitMutation.mutate()}>
                {submitMutation.isPending ? <><Loader2 size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Traitement…</> : <><Send size={18} /> Lancer la publication</>}
              </button>
            </div>
          </div>
        )}

        {/* Republication auto sur push de tag — clé API + workflow prêts à
            copier-coller, au même endroit que le choix du repo plutôt que
            sur la page Déploiements (conçue pour les clés d'agent, pas pour
            ce cas d'usage CI). */}
        {selectedRepo && repoOwner && repoNameOnly && (
          <CiWorkflowPanel owner={repoOwner} repo={repoNameOnly} />
        )}
      </div></div>

      {/* Sous le panneau principal, pleine largeur — pas un rail latéral qui
          rétrécissait le repo picker/formulaire dans une colonne étroite. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}><div className="panel__body" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <h4 className="font-bold" style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>Soumissions récentes</h4>
          {recentSubs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentSubs.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'approved' ? 'var(--success)' : s.status === 'rejected' ? 'var(--danger)' : 'var(--warning)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-xs font-bold truncate">{s.plugin_name}</div>
                    <div className="text-xs text-faint">v{s.plugin_version}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: 'var(--text3)' }}>
              <Inbox size={28} strokeWidth={1.5} style={{ opacity: 0.6 }} />
              <span className="text-xs">Aucune activité récente.</span>
            </div>
          )}
        </div></div>

        <div className="alert alert-info" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 0 }}>
          <h4 className="font-bold" style={{ fontSize: 14, marginBottom: 12 }}>Conseils</h4>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <li className="text-xs" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Check size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Assurez-vous que <code>plugin.yaml</code> est à la racine.</span>
            </li>
            <li className="text-xs" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Check size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Incrémentez la version à chaque nouvelle soumission.</span>
            </li>
            <li className="text-xs" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Check size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Utilisez un <code>README.md</code> clair.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
