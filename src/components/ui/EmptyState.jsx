import { cn } from './cn'

export default function EmptyState({ icon: Icon, title, message, action, className }) {
  return (
    <div className={cn('text-center py-12 px-6', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
          <Icon className="w-6 h-6 text-subtle" aria-hidden="true" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-text">{title}</p>}
      {message && <p className="text-sm text-muted mt-1 max-w-xs mx-auto">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
