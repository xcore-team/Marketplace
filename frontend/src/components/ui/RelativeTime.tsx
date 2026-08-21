/** Centralizes date formatting — generalizes the timeAgo() that used to be
 * defined locally inside NotificationCenter.tsx, and replaces the repeated
 * `new Date(x).toLocaleDateString('fr', {...})` calls scattered per page. */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 30) return `Il y a ${Math.floor(diff / 86400)} j`
  return d.toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function RelativeTime({ date, title }: { date: Date | string; title?: boolean }) {
  const d = typeof date === 'string' ? new Date(date) : date
  return (
    <time
      dateTime={d.toISOString()}
      title={title === false ? undefined : d.toLocaleString('fr')}
    >
      {timeAgo(d)}
    </time>
  )
}
