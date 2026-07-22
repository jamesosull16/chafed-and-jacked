import { cn } from './cn'

export default function Skeleton({ className, rounded = 'rounded-lg' }) {
  return (
    <div
      className={cn('bg-surface-2', rounded, className)}
      style={{ animation: 'cj-pulse 1.6s ease-in-out infinite' }}
      aria-hidden="true"
    />
  )
}

/** Full-page loading state — a few card silhouettes rather than a spinner. */
export function SkeletonPage({ cards = 3 }) {
  return (
    <div className="space-y-4 pt-2" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" rounded="rounded-2xl" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
