import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Terminal, CheckCircle2, ArrowLeft } from 'lucide-react'
import { devkeys as devkeysApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'

const REDIRECT_KEY = 'xc_post_login_redirect'

/** Page ouverte par `xcli login` (flux device-code, RFC 8628) — jamais liée
 * depuis la Nav, atteinte uniquement via l'URL que le CLI ouvre lui-même
 * (`/cli/confirm?code=123456`). Le device_code (le vrai secret porteur)
 * n'est JAMAIS vu ici — seul le user_code à 6 chiffres transite, et la
 * confirmation ne renvoie aucun secret au navigateur : la clé personnelle
 * et le signing key ne rejoignent le CLI que via son propre polling. */
export default function CliConfirmPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { toast } = useToast()

  const [code, setCode] = useState((searchParams.get('code') ?? '').slice(0, 6))
  const [authorized, setAuthorized] = useState(false)

  const confirmMutation = useMutation({
    mutationFn: () => devkeysApi.device.confirm({ user_code: code }),
    onSuccess: () => {
      toast('CLI autorisé', 'success')
      setAuthorized(true)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const goAuth = () => {
    sessionStorage.setItem(REDIRECT_KEY, `/cli/confirm?code=${code}`)
    navigate('/auth')
  }

  const codeValid = /^\d{6}$/.test(code)

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

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="auth-icon-circle">
            <Terminal size={24} />
          </div>
          <div className="auth-card__title" style={{ marginBottom: 6 }}>
            Autoriser xcli
          </div>
          <div className="auth-card__sub" style={{ marginBottom: 0 }}>
            Une instance de <strong style={{ color: 'var(--text)' }}>xcli</strong> sur un de vos
            appareils demande à s'authentifier.
          </div>
        </div>

        {authorized ? (
          <div className="alert alert-success" style={{ justifyContent: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            CLI autorisé — retournez à votre terminal.
          </div>
        ) : !user ? (
          <div className="flex flex-col gap-2">
            <div className="input-wrap mb-2">
              <label className="input-label">Code à 6 chiffres</label>
              <input
                className="input font-mono"
                style={{ fontSize: 20, letterSpacing: '0.3em', textAlign: 'center' }}
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
            </div>
            <button
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', padding: 12 }}
              disabled={!codeValid}
              onClick={goAuth}
            >
              Se connecter pour autoriser
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="input-wrap mb-2">
              <label className="input-label">Code à 6 chiffres</label>
              <input
                className="input font-mono"
                style={{ fontSize: 20, letterSpacing: '0.3em', textAlign: 'center' }}
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
            </div>
            <p className="text-xs text-muted mb-2">
              Connecté(e) en tant que <strong style={{ color: 'var(--text)' }}>{user.email}</strong>.
              Cette clé permettra à xcli d'installer n'importe quel plugin ou service public en votre nom.
            </p>
            <button
              className="btn btn-primary w-full"
              style={{ justifyContent: 'center', padding: 12 }}
              disabled={!codeValid || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? 'Autorisation…' : 'Autoriser xcli'}
            </button>
            <button className="btn btn-ghost w-full" style={{ justifyContent: 'center' }} onClick={() => navigate('/')}>
              <ArrowLeft size={16} /> Retour à l'accueil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
