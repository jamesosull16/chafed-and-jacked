/**
 * Tiny class-name joiner. Filters falsy values so conditional classes read
 * cleanly: cn('base', isActive && 'active', className)
 *
 * It joins; it does NOT resolve Tailwind conflicts. Passing `w-20` to a
 * component whose base is `w-full` yields `class="w-full … w-20"`, and CSS
 * picks the winner by stylesheet order, not by position in the attribute —
 * so the override is silently dead. `Input`, `Textarea` and `Select` all start
 * from a `w-full` base, which makes width the usual casualty.
 *
 * Put the width on a wrapper instead of arguing with the base class. The set
 * logger shipped three times with widths that had never once applied, looking
 * deliberate only because every field was equally ignored.
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
