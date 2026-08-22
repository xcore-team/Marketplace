import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Users, Check, Settings } from 'lucide-react'
import { teams as teamsApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { useToast } from './Toast'
import type { Tenant } from '../types'

export default function TeamSwitcher() {
  const navigate = useNavigate()
  const { user, switchTeam } = useAuthStore()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Tenant[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  useEffect(() => {
    if (!open || items !== null) return
    teamsApi
      .list()
      .then(setItems)
      .catch(() => toast('Impossible de charger les équipes', 'error'))
  }, [open, items])

  if (!user) return null

  const current = items?.find((t) => t.id === user.tenant_id)

  const handleSelect = async (tenantId: string) => {
    setLoading(true)
    try {
      await switchTeam(tenantId)
      setOpen(false)
    } catch {
      toast("Impossible de changer d'équipe", 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="team-switcher" ref={ref}>
      <button
        className="btn btn-ghost btn-sm team-switcher__trigger"
        onClick={() => setOpen((v) => !v)}
        title="Changer d'équipe"
      >
        <Users size={16} />
        <span>{current?.name ?? 'Personnel'}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="team-switcher__panel">
          {items === null && <div className="team-switcher__empty">Chargement…</div>}
          {items !== null && items.length === 0 && (
            <div className="team-switcher__empty">Aucune équipe</div>
          )}
          {items?.map((t) => (
            <button
              key={t.id}
              className="team-switcher__item"
              disabled={loading}
              onClick={() => handleSelect(t.id)}
            >
              <span>{t.name}</span>
              {t.id === user.tenant_id && <Check size={14} />}
            </button>
          ))}
          <div className="team-switcher__divider" />
          <button
            className="team-switcher__item"
            onClick={() => {
              setOpen(false)
              navigate('/dashboard/team')
            }}
          >
            <span className="flex items-center gap-2">
              <Settings size={13} /> Gérer l'équipe
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
