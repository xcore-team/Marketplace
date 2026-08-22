import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Users, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react'
import { teams as teamsApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'
import { PageLoading } from '../components/Skeleton'

const REDIRECT_KEY = 'xc_post_login_redirect'

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const [accepted, setAccepted] = useState(false)

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => teamsApi.invites.getByToken(token!),
    enabled: !!token,
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: () => teamsApi.invites.accept(token!, user!.id),
    onSuccess: () => {
      toast('Invitation acceptée !', 'success')
      setAccepted(true)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Si l'utilisateur n'est pas connecté, on le renvoie s'authentifier (GitHub
  // uniquement) puis on revient sur cette page (AuthPage lit REDIRECT_KEY
  // après connexion).
  const goAuth = () => {
    sessionStorage.setItem(REDIRECT_KEY, `/invite/${token}`)
    navigate('/auth')
  }

  useEffect(() => {
    if (accepted) {
      const t = setTimeout(() => navigate('/dashboard/team'), 1800)
      return () => clearTimeout(t)
    }
  }, [accepted, navigate])

  if (isLoading) return <PageLoading text="Chargement de l'invitation…" />

  if (error || !invite) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><AlertTriangle size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Invitation introuvable</div>
          <div className="empty__text">Ce lien d'invitation est invalide ou a expiré.</div>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Retour à l'accueil</button>
        </div>
      </div>
    )
  }

  const expired = new Date(invite.expires_at) < new Date()
  const used = !!invite.used_at || !invite.is_active

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
            <Users size={24} />
          </div>
          <div className="auth-card__title" style={{ marginBottom: 6 }}>
            Invitation à rejoindre {invite.tenant_name ?? 'une équipe'}
          </div>
          <div className="auth-card__sub" style={{ marginBottom: 0 }}>
            Invité(e) en tant que <strong style={{ color: 'var(--text)' }}>{invite.email}</strong>
          </div>
        </div>

        {accepted ? (
          <div className="alert alert-success" style={{ justifyContent: 'center' }}>
            Invitation acceptée — redirection…
          </div>
        ) : used ? (
          <div className="alert alert-danger" style={{ justifyContent: 'center' }}>
            Cette invitation a déjà été utilisée ou révoquée.
          </div>
        ) : expired ? (
          <div className="alert alert-danger" style={{ justifyContent: 'center' }}>
            Cette invitation a expiré.
          </div>
        ) : !user ? (
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary w-full" style={{ justifyContent: 'center', padding: 12 }}
              onClick={() => goAuth()}>
              Se connecter avec GitHub pour accepter
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {user.email !== invite.email && (
              <div className="alert alert-danger mb-2" style={{ fontSize: 12 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                Vous êtes connecté(e) en tant que {user.email}, mais l'invitation cible {invite.email}.
              </div>
            )}
            <button className="btn btn-primary w-full" style={{ justifyContent: 'center', padding: 12 }}
              disabled={acceptMutation.isPending}
              onClick={() => acceptMutation.mutate()}>
              {acceptMutation.isPending
                ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> Acceptation…</>
                : 'Accepter l\'invitation'}
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
