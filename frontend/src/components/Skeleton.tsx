interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: string
  className?: string
}

export function Skeleton({ width = '100%', height = '16px', radius = '6px', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
    />
  )
}

export function PluginCardSkeleton() {
  return (
    <div className="plugin-card" style={{ cursor: 'default', animation: 'none', gap: '14px' }}>
      <div className="flex justify-between items-center">
        <Skeleton width="80px" height="22px" radius="999px" />
        <Skeleton width="48px" height="22px" radius="999px" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton height="22px" width="70%" />
        <Skeleton height="13px" />
        <Skeleton height="13px" width="85%" />
      </div>
      <div className="flex justify-between">
        <Skeleton width="80px" height="13px" />
        <Skeleton width="60px" height="13px" />
      </div>
    </div>
  )
}

export function PageLoading({ text = 'Chargement…' }: { text?: string }) {
  return (
    <div className="page-loading">
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
      <span className="text-muted text-sm">{text}</span>
    </div>
  )
}
