import type { ReactNode } from 'react'

/** Bordered box — the base building block of the GitHub-pattern rebuild.
 * No blur/glow/hover-lift (see .card/.info-box) — a solid surface with a
 * 1px border; borders carry the layout, not shadows. */
export default function Panel({
  title,
  action,
  muted = false,
  children,
  className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  muted?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`panel${muted ? ' panel--muted' : ''}${className ? ` ${className}` : ''}`}>
      {title && (
        <div className="panel__header">
          <span>{title}</span>
          {action}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </div>
  )
}
