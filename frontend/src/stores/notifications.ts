import { create } from 'zustand'

export type NotifType = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  message: string
  timestamp: Date
  read: boolean
  link?: string
}

interface NotificationsState {
  notifications: AppNotification[]
  push: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
  unreadCount: () => number
}

let _seq = 0

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],

  push: (n) => {
    const notif: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${++_seq}`,
      timestamp: new Date(),
      read: false,
    }
    set((s) => ({
      notifications: [notif, ...s.notifications].slice(0, 50),
    }))
  },

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  clear: () => set({ notifications: [] }),

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}))
