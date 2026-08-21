import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { getToken } from './api'
import { useXPulse } from './hooks/useXPulse'
import { useToast } from './components/Toast'
import Nav from './components/Nav'
import RequireAuth from './components/RequireAuth'
import HomePage from './pages/HomePage'
import PluginsPage from './features/plugins/PluginsPage'
import PluginDetailPage from './features/plugins/PluginDetailPage'
import AuthPage from './pages/AuthPage'
import DashboardPage from './features/dashboard/DashboardPage'
import PluginEditPage from './features/plugins/PluginEditPage'
import TeamSettingsPage from './features/team/TeamSettingsPage'
import AboutPage from './pages/AboutPage'
import VisionPage from './pages/VisionPage'
import SponsorsPage from './pages/SponsorsPage'
import SettingsPage from './features/settings/SettingsPage'
import AdminPage from './pages/AdminPage'
import InviteAcceptPage from './pages/InviteAcceptPage'
import ServicesPage from './features/services/ServicesPage'
import ServiceDetailPage from './features/services/ServiceDetailPage'
import DeploymentsPage from './features/deployments/DeploymentsPage'

export default function App() {
  const { initialize, initialized, user } = useAuthStore()
  const theme = useThemeStore((state) => state.theme)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // ── Global Notifications (SSE) ───────────────────────────────────────────
  // Le toast seul ne suffisait pas : "Mes soumissions"/"Mes plugins" ne se
  // rafraîchissaient qu'au prochain poll (8s, seulement tant qu'une
  // soumission active était déjà en cache) ou à un rechargement manuel de
  // page — d'où le statut/résultat qui semblait ne jamais s'actualiser.
  // manual_review n'avait même aucun toast.
  useXPulse((event) => {
    if (event.event === 'SUBMISSION_PIPELINE_DONE') {
      const status = event.status as string
      const name = event.plugin_name as string
      if (status === 'approved') {
        toast(`Félicitations ! Votre module ${name} a été approuvé et publié.`, 'success')
      } else if (status === 'rejected') {
        toast(`Votre module ${name} a été rejeté par le pipeline. Consultez le rapport.`, 'error')
      } else if (status === 'manual_review') {
        toast(`Votre module ${name} a été envoyé en révision manuelle.`, 'info')
      }
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['my-plugins'] })
    } else if (event.event === 'SERVICE_SUBMISSION_DONE') {
      const status = event.status as string
      const name = event.service_name as string
      if (status === 'approved') {
        toast(`Félicitations ! Votre service ${name} a été approuvé et publié.`, 'success')
      } else if (status === 'rejected') {
        toast(`Votre service ${name} a été rejeté par le pipeline. Consultez le rapport.`, 'error')
      } else if (status === 'manual_review') {
        toast(`Votre service ${name} a été envoyé en révision manuelle.`, 'info')
      }
      queryClient.invalidateQueries({ queryKey: ['my-service-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['my-services'] })
    } else if (event.event === 'ADMIN_BROADCAST') {
      toast(event.text as string, 'info')
    }
  }, !!user)

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme')
    } else {
      document.documentElement.classList.remove('light-theme')
    }
  }, [theme])

  useEffect(() => {
    if (getToken()) initialize()
    else useAuthStore.setState({ initialized: true })
  }, [initialize])

  if (!initialized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
          <span className="text-muted text-sm">Chargement…</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/plugins" element={<PluginsPage />} />
        <Route path="/plugins/:slug" element={<PluginDetailPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route
          path="/dashboard/plugins/:slug/edit"
          element={<RequireAuth><PluginEditPage /></RequireAuth>}
        />
        <Route path="/dashboard/team" element={<RequireAuth><TeamSettingsPage /></RequireAuth>} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/vision" element={<VisionPage />} />
        <Route path="/sponsors" element={<SponsorsPage />} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/services/:slug" element={<ServiceDetailPage />} />
        <Route path="/deployments" element={<RequireAuth><DeploymentsPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
