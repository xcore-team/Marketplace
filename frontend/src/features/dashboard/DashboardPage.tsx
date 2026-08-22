import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Send, Package, Server, Webhook as WebhookIcon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import SubmitPanel from './SubmitPanel'
import SubmissionsPanel from './SubmissionsPanel'
import ServicesPanel from './ServicesPanel'
import WebhooksPanel from './WebhooksPanel'

type Tab = 'submit' | 'submissions' | 'services' | 'webhooks'

// "Mes modules" (nom générique précédent) laissait croire que plugins ET
// services y étaient listés ensemble — en réalité ce panneau n'a jamais
// affiché que les plugins (subsApi/pluginsApi.mine()), les services ayant
// leur propre historique dans l'onglet "Services". Renommé pour que la
// distinction soit visible dès la barre de nav, pas seulement en ouvrant
// le panneau.
const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'submit', label: 'Soumettre', icon: <Send size={15} /> },
  { id: 'submissions', label: 'Mes plugins', icon: <Package size={15} /> },
  { id: 'services', label: 'Services', icon: <Server size={15} /> },
  { id: 'webhooks', label: 'Webhooks', icon: <WebhookIcon size={15} /> },
]

/** Developer control panel — sidebar nav + content, not a top-tab page like
 * the public catalogue/detail pages. This is where a developer manages
 * their own plugins/services, so it reads as a dashboard (GitHub Settings
 * pattern) rather than a document. */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('submit')

  if (!user) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><GitBranch size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Connexion requise</div>
          <div className="empty__text">Vous devez être connecté pour accéder à votre espace développeur.</div>
          <button className="btn btn-primary" onClick={() => navigate('/auth?mode=login')}>Se connecter</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className="section__label">Atelier développeur</div>
              <h1 className="dash-header__title">Tableau de <span className="gradient-text">bord</span></h1>
              <p className="dash-header__sub">
                Gérez vos extensions, suivez vos soumissions et faites grandir l'écosystème <strong style={{ color: 'var(--acc)' }}>XCoreHub</strong>.
              </p>
            </div>
            <img src="/mascot.svg" alt="" style={{ width: 56, opacity: 0.8, flexShrink: 0, marginTop: 4 }} />
          </div>
        </div>
      </div>

      <div className="dash-shell">
        <aside className="dash-sidebar">
          <nav className="dash-sidebar__nav">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`dash-sidebar__item${tab === n.id ? ' active' : ''}`}
                onClick={() => setTab(n.id)}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
        </aside>

        <div>
          {tab === 'submit' && <SubmitPanel />}
          {tab === 'submissions' && <SubmissionsPanel onGoSubmit={() => setTab('submit')} />}
          {tab === 'services' && <ServicesPanel />}
          {tab === 'webhooks' && <WebhooksPanel />}
        </div>
      </div>
    </div>
  )
}
