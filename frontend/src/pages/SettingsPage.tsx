import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useThemeStore } from '../stores/theme'
import { useAuthStore } from '../stores/auth'
import { useToast } from '../components/Toast'
import { mfa as mfaApi, password as pwdApi, auth as authApi } from '../api'
import {
  Settings, Moon, Sun, Shield, Bell, User, Key, CheckCircle,
  AlertTriangle, Copy, Trash2, GitBranch, Mail, Smartphone
} from 'lucide-react'

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeStore()
  const { user, setUser } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const refreshUser = async () => {
    try {
      const u = await authApi.me()
      setUser(u)
    } catch { /* ignore */ }
  }

  // ── Password ───────────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')

  const changePwdMutation = useMutation({
    mutationFn: () => pwdApi.change({ current_password: currentPwd, new_password: newPwd }),
    onSuccess: () => {
      toast('Mot de passe mis à jour !', 'success')
      setCurrentPwd(''); setNewPwd('')
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // ── MFA ──────────────────────────────────────────────────────────────
  const [mfaCode, setMfaCode] = useState('')
  const [showMfaSetup, setShowMfaSetup] = useState(false)

  const { data: mfaSetup, refetch: setupMfa } = useQuery({
    queryKey: ['mfa-setup'],
    queryFn: mfaApi.setup,
    enabled: false,
  })

  const enableMfaMutation = useMutation({
    mutationFn: () => mfaApi.enable(mfaCode),
    onSuccess: async () => {
      toast('MFA activé avec succès !', 'success')
      setShowMfaSetup(false); setMfaCode('')
      await refreshUser()
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const disableMfaMutation = useMutation({
    mutationFn: mfaApi.disable,
    onSuccess: async () => {
      toast('MFA désactivé.', 'info')
      await refreshUser()
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const handleStartMfa = async () => {
    await setupMfa()
    setShowMfaSetup(true)
  }

  return (
    <div className="page">
      <div className="section">
        <div className="section__label">Paramètres</div>
        <h1 className="dash-header__title" style={{ marginBottom: 32 }}>
          Mon <span className="gradient-text">Configuration</span>
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 32, alignItems: 'start' }}>
          
          {/* Apparence & Profil */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-box-sm"><Settings size={18} /></div>
                <h3 className="font-bold">Apparence</h3>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface2)' }}>
                <span className="text-sm">Mode {theme === 'dark' ? 'sombre' : 'clair'}</span>
                <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} Basculer
                </button>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-box-sm"><User size={18} /></div>
                <h3 className="font-bold">Profil</h3>
              </div>
              <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--surface2)' }}>
                <div className="text-xs text-faint mb-1">E-mail de connexion</div>
                <div className="text-sm font-bold">{user?.email}</div>
              </div>
              <button className="btn btn-ghost btn-sm w-full" style={{ justifyContent: 'center' }}>
                Éditer le profil public
              </button>
            </div>
          </div>

          {/* Sécurité */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-box-sm"><Key size={18} /></div>
                <h3 className="font-bold">Authentification</h3>
              </div>
              
              <div className="input-wrap mb-3">
                <label className="input-label">Mot de passe actuel</label>
                <input className="input" type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
              </div>
              <div className="input-wrap mb-4">
                <label className="input-label">Nouveau mot de passe</label>
                <input className="input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              </div>
              <button 
                className="btn btn-primary btn-sm w-full" 
                style={{ justifyContent: 'center' }}
                disabled={!currentPwd || !newPwd || changePwdMutation.isPending}
                onClick={() => changePwdMutation.mutate()}
              >
                {changePwdMutation.isPending ? 'Mise à jour…' : 'Changer le mot de passe'}
              </button>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="icon-box-sm"><Shield size={18} /></div>
                  <h3 className="font-bold">Double Auth (MFA)</h3>
                </div>
                {user?.mfa_enabled && <span className="badge badge-success">Activé</span>}
              </div>

              {!showMfaSetup ? (
                <>
                  <p className="text-xs text-muted mb-4">
                    Sécurisez votre compte en exigeant un code TOTP (Google Authenticator) lors de la connexion.
                  </p>
                  {user?.mfa_enabled ? (
                    <button className="btn btn-secondary btn-sm w-full text-danger" onClick={() => disableMfaMutation.mutate()}>
                      Désactiver la double authentification
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm w-full" onClick={handleStartMfa}>
                      Activer la double authentification
                    </button>
                  )}
                </>
              ) : (
                <div className="mfa-setup" style={{ animation: 'fadeUp 0.3s ease' }}>
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ background: '#ffffff', padding: 16, borderRadius: 12, display: 'inline-block', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
                      {mfaSetup?.provisioning_uri && (
                        <QRCodeSVG
                          value={mfaSetup.provisioning_uri}
                          size={160}
                          level="M"
                          includeMargin={false}
                          fgColor="#0a1410"
                          bgColor="#ffffff"
                        />
                      )}
                    </div>
                    <div className="text-xs font-mono mt-2" style={{ color: 'var(--acc)', letterSpacing: '0.1em' }}>
                      {mfaSetup?.secret}
                    </div>
                    <div className="text-xs text-faint mt-1">
                      Scannez avec Google Authenticator, Authy ou 1Password
                    </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
