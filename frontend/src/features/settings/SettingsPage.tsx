import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useThemeStore } from '../../stores/theme'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import {
  mfa as mfaApi, password as pwdApi, auth as authApi, oauth as oauthApi,
  sessions as sessionsApi, teams as teamsApi,
} from '../../api'
import {
  Settings, Moon, Sun, Shield, User, Key, GitBranch, Mail, Monitor, Link2, LogOut, Building2,
} from 'lucide-react'
import { Panel, Pill, RelativeTime } from '../../components/ui'

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme, toggleTheme } = useThemeStore()
  const { user, setUser } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const refreshUser = async () => {
    try { const u = await authApi.me(); setUser(u) } catch { /* ignore */ }
  }

  useEffect(() => {
    const success = searchParams.get('success')
    const provider = searchParams.get('provider')
    const linkError = searchParams.get('error')
    if (!success && !linkError) return
    if (success) {
      toast(`Compte ${provider ?? ''} lié avec succès !`, 'success')
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] })
    } else if (linkError) {
      toast('Impossible de lier ce compte.', 'error')
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, queryClient, toast])

  const { data: linkedAccounts, isLoading: accountsLoading } = useQuery({ queryKey: ['linked-accounts'], queryFn: oauthApi.listAccounts })

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) => oauthApi.unlink(provider),
    onSuccess: () => { toast('Compte délié.', 'info'); queryClient.invalidateQueries({ queryKey: ['linked-accounts'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const isGithubLinked = (linkedAccounts ?? []).some((a) => a.provider === 'github')

  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const changePwdMutation = useMutation({
    mutationFn: () => pwdApi.change({ current_password: currentPwd, new_password: newPwd }),
    onSuccess: () => { toast('Mot de passe mis à jour !', 'success'); setCurrentPwd(''); setNewPwd('') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const [newEmail, setNewEmail] = useState('')
  const [emailPwd, setEmailPwd] = useState('')
  const changeEmailMutation = useMutation({
    mutationFn: () => authApi.changeEmail(newEmail, emailPwd),
    onSuccess: async () => { toast('Adresse e-mail mise à jour !', 'success'); setNewEmail(''); setEmailPwd(''); await refreshUser() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const { data: activeSessions, isLoading: sessionsLoading } = useQuery({ queryKey: ['sessions'], queryFn: sessionsApi.list })
  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => sessionsApi.revoke(id),
    onSuccess: () => { toast('Session révoquée.', 'info'); queryClient.invalidateQueries({ queryKey: ['sessions'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const revokeAllSessionsMutation = useMutation({
    mutationFn: () => sessionsApi.revokeAll(),
    onSuccess: () => { toast('Toutes les autres sessions ont été révoquées.', 'info'); queryClient.invalidateQueries({ queryKey: ['sessions'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const { data: pendingInvites, isLoading: invitesLoading } = useQuery({ queryKey: ['my-invites'], queryFn: teamsApi.invites.mine })
  const acceptInviteMutation = useMutation({
    mutationFn: (token: string) => teamsApi.invites.accept(token, user!.id),
    onSuccess: async () => { toast('Invitation acceptée !', 'success'); queryClient.invalidateQueries({ queryKey: ['my-invites'] }); await refreshUser() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const [mfaCode, setMfaCode] = useState('')
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const { data: mfaSetup, refetch: setupMfa } = useQuery({ queryKey: ['mfa-setup'], queryFn: mfaApi.setup, enabled: false })
  const enableMfaMutation = useMutation({
    mutationFn: () => mfaApi.enable(mfaCode),
    onSuccess: async () => { toast('MFA activé avec succès !', 'success'); setShowMfaSetup(false); setMfaCode(''); await refreshUser() },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const disableMfaMutation = useMutation({
    mutationFn: mfaApi.disable,
    onSuccess: async () => { toast('MFA désactivé.', 'info'); await refreshUser() },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const handleStartMfa = async () => { await setupMfa(); setShowMfaSetup(true) }

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Paramètres</div>
          <h1 className="dash-header__title">Ma <span className="gradient-text">configuration</span></h1>
          <p className="dash-header__sub">Apparence, profil, sécurité et clés d'accès de votre compte.</p>
        </div>
      </div>

      <div className="section">
        {!invitesLoading && (pendingInvites ?? []).length > 0 && (
          <Panel className="mb-6" title={<span className="flex items-center gap-2"><Building2 size={16} style={{ color: 'var(--acc)' }} /> Invitations en attente</span>}>
            <div className="list" style={{ border: 'none' }}>
              {(pendingInvites ?? []).map((inv) => (
                <div key={inv.id} className="list-row" style={{ cursor: 'default' }}>
                  <div className="list-row__main">
                    <div className="list-row__title" style={{ color: 'var(--text)' }}>{inv.tenant_name ?? inv.tenant_id}</div>
                    <div className="list-row__meta"><span>vous invite à rejoindre l'équipe</span></div>
                  </div>
                  <div className="list-row__side">
                    <button className="btn btn-primary btn-sm" disabled={acceptInviteMutation.isPending} onClick={() => acceptInviteMutation.mutate(inv.token)}>Accepter</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, alignItems: 'start' }}>
          {/* Apparence & Profil */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title={<span className="flex items-center gap-2"><Settings size={15} /> Apparence</span>}>
              <div className="list-row" style={{ border: 'none', padding: 0, cursor: 'default' }}>
                <div className="list-row__main"><span className="text-sm">Mode {theme === 'dark' ? 'sombre' : 'clair'}</span></div>
                <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} Basculer</button>
              </div>
            </Panel>

            <Panel title={<span className="flex items-center gap-2"><User size={15} /> Profil</span>}>
              <div className="panel panel--muted" style={{ padding: 12 }}>
                <div className="text-xs text-faint mb-1">E-mail de connexion</div>
                <div className="text-sm font-bold">{user?.email}</div>
              </div>
            </Panel>

            <Panel title={<span className="flex items-center gap-2"><Mail size={15} /> Changer d'e-mail</span>}>
              <div className="input-wrap mb-3">
                <label className="input-label">Nouvelle adresse e-mail</label>
                <input className="input" type="email" placeholder="nouvelle@adresse.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="input-wrap mb-4">
                <label className="input-label">Mot de passe actuel (confirmation)</label>
                <input className="input" type="password" value={emailPwd} onChange={e => setEmailPwd(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm w-full" style={{ justifyContent: 'center' }} disabled={!newEmail || !emailPwd || changeEmailMutation.isPending} onClick={() => changeEmailMutation.mutate()}>
                {changeEmailMutation.isPending ? 'Mise à jour…' : "Changer l'adresse e-mail"}
              </button>
            </Panel>
          </div>

          {/* Sécurité */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title={<span className="flex items-center gap-2"><Key size={15} /> Authentification</span>}>
              <div className="input-wrap mb-3">
                <label className="input-label">Mot de passe actuel</label>
                <input className="input" type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
              </div>
              <div className="input-wrap mb-4">
                <label className="input-label">Nouveau mot de passe</label>
                <input className="input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm w-full" style={{ justifyContent: 'center' }} disabled={!currentPwd || !newPwd || changePwdMutation.isPending} onClick={() => changePwdMutation.mutate()}>
                {changePwdMutation.isPending ? 'Mise à jour…' : 'Changer le mot de passe'}
              </button>
            </Panel>

            <Panel
              title={<span className="flex items-center gap-2"><Shield size={15} /> Double authentification (MFA)</span>}
              action={user?.mfa_enabled ? <Pill variant="success">Activé</Pill> : undefined}
            >
              {!showMfaSetup ? (
                <>
                  <p className="text-xs text-muted mb-4">Sécurisez votre compte en exigeant un code TOTP (Google Authenticator) lors de la connexion.</p>
                  {user?.mfa_enabled ? (
                    <button className="btn btn-secondary btn-sm w-full" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => disableMfaMutation.mutate()}>
                      Désactiver la double authentification
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm w-full" onClick={handleStartMfa}>Activer la double authentification</button>
                  )}
                </>
              ) : (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ background: '#ffffff', padding: 16, borderRadius: 'var(--r-md)', display: 'inline-block', border: '2px solid #00C896', boxShadow: '0 0 0 3px rgba(0,200,150,0.15)' }}>
                      {/* Modules du QR volontairement noirs, pas teal : un lecteur de QR
                          binarise l'image sur la luminance, et le teal mascotte (#00C896)
                          n'a qu'un contraste d'environ 2.2:1 sur fond blanc (repère WCAG :
                          il en faudrait ~4.5:1) — assez faible pour rendre le scan
                          peu fiable selon l'éclairage/l'appareil (bug vécu en prod : "le
                          qrcode ne fonctionne pas"). La couleur mascotte reste visible via
                          le cadre/halo autour de la carte plutôt que sur les modules eux-mêmes. */}
                      {mfaSetup?.otpauth_url && <QRCodeSVG value={mfaSetup.otpauth_url} size={160} level="M" includeMargin={false} fgColor="#0a1410" bgColor="#ffffff" />}
                    </div>
                    <div className="text-xs font-mono mt-2" style={{ color: 'var(--acc)', letterSpacing: '0.1em' }}>{mfaSetup?.secret}</div>
                    <div className="text-xs text-faint mt-1">Scannez avec Google Authenticator, Authy ou 1Password</div>
                  </div>
                  <div className="input-wrap mb-4">
                    <label className="input-label">Code de vérification</label>
                    <input className="input" placeholder="000000" value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm flex-1" onClick={() => enableMfaMutation.mutate()}>Confirmer</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowMfaSetup(false)}>Annuler</button>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title={<span className="flex items-center gap-2"><Monitor size={15} /> Sessions actives</span>}
              action={(activeSessions ?? []).length > 1 ? (
                <button className="text-xs font-medium" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  disabled={revokeAllSessionsMutation.isPending}
                  onClick={() => { if (confirm('Déconnecter toutes les autres sessions ?')) revokeAllSessionsMutation.mutate() }}>
                  Tout révoquer
                </button>
              ) : undefined}
            >
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
              ) : (activeSessions ?? []).length === 0 ? (
                <div className="text-xs text-faint">Aucune session active.</div>
              ) : (
                <div className="list" style={{ border: 'none' }}>
                  {(activeSessions ?? []).map((s) => (
                    <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
                      <div className="list-row__main">
                        <div className="list-row__title" style={{ color: 'var(--text)' }}>
                          {s.ip_address ?? 'IP inconnue'}
                          {s.is_current && <Pill variant="success">Cette session</Pill>}
                        </div>
                        <div className="list-row__meta"><span>Dernière activité <RelativeTime date={s.last_seen} /></span></div>
                      </div>
                      {!s.is_current && (
                        <div className="list-row__side">
                          <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Révoquer cette session" disabled={revokeSessionMutation.isPending} onClick={() => revokeSessionMutation.mutate(s.id)}>
                            <LogOut size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={<span className="flex items-center gap-2"><Link2 size={15} /> Comptes liés</span>}>
              {accountsLoading ? (
                <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
              ) : (
                <div className="list" style={{ border: 'none' }}>
                  {(linkedAccounts ?? []).map((a) => (
                    <div key={a.provider} className="list-row" style={{ cursor: 'default' }}>
                      <GitBranch size={14} style={{ color: 'var(--text3)' }} />
                      <div className="list-row__main">
                        <div className="list-row__title" style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{a.provider}</div>
                        {a.provider_email && <div className="list-row__meta"><span>{a.provider_email}</span></div>}
                      </div>
                      <div className="list-row__side">
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={unlinkMutation.isPending} onClick={() => unlinkMutation.mutate(a.provider)}>Délier</button>
                      </div>
                    </div>
                  ))}
                  {!isGithubLinked && (
                    <button className="btn btn-secondary btn-sm w-full mt-3" style={{ justifyContent: 'center' }} onClick={() => oauthApi.startLink('github')}>
                      <GitBranch size={14} /> Lier un compte GitHub
                    </button>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}
