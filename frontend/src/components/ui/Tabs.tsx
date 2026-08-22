import type { ReactNode } from 'react'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  icon?: ReactNode
  count?: number
  hidden?: boolean
}

/** GitHub-style tab bar — bottom-border underline on the active tab, no
 * pill/background treatment. Replaces the duplicated tab-bar markup that
 * used to live in each detail/settings page. */
export default function Tabs<T extends string>({
  items,
  active,
  onChange,
}: {
  items: TabItem<T>[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="tabs">
      {items.filter((t) => !t.hidden).map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tabs__item${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
          {t.count != null && <span className="tabs__count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
