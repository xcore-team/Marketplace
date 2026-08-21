import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { GitBranch, AlertTriangle, Loader2, ArrowLeft, Users } from 'lucide-react'
import { auth as authApi, teams as teamsApi, setToken, setRefreshToken, password as pwdApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'

// Connexion GitHub uniquement — pas de formulaire email/mot de passe. `reset`
// reste joignable via un vieux lien de réinitialisation (?token=…) pour les
// comptes existants qui ont encore un mot de passe ; `mfa`/`onboard-*` sont
// des étapes déclenchées par le callback OAuth ci-dessous, pas des points
// d'entrée séparés.
type Mode = 'login' | 'mfa' | 'reset' | 'onboard-create' | 'onboard-select' | 'onboard-join'

interface PendingTenant {
  id: string
  name: string | null
  slug: string | null
}

// Posé par InviteAcceptPage avant de renvoyer un visiteur non connecté ici —
// permet de revenir sur l'invitation une fois la connexion terminée.
const REDIRECT_KEY = 'xc_post_login_redirect'
function postLoginPath(): string {
  const path = sessionStorage.getItem(REDIRECT_KEY)
  if (path) sessionStorage.removeItem(REDIRECT_KEY)
  return path ?? '/'
}

export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const { toast } = useToast()

  const resetToken = searchParams.get('token')
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [pendingTenants, setPendingTenants] = useState<PendingTenant[]>([])
  const [teamName, setTeamName] = useState('')
  const [teamSlug, setTeamSlug] = useState('')
  const [onboardLoading, setOnboardLoading] = useState(false)

  // Handle OAuth callback — covers every shape services/oauth.py::handle_callback
  // can return, not just the single-tenant happy path: MFA challenge, no tenant
  // yet (onboarding), several tenants to pick from, and provider errors.
  useEffect(() => {
    const at = searchParams.get('access_token')
    const rt = searchParams.get('refresh_token')
    const oauthError = searchParams.get('error')
    const mfaRequired = searchParams.get('mfa_required') === 'true'
    const mfaTok = searchParams.get('mfa_token')
    const onboarding = searchParams.get('onboarding') === 'true'
    const tenantsB64 = searchParams.get('tenants')

    if (!at && !rt && !oauthError) return

    if (oauthError) {
      toast('Connexion GitHub annulée ou échouée.', 'error')
      navigate('/auth', { replace: true })
      return
    }

    if (mfaRequired && mfaTok) {
      setMfaToken(mfaTok)
      setMode('mfa')
      navigate('/auth', { replace: true })
      return
    }

    if (at) {
      setToken(at)
      if (rt) setRefreshToken(rt)
      authApi.me().then((u) => {
        setUser(u)
        toast('Connexion réussie !', 'success')
        // La redirection est gérée par l'effet ci-dessous (watch sur `user`).
      }).catch(() => toast('Erreur lors de la connexion OAuth', 'error'))
      return
    }

    // No usable access_token: either several tenants to choose from, or none
    // at all yet — both only need the refresh_token (see OnboardingService).
    if (rt) {
      setRefreshToken(rt)
      if (tenantsB64) {
        try {
          setPendingTenants(JSON.parse(atob(tenantsB64)))
          setMode('onboard-select')
        } catch {
          toast('Erreur lors de la connexion OAuth', 'error')
        }
      } else if (onboarding) {
        // authApi.setupJoin() existait déjà côté API (et /auth/setup/join
        // côté backend, voir OnboardingService.setup_join_tenant) mais
        // n'était appelé nulle part — un nouveau compte qui accepte une
        // invitation par lien atterrissait toujours sur "Créez votre
        // équipe", forcé de créer une équipe non désirée avant de pouvoir
        // rejoindre celle de l'invitation. Si InviteAcceptPage a posé une
        // redirection en attente vers /invite/<token>, on rejoint direct.
        const pending = sessionStorage.getItem(REDIRECT_KEY)
        const inviteMatch = pending?.match(/^\/invite\/([^/?#]+)/)
        if (inviteMatch) {
          // Remplace la redirection en attente : une fois rejoint, on n'a
          // plus besoin de revisiter /invite/<token> (déjà consommée par
          // setupJoin) — direction "Mes équipes", comme InviteAcceptPage
          // le fait déjà pour un utilisateur qui accepte en étant déjà connecté.
          sessionStorage.setItem(REDIRECT_KEY, '/dashboard/team')
          setMode('onboard-join')
          authApi.setupJoin(inviteMatch[1]).then((u) => {
            setUser(u)
            toast('Invitation acceptée — bienvenue dans l\'équipe !', 'success')
          }).catch((e: unknown) => {
            toast(e instanceof Error ? e.message : 'Impossible de rejoindre l\'équipe via cette invitation.', 'error')
            setMode('onboard-create')
          })
        } else {
          setMode('onboard-create')
        }
      }
      navigate('/auth', { replace: true })
    }
  }, [searchParams, navigate, setUser, toast])

  // Seul point de sortie après une connexion réussie (login, MFA, onboarding,
  // OAuth…) — respecte une redirection en attente posée par InviteAcceptPage.
  useEffect(() => {
    if (user) navigate(postLoginPath(), { replace: true })
  }, [user, navigate])

  const resetMutation = useMutation({
    mutationFn: () => pwdApi.reset({ token: resetToken ?? '', new_password: newPassword }),
    onSuccess: () => {
      toast('Mot de passe réinitialisé ! Vous pouvez vous connecter.', 'success')
      navigate('/auth', { replace: true })
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOnboardLoading(true)
    try {
      const u = await authApi.setupCreate(teamName, teamSlug)
      setUser(u)
      toast(`Équipe "${teamName}" créée !`, 'success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setOnboardLoading(false)
    }
  }

  const handleSelectTenant = async (tenantId: string) => {
    setError('')
    setOnboardLoading(true)
    try {
      const u = await teamsApi.select(tenantId)
      setUser(u)
      toast('Connexion réussie !', 'success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setOnboardLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!mfaCode.trim()) return
    setLoading(true)
    try {
      const u = await authApi.verifyMfaLogin(mfaToken, mfaCode.trim())
      setUser(u)
      toast('Connexion réussie !', 'success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Code invalide.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/mascot.svg" alt="XCore" className="auth-card__logo-img" />
          <span>
            <span className="gradient-text">XCore</span>
            <span style={{ color: 'var(--text2)', fontWeight: 400 }}>Hub</span>
          </span>
        </div>

        {/* ── MFA step ── */}
        {mode === 'mfa' ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div className="auth-icon-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="10" rx="2"/>
                  <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                </svg>
              </div>
              <div className="auth-card__title" style={{ marginBottom: 6 }}>Vérification MFA</div>
              <div className="auth-card__sub" style={{ marginBottom: 0 }}>
                Entrez le code à 6 chiffres de votre application d'authentification.
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mb-4">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleMfaSubmit}>
              <div className="input-wrap">
                <label className="input-label">Code TOTP</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  className="input"
                  style={{ textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', fontFamily: 'var(--f-mono)' }}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus required
                />
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ padding: '12px', justifyContent: 'center' }}
                disabled={loading || mfaCode.length !== 6}>
                {loading
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Vérification…</>
                  : 'Vérifier →'}
              </button>
            </form>
            <button className="btn btn-ghost w-full mt-4" style={{ justifyContent: 'center' }}
              onClick={() => { setMode('login'); setError(''); setMfaCode('') }}>
              <ArrowLeft size={16} /> Retour à la connexion
            </button>
          </>

        ) : mode === 'onboard-join' ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div className="auth-icon-circle">
              <Users size={24} />
            </div>
            <div className="auth-card__title" style={{ marginBottom: 6 }}>Rejoindre l'équipe…</div>
            <div className="auth-card__sub" style={{ marginBottom: 16 }}>
              Finalisation de votre invitation, un instant.
            </div>
            <Loader2 size={20} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--acc)' }} />
          </div>

        ) : mode === 'onboard-create' ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div className="auth-icon-circle">
                <Users size={24} />
              </div>
              <div className="auth-card__title" style={{ marginBottom: 6 }}>Créez votre équipe</div>
              <div className="auth-card__sub" style={{ marginBottom: 0 }}>
                Dernière étape : donnez un nom à votre équipe pour commencer.
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mb-4">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleCreateTeam}>
              <div className="input-wrap">
                <label className="input-label">Nom de l'équipe</label>
                <input
                  className="input"
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value)
                    setTeamSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
                  }}
                  placeholder="Mon Équipe"
                  autoFocus required
                />
              </div>
              <div className="input-wrap">
                <label className="input-label">Slug</label>
                <input
                  className="input font-mono"
                  value={teamSlug}
                  onChange={(e) => setTeamSlug(e.target.value)}
                  placeholder="mon-equipe"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ padding: '12px', justifyContent: 'center' }}
                disabled={onboardLoading || !teamName || !teamSlug}>
                {onboardLoading
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Création…</>
                  : "Créer l'équipe →"}
              </button>
            </form>
          </>

        ) : mode === 'onboard-select' ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div className="auth-icon-circle">
                <Users size={24} />
              </div>
              <div className="auth-card__title" style={{ marginBottom: 6 }}>Choisissez une équipe</div>
              <div className="auth-card__sub" style={{ marginBottom: 0 }}>
                Vous appartenez à plusieurs équipes — laquelle voulez-vous rejoindre ?
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mb-4">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {pendingTenants.map((t) => (
                <button
                  key={t.id}
                  className="btn btn-secondary w-full"
                  style={{ justifyContent: 'center', padding: '12px' }}
                  disabled={onboardLoading}
                  onClick={() => handleSelectTenant(t.id)}
                >
                  {t.name ?? t.slug ?? t.id}
                </button>
              ))}
            </div>
          </>

        ) : mode === 'reset' ? (
          <>
            <div className="auth-card__title">Nouveau mot de passe</div>
            <div className="auth-card__sub">
              Choisissez un mot de passe sécurisé pour votre compte.
            </div>

            {error && (
              <div className="alert alert-danger mb-4">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={(e) => {
              e.preventDefault()
              setError('')
              if (newPassword !== newPasswordConfirm) {
                setError('Les mots de passe ne correspondent pas.')
                return
              }
              if (newPassword.length < 8) {
                setError('Le mot de passe doit contenir au moins 8 caractères.')
                return
              }
              resetMutation.mutate()
            }}>
              <div className="input-wrap">
                <label className="input-label">Nouveau mot de passe</label>
                <input type="password" className="input" placeholder="••••••••"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus />
              </div>
              <div className="input-wrap">
                <label className="input-label">Confirmer le mot de passe</label>
                <input type="password" className="input" placeholder="••••••••"
                  value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ padding: '12px', marginTop: 4, justifyContent: 'center' }}
                disabled={resetMutation.isPending}>
                {resetMutation.isPending
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Réinitialisation…</>
                  : 'Réinitialiser le mot de passe'}
              </button>
            </form>
            <button className="btn btn-ghost w-full mt-4" style={{ justifyContent: 'center' }}
              onClick={() => navigate('/auth', { replace: true })}>
              <ArrowLeft size={16} /> Retour à la connexion
            </button>
          </>

        ) : (
          <>
            <div className="auth-card__title">Content de vous revoir</div>
            <div className="auth-card__sub">
              Connectez-vous avec GitHub pour accéder à votre espace.
            </div>

            <button className="btn btn-primary w-full mt-4"
              style={{ justifyContent: 'center', padding: '14px', fontSize: 15 }}
              onClick={() => window.location.href = authApi.oauthUrl('github')}>
              <GitBranch size={20} /> Continuer avec GitHub
            </button>
            <p className="text-xs text-faint mt-6" style={{ textAlign: 'center', lineHeight: 1.6 }}>
              En continuant, vous acceptez les conditions d'utilisation de XCoreHub.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
