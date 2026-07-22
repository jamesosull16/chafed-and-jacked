/**
 * Tiny class-name joiner. Filters falsy values so conditional classes read
 * cleanly: cn('base', isActive && 'active', className)
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
