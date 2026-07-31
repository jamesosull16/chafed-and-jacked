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

/**
 * Proactive post-workout messages draw on a separate, much smaller budget in
 * the same document. Separate because an automated message must never be able
 * to consume the conversational allowance — the failure mode is James asking a
 * question and being told he's out of messages because a sync loop spent them.
 * Small because there are only so many workouts in an hour, and a number
 * larger than that would just be a wider blast radius for a retry storm.
 */
const MAX_PROACTIVE_PER_WINDOW = 6

/** How many workout ids to remember for idempotency. Bounded so the doc can't grow. */
const POSTED_HISTORY = 20

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

/**
 * Consume one proactive message from the separate budget.
 *
 * @throws {RateLimitError} when the window is exhausted
 */
export async function consumeProactive(store, now = Date.now()) {
  const doc = await store.getSystemDoc(USAGE_COLLECTION)
  const windowStart = doc?.proactiveWindowStart || 0
  const count = doc?.proactiveCount || 0

  if (now - windowStart > WINDOW_MS) {
    await store.setSystemDoc(USAGE_COLLECTION, { proactiveWindowStart: now, proactiveCount: 1 })
    return { remaining: MAX_PROACTIVE_PER_WINDOW - 1 }
  }

  if (count >= MAX_PROACTIVE_PER_WINDOW) {
    throw new RateLimitError(Math.ceil((windowStart + WINDOW_MS - now) / 1000))
  }

  await store.setSystemDoc(USAGE_COLLECTION, { proactiveWindowStart: windowStart, proactiveCount: count + 1 })
  return { remaining: MAX_PROACTIVE_PER_WINDOW - count - 1 }
}

/**
 * Claim a workout id for a proactive message, once.
 *
 * The client fires this call-and-forget after saving a session, so a retry, a
 * double-tap, or a re-mount can all deliver the same id twice. Claiming before
 * the model runs means the second attempt is refused rather than producing a
 * second unprompted message about the same workout.
 *
 * Lives in the rate-limit document rather than a new collection because that
 * document is already client-unwritable — a new collection would need its own
 * `allow write: if false` rule, and one more place to get that wrong.
 *
 * @returns {boolean} true when the claim is new and the caller should proceed
 */
export async function claimWorkout(store, workoutId) {
  if (!workoutId) return false
  const doc = await store.getSystemDoc(USAGE_COLLECTION)
  const posted = Array.isArray(doc?.postedWorkouts) ? doc.postedWorkouts : []
  if (posted.includes(workoutId)) return false

  await store.setSystemDoc(USAGE_COLLECTION, {
    postedWorkouts: [...posted, workoutId].slice(-POSTED_HISTORY),
  })
  return true
}

export const LIMITS = { WINDOW_MS, MAX_TURNS_PER_WINDOW, MAX_PROACTIVE_PER_WINDOW, POSTED_HISTORY }
