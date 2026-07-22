import { cn } from './cn'

/**
 * Tabs — underline style, for switching views within a page.
 * `tabs`: [{ id, label, icon? }]
 */
export default function Tabs({ tabs, value, onChange, ariaLabel, className }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 border-b border-border-default -mx-1 px-1', className)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex items-center justify-center gap-1.5 px-3 min-h-11 text-sm font-medium transition-colors',
              'after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full',
              active
                ? 'text-brand after:bg-brand'
                : 'text-muted hover:text-text after:bg-transparent'
            )}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
