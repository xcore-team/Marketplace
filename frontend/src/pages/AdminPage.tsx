import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Package, Send, Shield, BarChart2,
  CheckCircle, XCircle, Clock, Trash2,
  Megaphone, Terminal, Database, Tag, Plus,
  GitBranch, FileText, Ban, ShieldCheck,
  Search, Eye, EyeOff, AlertTriangle, Server, Info,
} from 'lucide-react'
import { admin as adminApi } from '../api'
import { useToast } from '../components/Toast'
import { PageLoading } from '../components/Skeleton'

type AdminTab = 'stats' | 'users' | 'plugins' | 'submissions' | 'categories' | 'system'

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--success)',
  rejected: 'var(--danger)',
  manual_review: 'var(--amber)',
  pending: 'var(--text3)',
  processing: 'var(--acc)',
  failed: 'var(--danger)',
}
const STATUS_LABEL: Record<string, string> = {
  approved: 'Approuvé', rejected: 'Rejeté', manual_review: 'En révision',
  pending: 'En attente', processing: 'En cours', failed: 'Échoué',
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-')
}

export default function AdminPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<AdminTab>('stats')

  // ── Stats ──────────────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.stats,
  })

  const [msg, setMsg] = useState('')
  const broadcastMutation = useMutation({
    mutationFn: () => adminApi.broadcast(msg),
    onSuccess: () => { toast('Message diffusé !', 'success'); setMsg('') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── Users ──────────────────────────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState('')
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', userSearch],
    queryFn: () => adminApi.users({ search: userSearch || undefined, limit: 50 }),
    enabled: tab === 'users',
  })
  const users: any[] = (usersData as any)?.items ?? []

  const banMutation = useMutation({
    mutationFn: (id: string) => adminApi.banUser(id),
    onSuccess: () => {
      toast('Utilisateur suspendu.', 'info')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const unbanMutation = useMutation({
    mutationFn: (id: string) => adminApi.unbanUser(id),
    onSuccess: () => {
      toast('Utilisateur réactivé.', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      toast('Utilisateur supprimé.', 'info')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── Plugins ────────────────────────────────────────────────────────────────
  const [pluginSearch, setPluginSearch] = useState('')
  const { data: pluginsData, isLoading: pluginsLoading } = useQuery({
    queryKey: ['admin-plugins', pluginSearch],
    queryFn: () => adminApi.plugins({ search: pluginSearch || undefined, limit: 50 }),
    enabled: tab === 'plugins',
  })
  const adminPlugins: any[] = (pluginsData as any)?.items ?? []

  const togglePublishMutation = useMutation({
    mutationFn: ({ slug, is_published }: { slug: string; is_published: boolean }) =>
      adminApi.updatePlugin(slug, { is_published }),
    onSuccess: (_, vars) => {
      toast(vars.is_published ? 'Plugin publié.' : 'Plugin dépublié.', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-plugins'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deletePluginMutation = useMutation({
    mutationFn: (slug: string) => adminApi.deletePlugin(slug),
    onSuccess: () => {
      toast('Extension supprimée.', 'info')
      queryClient.invalidateQueries({ queryKey: ['admin-plugins'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── Submissions ────────────────────────────────────────────────────────────
  const [subsFilter, setSubsFilter] = useState<string>('all')
  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['admin-submissions', subsFilter],
    queryFn: () => adminApi.submissions({
      limit: 50,
      ...(subsFilter !== 'all' ? { status: subsFilter } : {}),
    }),
    enabled: tab === 'submissions',
  })
  const adminSubs: any[] = (subsData as any)?.items ?? []

  const updateSubStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' | 'manual_review' }) =>
      adminApi.updateSubmissionStatus(id, status),
    onSuccess: (_, vars) => {
      toast(`Soumission marquée : ${STATUS_LABEL[vars.status]}.`, 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── Categories ─────────────────────────────────────────────────────────────
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')

  const { data: adminCats, isLoading: catsLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: adminApi.categoriesList,
    enabled: tab === 'categories',
  })
  const categories: any[] = Array.isArray(adminCats) ? adminCats : []

  const createCatMutation = useMutation({
    mutationFn: () => adminApi.categoryCreate({ name: catName.trim(), slug: slugify(catName), description: catDesc || undefined }),
    onSuccess: () => {
      toast('Catégorie créée !', 'success')
      setCatName(''); setCatDesc('')
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => adminApi.categoryDelete(id),
    onSuccess: () => {
      toast('Catégorie supprimée.', 'info')
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── System / Audit ─────────────────────────────────────────────────────────
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminApi.audit({ limit: 50 }),
    enabled: tab === 'system',
  })
  const auditLogs: any[] = Array.isArray(auditData) ? auditData : []

  const { data: sysInfo, isLoading: sysInfoLoading } = useQuery({
    queryKey: ['admin-sysinfo'],
    queryFn: adminApi.systemInfo,
    enabled: tab === 'system',
  })

  const { data: sysDb, isLoading: sysDbLoading } = useQuery({
    queryKey: ['admin-sysdb'],
    queryFn: adminApi.systemDb,
    enabled: tab === 'system',
  })

  // ── Tab config ─────────────────────────────────────────────────────────────
  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'stats', label: "Vue d'ensemble", icon: <BarChart2 size={16} /> },
    { id: 'users', label: 'Utilisateurs', icon: <Users size={16} /> },
    { id: 'plugins', label: 'Extensions', icon: <Package size={16} /> },
    { id: 'submissions', label: 'Soumissions', icon: <Send size={16} /> },
    { id: 'categories', label: 'Catégories', icon: <Tag size={16} /> },
    { id: 'system', label: 'Système', icon: <Terminal size={16} /> },
  ]

  if (statsLoading) return <PageLoading text="Initialisation de la console admin…" />

  return (
    <div className="page">
      <div className="section">
        <div className="section__label">Administration</div>
        <h1 className="hero__title" style={{ fontSize: 32, marginBottom: 32 }}>
          Console <span className="gradient-text">Hub Master</span>
        </h1>

        <div className="dash-tabs mb-8">
          {tabs.map(t => (
            <div key={t.id} className={`dash-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </div>
          ))}
        </div>

        {/* ── Stats ── */}
        {tab === 'stats' && stats && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 40 }}>
              <StatCard label="Utilisateurs" value={stats.users_total} sub={`${stats.users_active} actifs`} icon={<Users />} />
              <StatCard label="Extensions" value={stats.plugins_total} sub={`${stats.plugins_published} publiées`} icon={<Package />} />
              <StatCard label="Soumissions" value={stats.submissions_total} sub={`${stats.submissions_pending} en attente`} icon={<Send />} color="var(--amber)" />
              <StatCard label="Approuvées" value={stats.submissions_approved} sub="pipeline validé" icon={<Shield />} color="var(--success)" />
              <StatCard label="Catégories" value={stats.categories_total} sub="types de plugins" icon={<Tag />} color="var(--text2)" />
            </div>
            <div className="card">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Megaphone size={18} style={{ color: 'var(--acc)' }} /> Diffusion Flash
              </h3>
              <p className="text-xs text-muted mb-4">Envoyez un message instantané à tous les utilisateurs connectés.</p>
              <div className="flex gap-2">
                <input className="input" style={{ flex: 1 }} placeholder="Ex: Maintenance prévue à 22h…"
                  value={msg} onChange={e => setMsg(e.target.value)} />
                <button className="btn btn-primary" disabled={!msg || broadcastMutation.isPending}
                  onClick={() => broadcastMutation.mutate()}>Diffuser</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Users ── */}
        {tab === 'users' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="search-bar mb-6" style={{ maxWidth: 400 }}>
              <Search size={15} style={{ color: 'var(--text3)' }} />
              <input placeholder="Rechercher par email…" value={userSearch}
                onChange={e => setUserSearch(e.target.value)} />
            </div>
            {usersLoading ? (
              <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
            ) : users.length === 0 ? (
              <div className="empty"><div className="empty__title">Aucun utilisateur</div></div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>Email</th><th>Statut</th><th>MFA</th>
                    <th>Plugins</th><th>Soumissions</th><th>Inscription</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {users.map((u: any) => (
                      <tr key={u.id}>
                        <td>
                          <div className="font-bold text-sm">{u.email}</div>
                          {u.github_login && (
                            <div className="text-xs text-faint flex items-center gap-1 mt-1">
                              <GitBranch size={10} /> @{u.github_login}
                            </div>
                          )}
                        </td>
                        <td>
                          {u.is_active
                            ? <span className="badge badge-success">Actif</span>
                            : <span className="badge badge-danger">Suspendu</span>
                          }
                        </td>
                        <td>
                          {u.mfa_enabled
                            ? <ShieldCheck size={14} style={{ color: 'var(--success)' }} />
                            : <span className="text-faint text-xs">—</span>
                          }
                        </td>
                        <td><span className="font-mono text-sm">{u.plugin_count ?? 0}</span></td>
                        <td><span className="font-mono text-sm">{u.submission_count ?? 0}</span></td>
                        <td>
                          <span className="text-xs text-muted">
                            {new Date(u.created_at).toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            {u.is_active ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--amber)', fontSize: 11, padding: '3px 8px' }}
                                disabled={banMutation.isPending}
                                title="Suspendre"
                                onClick={() => {
                                  if (confirm(`Suspendre le compte ${u.email} ?`))
                                    banMutation.mutate(u.id)
                                }}
                              >
                                <Ban size={12} /> Suspendre
                              </button>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--success)', fontSize: 11, padding: '3px 8px' }}
                                disabled={unbanMutation.isPending}
                                title="Réactiver"
                                onClick={() => unbanMutation.mutate(u.id)}
                              >
                                <CheckCircle size={12} /> Réactiver
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              style={{ color: 'var(--danger)' }}
                              title="Supprimer définitivement"
                              disabled={deleteUserMutation.isPending}
                              onClick={() => {
                                if (confirm(`Supprimer définitivement ${u.email} ? Cette action est irréversible.`))
                                  deleteUserMutation.mutate(u.id)
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Plugins ── */}
        {tab === 'plugins' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="search-bar mb-6" style={{ maxWidth: 400 }}>
              <Search size={15} style={{ color: 'var(--text3)' }} />
              <input placeholder="Rechercher par nom…" value={pluginSearch}
                onChange={e => setPluginSearch(e.target.value)} />
            </div>
            {pluginsLoading ? (
              <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
            ) : adminPlugins.length === 0 ? (
              <div className="empty"><div className="empty__title">Aucune extension</div></div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>Nom</th><th>Développeur</th><th>Publication</th>
                    <th>Note</th><th>Versions</th><th>Création</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {adminPlugins.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          <div className="font-bold text-sm">{p.name}</div>
                          <div className="text-xs font-mono text-faint">{p.slug}</div>
                        </td>
                        <td><span className="text-xs text-muted">{p.developer_email ?? p.developer_id?.slice(0, 8)}</span></td>
                        <td>
                          {p.is_published
                            ? <span className="badge badge-success">Publié</span>
                            : <span className="badge badge-ghost">Brouillon</span>
                          }
                        </td>
                        <td>
                          <span className="font-mono text-sm">{p.avg_rating?.toFixed(1) ?? '—'}</span>
                          <span className="text-xs text-faint ml-1">({p.rating_count ?? 0})</span>
                        </td>
                        <td><span className="font-mono text-sm">{p.version_count ?? (p.versions?.length ?? 0)}</span></td>
                        <td>
                          <span className="text-xs text-muted">
                            {new Date(p.created_at).toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '3px 8px', color: p.is_published ? 'var(--text2)' : 'var(--acc)' }}
                              disabled={togglePublishMutation.isPending}
                              title={p.is_published ? 'Dépublier' : 'Publier'}
                              onClick={() => togglePublishMutation.mutate({ slug: p.slug, is_published: !p.is_published })}
                            >
                              {p.is_published ? <EyeOff size={12} /> : <Eye size={12} />}
                              {p.is_published ? 'Dépublier' : 'Publier'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              style={{ color: 'var(--danger)' }}
                              title="Supprimer définitivement"
                              disabled={deletePluginMutation.isPending}
                              onClick={() => {
                                if (confirm(`Supprimer définitivement le plugin "${p.name}" ? Cette action est irréversible.`))
                                  deletePluginMutation.mutate(p.slug)
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Submissions ── */}
        {tab === 'submissions' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            {/* Filtre statut */}
            <div className="flex items-center gap-2 mb-6" style={{ flexWrap: 'wrap' }}>
              {['all', 'pending', 'processing', 'manual_review', 'approved', 'rejected', 'failed'].map(s => (
                <button
                  key={s}
                  className={`btn btn-sm ${subsFilter === s ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setSubsFilter(s)}
                >
                  {s === 'all' ? 'Toutes' : STATUS_LABEL[s] ?? s}
                </button>
              ))}
            </div>

            {subsLoading ? (
              <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
            ) : adminSubs.length === 0 ? (
              <div className="empty"><div className="empty__title">Aucune soumission</div></div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>Plugin</th><th>Version</th><th>Développeur</th>
                    <th>Statut</th><th>Score</th><th>Source</th><th>Date</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {adminSubs.map((s: any) => (
                      <tr key={s.id}>
                        <td><div className="font-bold text-sm">{s.plugin_name}</div></td>
                        <td><span className="font-mono text-sm">v{s.plugin_version}</span></td>
                        <td><span className="text-xs text-muted">{s.developer_email ?? s.developer_id?.slice(0, 8)}</span></td>
                        <td>
                          <span className="badge" style={{
                            background: `${STATUS_COLOR[s.status] ?? 'var(--surface2)'}22`,
                            color: STATUS_COLOR[s.status] ?? 'var(--text2)',
                            border: `1px solid ${STATUS_COLOR[s.status] ?? 'var(--border)'}44`,
                          }}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                        </td>
                        <td>
                          {s.anomaly_score != null ? (
                            <span className="font-mono text-sm" style={{
                              color: s.anomaly_score < 20 ? 'var(--success)' : s.anomaly_score < 50 ? 'var(--amber)' : 'var(--danger)'
                            }}>{s.anomaly_score}</span>
                          ) : <span className="text-faint">—</span>}
                        </td>
                        <td>
                          <div className="flex items-center gap-1 text-xs text-faint">
                            {s.source === 'github' ? <GitBranch size={10} /> : <FileText size={10} />}
                            {s.source}
                          </div>
                        </td>
                        <td>
                          <span className="text-xs text-muted">
                            {new Date(s.created_at).toLocaleDateString('fr', { day: 'numeric', month: 'short' })}
                          </span>
                        </td>
                        <td>
                          {/* Affiche les actions pertinentes selon le statut */}
                          {(s.status === 'manual_review' || s.status === 'pending' || s.status === 'rejected') && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--success)', fontSize: 11, padding: '3px 8px' }}
                              disabled={updateSubStatusMutation.isPending}
                              title="Approuver manuellement"
                              onClick={() => updateSubStatusMutation.mutate({ id: s.id, status: 'approved' })}
                            >
                              <CheckCircle size={12} /> Approuver
                            </button>
                          )}
                          {(s.status === 'manual_review' || s.status === 'approved') && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)', fontSize: 11, padding: '3px 8px', marginTop: 2 }}
                              disabled={updateSubStatusMutation.isPending}
                              title="Rejeter"
                              onClick={() => {
                                if (confirm(`Rejeter la soumission "${s.plugin_name} v${s.plugin_version}" ?`))
                                  updateSubStatusMutation.mutate({ id: s.id, status: 'rejected' })
                              }}
                            >
                              <XCircle size={12} /> Rejeter
                            </button>
                          )}
                          {(s.status === 'approved' || s.status === 'rejected' || s.status === 'pending') && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--amber)', fontSize: 11, padding: '3px 8px', marginTop: 2 }}
                              disabled={updateSubStatusMutation.isPending}
                              title="Mettre en révision manuelle"
                              onClick={() => updateSubStatusMutation.mutate({ id: s.id, status: 'manual_review' })}
                            >
                              <Clock size={12} /> Révision
                            </button>
                          )}
                          {s.status === 'processing' && (
                            <span className="text-xs text-faint">En cours…</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Categories ── */}
        {tab === 'categories' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="card mb-8">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Plus size={16} style={{ color: 'var(--acc)' }} /> Nouvelle catégorie
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                <div className="input-wrap" style={{ marginBottom: 0 }}>
                  <label className="input-label">Nom *</label>
                  <input className="input" placeholder="Ex: Authentification" value={catName}
                    onChange={e => setCatName(e.target.value)} />
                  {catName && (
                    <div className="text-xs text-faint mt-1">
                      Slug: <span className="font-mono" style={{ color: 'var(--acc)' }}>{slugify(catName)}</span>
                    </div>
                  )}
                </div>
                <div className="input-wrap" style={{ marginBottom: 0 }}>
                  <label className="input-label">Description (optionnel)</label>
                  <input className="input" placeholder="Description courte…" value={catDesc}
                    onChange={e => setCatDesc(e.target.value)} />
                </div>
                <button className="btn btn-primary" style={{ height: 42 }}
                  disabled={!catName.trim() || createCatMutation.isPending}
                  onClick={() => createCatMutation.mutate()}>
                  {createCatMutation.isPending ? 'Création…' : 'Créer'}
                </button>
              </div>
            </div>

            {catsLoading ? (
              <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
            ) : categories.length === 0 ? (
              <div className="empty">
                <div className="empty__icon"><Tag size={36} strokeWidth={1.5} /></div>
                <div className="empty__title">Aucune catégorie</div>
                <div className="empty__text">Créez la première catégorie ci-dessus.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {categories.map((cat: any) => (
                  <div key={cat.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="flex items-start justify-between gap-2">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-bold" style={{ fontSize: 15 }}>{cat.name}</div>
                        <div className="text-xs font-mono text-faint">{cat.slug}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ color: 'var(--danger)', flexShrink: 0 }}
                        onClick={() => {
                          if (confirm(`Supprimer la catégorie "${cat.name}" ?`))
                            deleteCatMutation.mutate(cat.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {cat.description && (
                      <p className="text-xs text-muted">{cat.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-auto">
                      <Package size={12} style={{ color: 'var(--acc)' }} />
                      <span className="text-xs text-faint">
                        {cat.plugin_count ?? 0} extension{(cat.plugin_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── System / Audit ── */}
        {tab === 'system' && (
          <div style={{ animation: 'fadeUp 0.3s ease', display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* Info système */}
            <div>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Server size={16} style={{ color: 'var(--acc)' }} /> Informations système
              </h3>
              {sysInfoLoading ? (
                <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
              ) : sysInfo ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <InfoCard label="Python" value={sysInfo.python_version ?? '—'} icon={<Info size={14} />} />
                  <InfoCard label="OS" value={sysInfo.os ?? '—'} icon={<Server size={14} />} />
                  <InfoCard label="PID" value={String(sysInfo.pid ?? '—')} icon={<Terminal size={14} />} />
                </div>
              ) : (
                <div className="text-xs text-faint">Informations indisponibles.</div>
              )}
            </div>

            {/* DB stats */}
            <div>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Database size={16} style={{ color: 'var(--acc)' }} /> Base de données
              </h3>
              {sysDbLoading ? (
                <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
              ) : sysDb ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {Object.entries(sysDb).map(([table, count]) => (
                    <InfoCard key={table} label={table} value={String(count)} icon={<Database size={14} />} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-faint">Statistiques indisponibles.</div>
              )}
            </div>

            {/* Audit log */}
            <div>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Terminal size={16} style={{ color: 'var(--acc)' }} /> Journal d'audit (50 dernières entrées)
              </h3>
              {auditLoading ? (
                <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
              ) : auditLogs.length === 0 ? (
                <div className="empty"><div className="empty__title">Aucune entrée d'audit</div></div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr>
                      <th>Acteur</th><th>Action</th><th>Cible</th><th>Détail</th><th>Date</th>
                    </tr></thead>
                    <tbody>
                      {auditLogs.map((log: any) => (
                        <tr key={log.id}>
                          <td><span className="text-xs text-muted">{log.actor_email ?? log.actor_id?.slice(0, 8) ?? '—'}</span></td>
                          <td><span className="font-mono text-xs badge badge-ghost">{log.action}</span></td>
                          <td><span className="text-xs text-faint font-mono">{log.target_id?.slice(0, 8) ?? '—'}</span></td>
                          <td><span className="text-xs text-muted">{log.detail ?? '—'}</span></td>
                          <td>
                            <span className="text-xs text-muted">
                              {new Date(log.created_at).toLocaleString('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, icon, color = 'var(--acc)' }: {
  label: string; value: any; sub?: string; icon: any; color?: string
}) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex justify-between items-start mb-2">
        <div className="text-xs font-bold uppercase text-faint" style={{ letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ color }}>{React.cloneElement(icon, { size: 18 })}</div>
      </div>
      <div className="text-3xl font-display font-bold mb-1">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--acc)' }}>
        {icon}
        <span className="text-xs font-bold uppercase text-faint" style={{ letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div className="font-mono text-sm" style={{ color: 'var(--text1)' }}>{value}</div>
    </div>
  )
}
