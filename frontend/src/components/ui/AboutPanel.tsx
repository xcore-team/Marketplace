import type { ReactNode } from 'react'
import Panel from './Panel'
import Pill from './Pill'

export interface AboutStat {
  value: ReactNode
  label: string
}

export interface AboutLink {
  icon: ReactNode
  content: ReactNode
  href?: string
}

/** Repo-page-style sidebar ("About" box on a GitHub repo page): description,
 * stat row (stars/downloads-equivalent), topic pills, link rows. Composes
 * Panel — used by the plugin/service detail pages. */
export default function AboutPanel({
  description,
  stats,
  topics,
  links,
  children,
}: {
  description?: ReactNode
  stats?: AboutStat[]
  topics?: string[]
  links?: AboutLink[]
  children?: ReactNode
}) {
  return (
    <Panel title="À propos">
      {description && <p className="text-sm text-muted" style={{ margin: '0 0 12px' }}>{description}</p>}

      {links && links.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {links.map((l, i) => (
            <div className="about-panel__row" key={i}>
              {l.icon}
              {l.href ? (
                <a href={l.href} target="_blank" rel="noopener noreferrer">{l.content}</a>
              ) : (
                <span>{l.content}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {topics && topics.length > 0 && (
        <div className="about-panel__topics">
          {topics.map((t) => <Pill key={t} variant="acc">{t}</Pill>)}
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="about-panel__stats">
          {stats.map((s, i) => (
            <div className="about-panel__stat" key={i}>
              <span className="about-panel__stat-value">{s.value}</span>
              <span className="about-panel__stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {children}
    </Panel>
  )
}
