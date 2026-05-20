import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { getToken } from './api'
import { useXPulse } from './hooks/useXPulse'
import { useToast } from './components/Toast'
import Nav from './components/Nav'
import HomePage from './pages/HomePage'
import PluginsPage from './pages/PluginsPage'
import PluginDetailPage from './pages/PluginDetailPage'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import AboutPage from './pages/AboutPage'
import VisionPage from './pages/VisionPage'
import SponsorsPage from './pages/SponsorsPage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  const { initialize, initialized, user } = useAuthStore()
  const theme = useThemeStore((state) => state.theme)
  const { toast } = useToast()

  // ── Global Notifications (SSE) ───────────────────────────────────────────
  useXPulse((event) => {
    if (event.event === 'SUBMISSION_PIPELINE_DONE') {
      const status = event.status as string
      const name = event.plugin_name as string
      if (status === 'approved') {
        toast(`Félicitations ! Votre module ${name} a été approuvé et publié.`, 'success')
      } else if (status === 'rejected') {
        toast(`Votre module ${name} a été rejeté par le pipeline. Consultez le rapport.`, 'error')
      }
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/vision" element={<VisionPage />} />
        <Route path="/sponsors" element={<SponsorsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
