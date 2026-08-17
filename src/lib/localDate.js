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
