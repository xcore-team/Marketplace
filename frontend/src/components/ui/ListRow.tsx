import type { ReactNode } from 'react'

/** Dense row — GitHub's repo-list/issue-list row pattern: bold title, one
 * muted description line, a compact meta row (icons/counts/pills/relative
 * time). Replaces card-grid items (PluginCard/ServiceCard) and raw <tr>
 * rows for anything list-shaped. */
export default function ListRow({
  icon,
  title,
  description,
  meta,
  side,
  onClick,
  selected,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode[]
  side?: ReactNode
  onClick?: () => void
  selected?: boolean
}) {
  return (
    <div className={`list-row${selected ? ' list-row--selected' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {icon}
      <div className="list-row__main">
        <div className="list-row__title">{title}</div>
        {description && <div className="list-row__desc">{description}</div>}
        {meta && meta.length > 0 && (
          <div className="list-row__meta">
            {meta.map((m, i) => <span className="list-row__meta-item" key={i}>{m}</span>)}
          </div>
        )}
      </div>
      {side && <div className="list-row__side">{side}</div>}
    </div>
  )
}
