import type { ReactNode } from 'react'

export type PillVariant = 'default' | 'acc' | 'success' | 'danger' | 'warning'

/** Small label chip — GitHub's "topic"/label pill. Replaces .badge-* for
 * pages migrated to the GitHub-pattern rebuild (.badge-* stays for
 * not-yet-migrated pages, incl. AdminPage). */
export default function Pill({
  children,
  variant = 'default',
  icon,
}: {
  children: ReactNode
  variant?: PillVariant
  icon?: ReactNode
}) {
  const cls = variant === 'default' ? 'pill' : `pill pill--${variant}`
  return (
    <span className={cls}>
      {icon}
      {children}
    </span>
  )
}
