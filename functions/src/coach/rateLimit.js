/**
 * Per-user rate limiting for the coach.
 *
 * Each turn costs a model call with an image and up to eight tool round-trips,
 * so an unbounded endpoint is a billing hazard as much as an abuse one. State
 * lives in Firestore rather than memory because Cloud Functions instances are
 * ephemeral and a per-instance counter would reset on every cold start.
 *
 * The counter lives in a top-level `coachUsage/{uid}` document rather than
 * under the user's own subtree, because Firestore rules are a permissive union
 * — a deny nested under the user's recursive wildcard would be overridden by
 * it, letting the client reset its own limit.
 */

const USAGE_COLLECTION = 'coachUsage'

const WINDOW_MS = 60 * 60 * 1000
const MAX_TURNS_PER_WINDOW = 60

export class RateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super(
      `You've hit the hourly message limit. Try again in about ${Math.ceil(
        retryAfterSeconds / 60
      )} minutes.`
    )
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * Consume one turn from the user's budget.
 *
 * @throws {RateLimitError} when the window is exhausted
 */
export async function consumeTurn(store, now = Date.now()) {
  const doc = await store.getSystemDoc(USAGE_COLLECTION)
  const windowStart = doc?.windowStart || 0
  const count = doc?.count || 0

  if (now - windowStart > WINDOW_MS) {
    await store.setSystemDoc(USAGE_COLLECTION, { windowStart: now, count: 1 })
    return { remaining: MAX_TURNS_PER_WINDOW - 1 }
  }

  if (count >= MAX_TURNS_PER_WINDOW) {
    throw new RateLimitError(Math.ceil((windowStart + WINDOW_MS - now) / 1000))
  }

  await store.setSystemDoc(USAGE_COLLECTION, { windowStart, count: count + 1 })
  return { remaining: MAX_TURNS_PER_WINDOW - count - 1 }
}

export const LIMITS = { WINDOW_MS, MAX_TURNS_PER_WINDOW }
