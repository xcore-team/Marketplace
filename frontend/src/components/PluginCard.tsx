import { useNavigate } from 'react-router-dom'
import { Star, Download, Package } from 'lucide-react'
import type { Plugin } from '../types'

interface Props {
  plugin: Plugin
  delay?: number
}

export default function PluginCard({ plugin, delay = 0 }: Props) {
  const navigate = useNavigate()

  return (
    <div
      className="plugin-card"
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => navigate(`/plugins/${plugin.slug}`)}
    >
      <div className="plugin-card__top-accent" />

      <div className="plugin-card__header">
        <div className="plugin-card__icon-wrap">
          <Package size={18} strokeWidth={1.5} style={{ color: 'var(--acc)' }} />
        </div>
        <div className="flex gap-2 items-center">
          {plugin.category && (
            <span className="badge badge-acc">{plugin.category.name}</span>
          )}
          {plugin.latest_version && (
            <span className="badge badge-ghost font-mono" style={{ fontSize: '11px' }}>
              v{plugin.latest_version}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="plugin-card__name">{plugin.name}</div>
        {plugin.description && (
          <p className="plugin-card__desc mt-2">
            {plugin.description.length > 110
              ? plugin.description.slice(0, 110) + '…'
              : plugin.description}
          </p>
        )}
      </div>

      <div className="plugin-card__footer">
        <span className="plugin-card__stat text-faint">
          {plugin.developer_id ? `@${plugin.developer_id.slice(0, 8)}` : '—'}
        </span>
        <div className="flex gap-3">
          {plugin.average_score != null && plugin.average_score > 0 && (
            <span className="plugin-card__stat">
              <Star size={11} fill="var(--amber)" color="var(--amber)" />
              {plugin.average_score.toFixed(1)}
            </span>
          )}
          <span className="plugin-card__stat">
            <Download size={11} style={{ opacity: 0.5 }} />
            {(plugin.download_count ?? 0).toLocaleString('fr')}
          </span>
        </div>
      </div>
    </div>
  )
}
