import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Trash2, X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react'
import { useNotificationsStore, type AppNotification } from '../stores/notifications'

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'À l\'instant'
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`
  return date.toLocaleDateString('fr', { day: 'numeric', month: 'short' })
}

const TYPE_CONFIG: Record<AppNotification['type'], { icon: typeof CheckCircle; color: string; bg: string }> = {
  success: { icon: CheckCircle,    color: 'var(--acc)',    bg: 'var(--acc-subtle)' },
  error:   { icon: XCircle,        color: 'var(--danger)', bg: 'var(--danger-bg)'  },
  info:    { icon: Info,           color: '#60a5fa',       bg: 'rgba(96,165,250,0.1)' },
  warning: { icon: AlertTriangle,  color: 'var(--amber)',  bg: 'var(--warning-bg)' },
}

export default function NotificationCenter() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const { notifications, markRead, markAllRead, clear, unreadCount } = useNotificationsStore()
  const unread = unreadCount()

  // Ferme le panel si clic en dehors
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleClick = (n: AppNotification) => {
    markRead(n.id)
    if (n.link) {
      navigate(n.link)
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Bell button ── */}
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          width: 36, height: 36,
          borderRadius: 'var(--r-md)',
          background: open ? 'var(--surface2)' : 'transparent',
          border: `1px solid ${open ? 'var(--border2)' : 'transparent'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: open ? 'var(--text)' : 'var(--text2)',
          transition: 'all var(--t-fast)',
        }}
        title="Notifications"
      >
        <Bell size={17} strokeWidth={1.75} />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: 4, right: 4,
            width: unread > 9 ? 16 : 14,
            height: 14,
            borderRadius: 'var(--r-full)',
            background: 'var(--danger)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
            border: '2px solid var(--bg)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            maxHeight: 520,
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh-lg)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeUp 0.15s ease',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} style={{ color: 'var(--acc)' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
              {unread > 0 && (
                <span style={{
                  fontSize: 10, padding: '1px 7px',
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                  borderRadius: 'var(--r-full)', fontWeight: 700,
                }}>
                  {unread} non lue{unread > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {notifications.length > 0 && (
                <>
                  <button
                    onClick={markAllRead}
                    title="Tout marquer comme lu"
                    style={{
                      width: 28, height: 28, border: 'none',
                      background: 'none', cursor: 'pointer',
                      color: 'var(--text3)', borderRadius: 'var(--r-sm)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'color var(--t-fast)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--acc)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                  >
                    <CheckCheck size={15} />
                  </button>
                  <button
                    onClick={clear}
                    title="Tout effacer"
                    style={{
                      width: 28, height: 28, border: 'none',
                      background: 'none', cursor: 'pointer',
                      color: 'var(--text3)', borderRadius: 'var(--r-sm)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'color var(--t-fast)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 28, height: 28, border: 'none',
                  background: 'none', cursor: 'pointer',
                  color: 'var(--text3)', borderRadius: 'var(--r-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color var(--t-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--text3)',
              }}>
                <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} strokeWidth={1.5} />
                <div style={{ fontSize: 13, fontWeight: 500 }}>Aucune notification</div>
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text3)' }}>
                  Les événements du pipeline et les messages admin apparaîtront ici.
                </div>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type]
                const Icon = cfg.icon
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      cursor: n.link ? 'pointer' : 'default',
                      background: n.read ? 'transparent' : 'rgba(0,200,150,0.03)',
                      transition: 'background var(--t-fast)',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      if (!n.read) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'
                      else (e.currentTarget as HTMLDivElement).style.background = 'var(--surface2)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'rgba(0,200,150,0.03)'
                    }}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <div style={{
                        position: 'absolute', left: 6, top: '50%',
                        transform: 'translateY(-50%)',
                        width: 5, height: 5, borderRadius: '50%',
                        background: 'var(--acc)',
                      }} />
                    )}

                    {/* Icon */}
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      borderRadius: 'var(--r-md)',
                      background: cfg.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} style={{ color: cfg.color }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.read ? 400 : 600,
                        color: 'var(--text)',
                        marginBottom: 2,
                        lineHeight: 1.4,
                      }}>
                        {n.title}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--text2)',
                        lineHeight: 1.5,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        {timeAgo(n.timestamp)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
