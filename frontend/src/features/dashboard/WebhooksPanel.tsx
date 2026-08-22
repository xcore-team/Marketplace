import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Webhook as WebhookIcon, Trash2 } from 'lucide-react'
import { webhooks as hooksApi } from '../../api'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { RelativeTime } from '../../components/ui'

export default function WebhooksPanel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newSecret, setNewSecret] = useState('')

  const { data: hooks, isLoading } = useQuery({ queryKey: ['my-webhooks'], queryFn: hooksApi.list })

  const createMutation = useMutation({
    mutationFn: () => hooksApi.create({ url: newUrl, secret: newSecret || undefined }),
    onSuccess: () => {
      toast('Webhook ajouté avec succès !', 'success')
      setShowAdd(false); setNewUrl(''); setNewSecret('')
      queryClient.invalidateQueries({ queryKey: ['my-webhooks'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: hooksApi.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-webhooks'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: hooksApi.delete,
    onSuccess: () => {
      toast('Webhook supprimé.', 'info')
      queryClient.invalidateQueries({ queryKey: ['my-webhooks'] })
    },
  })

  if (isLoading) return <PageLoading text="Chargement des webhooks…" />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 className="section__title">Webhooks développeur</h3>
          <p className="text-xs text-muted">Recevez des notifications HTTP en temps réel pour vos soumissions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Ajouter un endpoint</button>
      </div>

      {showAdd && (
        <div className="panel mb-5" style={{ borderColor: 'var(--acc-glow)' }}><div className="panel__body">
          <h4 className="font-bold mb-3">Nouveau webhook</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="input-wrap">
              <label className="input-label">URL de destination</label>
              <input className="input" placeholder="https://mon-app.com/webhook" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
            </div>
            <div className="input-wrap">
              <label className="input-label">Secret HMAC (optionnel)</label>
              <input className="input" type="password" placeholder="Clé de signature" value={newSecret} onChange={e => setNewSecret(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={!newUrl || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Création…' : 'Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Annuler</button>
          </div>
        </div></div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!hooks?.length ? (
          <div className="empty">
            <div className="empty__icon"><WebhookIcon size={40} strokeWidth={1.5} /></div>
            <div className="empty__text">Vous n'avez pas encore de webhooks configurés.</div>
          </div>
        ) : hooks.map(h => (
          <div key={h.id} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: h.is_active ? 'var(--acc-subtle)' : 'var(--surface2)', color: h.is_active ? 'var(--acc)' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <WebhookIcon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-bold truncate" style={{ opacity: h.is_active ? 1 : 0.5 }}>{h.url}</div>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-faint">Events: <code className="text-acc">{h.events}</code></span>
                {h.last_triggered_at && <span className="text-xs text-faint">Dernier appel: <RelativeTime date={h.last_triggered_at} /></span>}
                {h.last_status_code && (
                  <span className={`text-xs font-bold ${h.last_status_code < 300 ? 'text-success' : 'text-danger'}`}>HTTP {h.last_status_code}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button className={`btn btn-sm ${h.is_active ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleMutation.mutate(h.id)}>
                {h.is_active ? 'Désactiver' : 'Activer'}
              </button>
              <button className="btn btn-ghost btn-sm btn-icon text-danger" onClick={() => deleteMutation.mutate(h.id)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
