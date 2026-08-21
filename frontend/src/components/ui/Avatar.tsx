/** Avatar circle — image if given, else initials on a neutral background.
 * Centralizes the avatar-circle pattern that used to be hand-inlined per
 * call site (rating author, GitHub submitter, team member…). */
export default function Avatar({
  src,
  name,
  size = 28,
}: {
  src?: string | null
  name?: string | null
  size?: number
}) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
      title={name ?? undefined}
    >
      {src ? <img src={src} alt={name ?? ''} /> : initial}
    </span>
  )
}
