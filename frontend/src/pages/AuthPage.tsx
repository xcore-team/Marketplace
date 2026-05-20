import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { GitBranch, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react'
import { auth as authApi, setToken, setRefreshToken, password as pwdApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'

type Mode = 'login' | 'register' | 'forgot' | 'mfa' | 'reset'

export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const { toast } = useToast()

  const resetToken = searchParams.get('token')
  const [mode, setMode] = useState<Mode>(
    resetToken ? 'reset'
    : searchParams.get('mode') === 'register' ? 'register'
    : 'login',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')

  // Handle OAuth callback
  useEffect(() => {
    const at = searchParams.get('access_token')
    const rt = searchParams.get('refresh_token')
    if (at) {
      setToken(at)
      if (rt) setRefreshToken(rt)
      authApi.me().then((u) => {
        setUser(u)
        toast('Connexion réussie !', 'success')
        navigate('/', { replace: true })
      }).catch(() => toast('Erreur lors de la connexion OAuth', 'error'))
    }
  }, [searchParams, navigate, setUser, toast])

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const forgotMutation = useMutation({
    mutationFn: () => pwdApi.forgot(email),
    onSuccess: () => {
      toast('Si cet email existe, un lien a été envoyé.', 'info')
      setMode('login')
    },
    onError: (e: Error) => setError(e.message),
  })

  const resetMutation = useMutation({
    mutationFn: () => pwdApi.reset({ token: resetToken ?? '', new_password: newPassword }),
    onSuccess: () => {
      toast('Mot de passe réinitialisé ! Vous pouvez vous connecter.', 'success')
      navigate('/auth', { replace: true })
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'forgot') {
      forgotMutation.mutate()
      return
    }

    setLoading(true)
    try {
      const u = await authApi.login(email, password)
      setUser(u)
      toast('Connexion réussie !', 'success')
      navigate('/', { replace: true })
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'MFA_REQUIRED') {
        const token = (e as Error & { mfa_token?: string }).mfa_token ?? ''
        setMfaToken(token)
        setMfaCode('')
        setMode('mfa')
        setError('')
      } else {
        setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
      }
    } finally {
      setLoading(false)
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
      navigate('/', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Code invalide.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m); setError(''); setPassword('')
  }

  return (
    <div className="auth-page">
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,90,252,0.12) 0%, transparent 70%)',
        top: '20%', right: '15%', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%)',
        bottom: '20%', left: '10%', pointerEvents: 'none',
      }} />

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
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--acc-subtle)', border: '2px solid var(--border-acc)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', color: 'var(--acc)',
              }}>
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

        ) : mode === 'forgot' ? (
          <>
            <div className="auth-card__title">Mot de passe oublié</div>
            <div className="auth-card__sub">
              Entrez votre email pour recevoir un lien de réinitialisation.
            </div>

            {error && (
              <div className="alert alert-danger mb-4">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="input-wrap">
                <label className="input-label">Adresse e-mail</label>
                <input type="email" className="input" placeholder="vous@exemple.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ padding: '12px', marginTop: 4, justifyContent: 'center' }}
                disabled={forgotMutation.isPending}>
                {forgotMutation.isPending
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Envoi…</>
                  : 'Envoyer le lien'}
              </button>
            </form>
            <button className="btn btn-ghost w-full mt-4" style={{ justifyContent: 'center' }}
              onClick={() => switchMode('login')}>
              <ArrowLeft size={16} /> Retour à la connexion
            </button>
          </>

        ) : (
          <>
            {/* Tabs connexion / inscription */}
            <div className="auth-tabs">
              <div className={`auth-tab${mode === 'login' ? ' active' : ''}`} onClick={() => switchMode('login')}>
                Connexion
              </div>
              <div className={`auth-tab${mode === 'register' ? ' active' : ''}`} onClick={() => switchMode('register')}>
                Créer un compte
              </div>
            </div>

            {mode === 'login' ? (
              <>
                <div className="auth-card__title">Content de vous revoir</div>
                <div className="auth-card__sub">Connectez-vous pour accéder à votre espace.</div>

                {error && (
                  <div className="alert alert-danger mb-4">
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                <form className="auth-form" onSubmit={handleSubmit}>
                  <div className="input-wrap">
                    <label className="input-label">Adresse e-mail</label>
                    <input type="email" className="input" placeholder="vous@exemple.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                  </div>
                  <div className="input-wrap">
                    <div className="flex justify-between items-center mb-1">
                      <label className="input-label" style={{ marginBottom: 0 }}>Mot de passe</label>
                      <span className="text-xs text-acc" style={{ cursor: 'pointer' }}
                        onClick={() => { setMode('forgot'); setError('') }}>
                        Oublié ?
                      </span>
                    </div>
                    <input type="password" className="input" placeholder="••••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-primary w-full"
                    style={{ padding: '12px', marginTop: 4, justifyContent: 'center' }}
                    disabled={loading}>
                    {loading
                      ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Chargement…</>
                      : 'Se connecter →'}
                  </button>
                </form>

                <div className="divider mt-6">ou</div>
                <button className="btn btn-secondary w-full mt-4"
                  style={{ justifyContent: 'center', padding: '12px' }}
                  onClick={() => window.location.href = authApi.oauthUrl('github')}>
                  <GitBranch size={18} /> Continuer avec GitHub
                </button>
              </>
            ) : (
              <>
                <div className="auth-card__title">Rejoindre XCoreHub</div>
                <div className="auth-card__sub">
                  Créez votre compte pour publier et gérer vos extensions.
                </div>
                <button className="btn btn-primary w-full mt-4"
                  style={{ justifyContent: 'center', padding: '14px', fontSize: 15 }}
                  onClick={() => window.location.href = authApi.oauthUrl('github')}>
                  <GitBranch size={20} /> Continuer avec GitHub
                </button>
                <p className="text-xs text-faint mt-6" style={{ textAlign: 'center', lineHeight: 1.6 }}>
                  En créant un compte, vous acceptez les conditions d'utilisation de XCoreHub.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
