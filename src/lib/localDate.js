/**
 * Format a Date as YYYY-MM-DD using local timezone (avoids UTC shift).
 *
 * Its own module, free of Firebase, so pure code can name a day's document
 * without pulling in `initializeFirestore` alongside it. `useFirestore`
 * re-exports it, so every existing import still resolves.
 */
export function formatLocalDate(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The local calendar day a stored record belongs to.
 *
 * Sessions are stamped with `new Date().toISOString()` — a UTC instant. Reading
 * the day back with `.slice(0, 10)` therefore asks UTC which day it was, and
 * west of Greenwich that is the wrong answer for anything logged in the
 * evening: a session finished at 19:00 in Denver is 01:00 UTC tomorrow, and the
 * week schedule filed it on a day the athlete was asleep for.
 *
 * Bare `YYYY-MM-DD` values are passed through untouched. They are already local
 * day ids, and handing one to `new Date()` would parse it as UTC midnight and
 * shift it backwards a day — the same bug from the other direction.
 */
export function sessionDayId(value) {
  if (!value) return null
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : formatLocalDate(d)
}
