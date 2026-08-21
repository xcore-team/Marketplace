import { useNavigate, useLocation } from 'react-router-dom'
import { Sun, Moon, Settings } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { useToast } from './Toast'
import TeamSwitcher from './TeamSwitcher'
import NotificationCenter from './NotificationCenter'

export default function Nav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()
  const { toast } = useToast()
  const { theme, toggleTheme } = useThemeStore()

  const isActive = (to: string) =>
    pathname === to || (to !== '/' && pathname.startsWith(to))

  const handleLogout = async () => {
    try {
      await logout()
      toast('Déconnecté avec succès', 'success')
      navigate('/')
    } catch {
      toast('Erreur lors de la déconnexion', 'error')
    }
  }

  return (
    <nav className="nav">
      <div className="nav__inner">
        <div className="nav__logo" onClick={() => navigate('/')}>
          <img src="/mascot.svg" alt="XCore mascot" className="nav__logo-img" />
          <span>
            <span className="gradient-text">XCore</span>
            <span style={{ color: 'var(--text2)', fontWeight: 400 }}>Hub</span>
          </span>
        </div>

        <div className="nav__links">
          {[
            { to: '/', label: 'Accueil' },
            { to: '/plugins', label: 'Catalogue' },
            { to: '/services', label: 'Services' },
            ...(user ? [{ to: '/dashboard', label: 'Atelier' }] : []),
            ...(user ? [{ to: '/deployments', label: 'Déploiements' }] : []),
            ...(user?.is_superuser ? [{ to: '/admin', label: 'Admin' }] : []),
            { to: '/about', label: 'À propos' },
            { to: '/vision', label: 'Vision' },
          ].map(({ to, label }) => (
            <div
              key={to}
              className={`nav__link${isActive(to) ? ' active' : ''}`}
              onClick={() => navigate(to)}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="nav__right">
          <button 
            className="btn btn-icon btn-ghost" 
            onClick={() => navigate('/settings')}
            title="Paramètres"
            style={{ padding: 8, borderRadius: 'var(--r-md)' }}
          >
            <Settings size={18} />
          </button>
          
          <button 
            className="btn btn-icon btn-ghost" 
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'}
            style={{ padding: 8, borderRadius: 'var(--r-md)' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {user ? (
            <>
              <NotificationCenter />
              <TeamSwitcher />
              <span className="nav__user">{user.email}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/auth')}>
                Connexion
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
