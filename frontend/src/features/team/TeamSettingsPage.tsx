import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X, Mail, Users, Save, Settings as SettingsIcon } from 'lucide-react'
import { teams as teamsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { Tabs, Panel, Pill, RelativeTime } from '../../components/ui'
import type { TabItem } from '../../components/ui'
import type { Invite, Permission, Role, Tenant, TenantMemberWithRoles } from '../../types'

// ── Général ──────────────────────────────────────────────────────────────────

function GeneralSection({ tenant }: { tenant: Tenant }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { initialize } = useAuthStore()

  const [name, setName] = useState(tenant.name)
  const [settingsText, setSettingsText] = useState('')

  const { data: tenantSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['team-settings', tenant.id],
    queryFn: () => teamsApi.settings.get(tenant.id),
  })

  useEffect(() => {
    if (tenantSettings) setSettingsText(JSON.stringify(tenantSettings.settings, null, 2))
  }, [tenantSettings])

  const renameMutation = useMutation({
    mutationFn: () => teamsApi.update(tenant.id, { name }),
    onSuccess: () => { toast('Équipe renommée.', 'success'); queryClient.invalidateQueries({ queryKey: ['my-teams'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const saveSettingsMutation = useMutation({
    mutationFn: () => teamsApi.settings.update(tenant.id, JSON.parse(settingsText || '{}')),
    onSuccess: () => { toast('Paramètres enregistrés.', 'success'); queryClient.invalidateQueries({ queryKey: ['team-settings', tenant.id] }) },
    onError: (e: Error) => toast(e instanceof SyntaxError ? 'JSON invalide.' : e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => teamsApi.delete(tenant.id),
    onSuccess: async () => { toast('Équipe supprimée.', 'info'); await initialize() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <Panel title="Nom de l'équipe">
        <p className="text-xs text-muted mb-3">Visible par tous les membres et sur les invitations.</p>
        <div className="flex gap-2">
          <input className="input" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!name.trim() || name === tenant.name || renameMutation.isPending} onClick={() => renameMutation.mutate()}>
            <Save size={14} /> Enregistrer
          </button>
        </div>
      </Panel>

      <Panel title="Paramètres avancés">
        <p className="text-xs text-muted mb-3">Configuration libre (JSON) propre à cette équipe.</p>
        {settingsLoading ? (
          <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
        ) : (
          <>
            <textarea className="input font-mono" style={{ minHeight: 160, resize: 'vertical', fontSize: 12 }} value={settingsText} onChange={(e) => setSettingsText(e.target.value)} spellCheck={false} />
            <button className="btn btn-secondary btn-sm mt-3" disabled={saveSettingsMutation.isPending} onClick={() => saveSettingsMutation.mutate()}>
              {saveSettingsMutation.isPending ? 'Enregistrement…' : 'Enregistrer les paramètres'}
            </button>
          </>
        )}
      </Panel>

      <Panel title="Zone de danger">
        <p className="text-xs text-muted mb-3">Supprime définitivement l'équipe, ses membres, invitations et rôles. Cette action est irréversible.</p>
        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={deleteMutation.isPending}
          onClick={() => { if (confirm(`Supprimer définitivement l'équipe "${tenant.name}" ?`)) deleteMutation.mutate() }}>
          <Trash2 size={14} /> Supprimer l'équipe
        </button>
      </Panel>
    </div>
  )
}

// ── Membres ──────────────────────────────────────────────────────────────────

function MemberRow({ member, roles, roleName, onAddRole, onRemoveRole, onRemoveMember }: {
  member: TenantMemberWithRoles; roles: Role[]; roleName: (id: string) => string
  onAddRole: (roleId: string) => void; onRemoveRole: (roleId: string) => void; onRemoveMember: () => void
}) {
  const [picking, setPicking] = useState('')
  const availableRoles = roles.filter((r) => !member.role_ids.includes(r.id))

  return (
    <div className="list-row" style={{ cursor: 'default' }}>
      <div className="list-row__main">
        <div className="list-row__title" style={{ color: 'var(--text)' }}>
          {member.email ?? member.user_id}
          {member.is_owner && <Pill variant="success">Propriétaire</Pill>}
        </div>
        <div className="list-row__meta">
          {member.role_ids.length === 0 && <span className="text-faint">Aucun rôle</span>}
          {member.role_ids.map((rid) => (
            <span key={rid} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Pill>{roleName(rid)}</Pill>
              <button onClick={() => onRemoveRole(rid)} title="Retirer ce rôle" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, display: 'flex' }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="list-row__side">
        {availableRoles.length > 0 && (
          <>
            <select className="input" style={{ fontSize: 12, padding: '4px 8px' }} value={picking} onChange={(e) => setPicking(e.target.value)}>
              <option value="">Ajouter un rôle…</option>
              {availableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm btn-icon" disabled={!picking} onClick={() => { onAddRole(picking); setPicking('') }}><Plus size={14} /></button>
          </>
        )}
        {!member.is_owner && (
          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Retirer de l'équipe" onClick={onRemoveMember}><Trash2 size={14} /></button>
        )}
      </div>
    </div>
  )
}

function MembersSection({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: members, isLoading } = useQuery({ queryKey: ['team-members', tenantId], queryFn: () => teamsApi.membersWithRoles(tenantId) })
  const { data: roles } = useQuery({ queryKey: ['team-roles', tenantId], queryFn: () => teamsApi.roles.list(tenantId) })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team-members', tenantId] })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => teamsApi.removeMember(tenantId, userId),
    onSuccess: () => { toast('Membre retiré.', 'info'); invalidate() },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const addRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => teamsApi.memberRoles.add(tenantId, userId, roleId),
    onSuccess: () => { toast('Rôle attribué.', 'success'); invalidate() },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => teamsApi.memberRoles.remove(tenantId, userId, roleId),
    onSuccess: () => { toast('Rôle retiré.', 'info'); invalidate() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const roleList: Role[] = roles ?? []
  const roleName = (id: string) => roleList.find((r) => r.id === id)?.name ?? id

  if (isLoading) return <PageLoading text="Chargement des membres…" />
  const memberList: TenantMemberWithRoles[] = members ?? []

  if (memberList.length === 0) {
    return <div className="empty"><div className="empty__icon"><Users size={40} strokeWidth={1.5} /></div><div className="empty__title">Aucun membre</div></div>
  }

  return (
    <div className="list">
      {memberList.map((m) => (
        <MemberRow key={m.user_id} member={m} roles={roleList} roleName={roleName}
          onAddRole={(roleId) => addRoleMutation.mutate({ userId: m.user_id, roleId })}
          onRemoveRole={(roleId) => removeRoleMutation.mutate({ userId: m.user_id, roleId })}
          onRemoveMember={() => { if (confirm(`Retirer ${m.email ?? m.user_id} de l'équipe ?`)) removeMutation.mutate(m.user_id) }} />
      ))}
    </div>
  )
}

// ── Invitations ──────────────────────────────────────────────────────────────

function InvitesSection({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')

  const { data: invites, isLoading } = useQuery({ queryKey: ['team-invites', tenantId], queryFn: () => teamsApi.invites.list(tenantId) })
  const { data: roles } = useQuery({ queryKey: ['team-roles', tenantId], queryFn: () => teamsApi.roles.list(tenantId) })

  const createMutation = useMutation({
    mutationFn: () => teamsApi.invites.create({ tenant_id: tenantId, email, role_id: roleId || undefined }),
    onSuccess: () => {
      toast(`Invitation envoyée à ${email}`, 'success')
      setShowAdd(false); setEmail(''); setRoleId('')
      queryClient.invalidateQueries({ queryKey: ['team-invites', tenantId] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => teamsApi.invites.revoke(inviteId),
    onSuccess: () => { toast('Invitation révoquée.', 'info'); queryClient.invalidateQueries({ queryKey: ['team-invites', tenantId] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const roleList: Role[] = roles ?? []
  const roleName = (id?: string) => (id ? roleList.find((r) => r.id === id)?.name ?? id : null)

  if (isLoading) return <PageLoading text="Chargement des invitations…" />
  const inviteList: Invite[] = invites ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold" style={{ fontSize: 16 }}>Invitations</h3>
          <p className="text-xs text-muted">Invitez de nouveaux membres à rejoindre l'équipe.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Inviter</button>
      </div>

      {showAdd && (
        <Panel title="Nouvelle invitation" className="mb-4">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="input-wrap">
              <label className="input-label">Email</label>
              <input className="input" type="email" placeholder="membre@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="input-wrap">
              <label className="input-label">Rôle (optionnel)</label>
              <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">Aucun</option>
                {roleList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={!email || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Envoi…' : 'Envoyer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Annuler</button>
          </div>
        </Panel>
      )}

      {inviteList.length === 0 ? (
        <div className="empty"><div className="empty__icon"><Mail size={40} strokeWidth={1.5} /></div><div className="empty__text">Aucune invitation envoyée.</div></div>
      ) : (
        <div className="list">
          {inviteList.map((inv) => {
            const expired = new Date(inv.expires_at) < new Date()
            const status = inv.used_at ? 'used' : !inv.is_active ? 'revoked' : expired ? 'expired' : 'pending'
            return (
              <div className="list-row" style={{ cursor: 'default' }} key={inv.id}>
                <div className="list-row__main">
                  <div className="list-row__title" style={{ color: 'var(--text)' }}>
                    {inv.email}
                    {status === 'pending' && <Pill variant="warning">En attente</Pill>}
                    {status === 'used' && <Pill variant="success">Acceptée</Pill>}
                    {status === 'revoked' && <Pill variant="danger">Révoquée</Pill>}
                    {status === 'expired' && <Pill>Expirée</Pill>}
                  </div>
                  <div className="list-row__meta">
                    {roleName(inv.role_id) && <span>{roleName(inv.role_id)}</span>}
                    <span>Expire <RelativeTime date={inv.expires_at} /></span>
                  </div>
                </div>
                <div className="list-row__side">
                  {status === 'pending' && (
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Révoquer"
                      onClick={() => { if (confirm(`Révoquer l'invitation de ${inv.email} ?`)) revokeMutation.mutate(inv.id) }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Rôles ────────────────────────────────────────────────────────────────────

function RolesSection({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])

  const { data: roles, isLoading } = useQuery({ queryKey: ['team-roles', tenantId], queryFn: () => teamsApi.roles.list(tenantId) })
  const { data: grantable } = useQuery({ queryKey: ['team-grantable', tenantId], queryFn: () => teamsApi.grantablePermissions(tenantId) })

  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: ['team-roles', tenantId] })

  const createMutation = useMutation({
    mutationFn: () => teamsApi.roles.create(tenantId, { name, description: description || undefined, permissions: selectedPerms }),
    onSuccess: () => { toast(`Rôle "${name}" créé.`, 'success'); setShowAdd(false); setName(''); setDescription(''); setSelectedPerms([]); invalidateRoles() },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => teamsApi.roles.delete(tenantId, roleId),
    onSuccess: () => { toast('Rôle supprimé.', 'info'); invalidateRoles() },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const removePermMutation = useMutation({
    mutationFn: ({ roleId, permName }: { roleId: string; permName: string }) => teamsApi.roles.removePermission(tenantId, roleId, permName),
    onSuccess: invalidateRoles,
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const addPermMutation = useMutation({
    mutationFn: ({ roleId, permName }: { roleId: string; permName: string }) => teamsApi.roles.addPermission(tenantId, roleId, permName),
    onSuccess: invalidateRoles,
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const togglePerm = (permName: string) => setSelectedPerms((cur) => (cur.includes(permName) ? cur.filter((p) => p !== permName) : [...cur, permName]))

  if (isLoading) return <PageLoading text="Chargement des rôles…" />
  const roleList: Role[] = roles ?? []
  const grantableList: Permission[] = grantable ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold" style={{ fontSize: 16 }}>Rôles</h3>
          <p className="text-xs text-muted">Créez des rôles pour déléguer des permissions à vos membres.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Nouveau rôle</button>
      </div>

      {showAdd && (
        <Panel title="Nouveau rôle" className="mb-4">
          <div className="input-wrap" style={{ marginBottom: 12 }}>
            <label className="input-label">Nom</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Support" />
          </div>
          <div className="input-wrap mb-4">
            <label className="input-label">Description (optionnel)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="input-wrap mb-4">
            <label className="input-label">Permissions</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
              {grantableList.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedPerms.includes(p.name)} onChange={() => togglePerm(p.name)} />
                  <span className="font-mono">{p.name}</span>
                </label>
              ))}
              {grantableList.length === 0 && <span className="text-xs text-faint">Aucune permission délégable.</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={!name || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Création…' : 'Créer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Annuler</button>
          </div>
        </Panel>
      )}

      {roleList.length === 0 ? (
        <div className="empty"><div className="empty__title">Aucun rôle personnalisé</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roleList.map((r) => (
            <Panel key={r.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold">{r.name}</div>
                  {r.description && <div className="text-xs text-muted">{r.description}</div>}
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Supprimer le rôle"
                  onClick={() => { if (confirm(`Supprimer le rôle "${r.name}" ?`)) deleteMutation.mutate(r.id) }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                {r.permissions.length === 0 && <span className="text-xs text-faint">Aucune permission</span>}
                {r.permissions.map((p) => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Pill>{p.name}</Pill>
                    <button onClick={() => removePermMutation.mutate({ roleId: r.id, permName: p.name })} title="Retirer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, display: 'flex' }}>
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
              {(() => {
                const already = new Set(r.permissions.map((p) => p.name))
                const addable = grantableList.filter((p) => !already.has(p.name))
                if (addable.length === 0) return null
                return (
                  <select className="input" style={{ marginTop: 10, fontSize: 12, padding: '4px 8px', width: 'auto' }}
                    disabled={addPermMutation.isPending} value=""
                    onChange={(e) => { if (e.target.value) addPermMutation.mutate({ roleId: r.id, permName: e.target.value }) }}>
                    <option value="">+ Ajouter une permission…</option>
                    {addable.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                )
              })()}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function CreateTeamCard() {
  const { toast } = useToast()
  const { switchTeam } = useAuthStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const createMutation = useMutation({
    mutationFn: () => teamsApi.create({ name, slug }),
    onSuccess: async (tenant) => {
      toast(`Équipe "${tenant.name}" créée !`, 'success')
      await switchTeam(tenant.id)
      queryClient.invalidateQueries({ queryKey: ['my-teams'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div className="empty" style={{ paddingTop: 80 }}>
      <div className="empty__icon"><Users size={40} strokeWidth={1.5} /></div>
      <div className="empty__title">Vous n'appartenez à aucune équipe</div>
      <div className="empty__text mb-6">Créez une équipe pour partager vos plugins et inviter des collaborateurs.</div>
      <div className="panel" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'left', padding: 20 }}>
        <div className="input-wrap" style={{ marginBottom: 12 }}>
          <label className="input-label">Nom de l'équipe</label>
          <input className="input" value={name} onChange={(e) => {
            setName(e.target.value)
            setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
          }} placeholder="Mon Équipe" />
        </div>
        <div className="input-wrap mb-4">
          <label className="input-label">Slug</label>
          <input className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mon-equipe" />
        </div>
        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} disabled={!name || !slug || createMutation.isPending} onClick={() => createMutation.mutate()}>
          {createMutation.isPending ? 'Création…' : "Créer l'équipe"}
        </button>
      </div>
    </div>
  )
}

type Tab = 'members' | 'invites' | 'roles' | 'general'

export default function TeamSettingsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<Tab>('members')

  const { data: myTeams, isLoading: teamsLoading } = useQuery({ queryKey: ['my-teams'], queryFn: teamsApi.list, enabled: !!user })

  if (!user) return null
  if (teamsLoading) return <PageLoading text="Chargement de l'équipe…" />
  if (!user.tenant_id) return <div className="page"><CreateTeamCard /></div>

  const tenantId = user.tenant_id
  const currentTenant: Tenant | undefined = myTeams?.find((t) => t.id === tenantId)
  const isOwner = currentTenant?.is_owner ?? false

  const tabs: TabItem<Tab>[] = [
    { id: 'members', label: 'Membres' },
    { id: 'invites', label: 'Invitations' },
    { id: 'roles', label: 'Rôles' },
    { id: 'general', label: 'Général', icon: <SettingsIcon size={13} /> },
  ]

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Équipe</div>
          <h1 className="dash-header__title">{currentTenant?.name ?? 'Mon'} <span className="gradient-text">équipe</span></h1>
          <p className="dash-header__sub">Gérez les membres, invitations et rôles de votre équipe.</p>
        </div>
      </div>

      <div className="detail-tabs-bar">
        <Tabs items={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="section">
        {!isOwner ? (
          <div className="empty">
            <div className="empty__title">Accès réservé au propriétaire</div>
            <div className="empty__text">Seul le propriétaire de l'équipe peut gérer les membres, invitations et rôles.</div>
          </div>
        ) : (
          <>
            {tab === 'members' && <MembersSection tenantId={tenantId} />}
            {tab === 'invites' && <InvitesSection tenantId={tenantId} />}
            {tab === 'roles' && <RolesSection tenantId={tenantId} />}
            {tab === 'general' && currentTenant && <GeneralSection tenant={currentTenant} />}
          </>
        )}
      </div>
    </div>
  )
}
