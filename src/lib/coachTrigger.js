/**
 * POST-WORKOUT COACH TRIGGER
 *
 * Tells the Cloud Function a workout was logged, so the coach can drop a
 * fuelling message into the thread unprompted.
 *
 * Fire-and-forget, and deliberately so. This runs at the moment James finishes
 * training and taps save — the one moment in the app where a spinner or an
 * error toast is least welcome. A coach message that fails to arrive is a
 * missing nicety; a save that appears to fail because a chat message did is a
 * bug he will remember. So nothing here is awaited by the caller and nothing
 * here can throw into one.
 *
 * The payload carries only the id and the kind. What the workout actually was
 * is re-read server-side — the same trust rule the rest of the coach follows,
 * and it means this cannot be used to fabricate a session.
 */

import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export function notifyWorkoutLogged({ workoutId, kind }) {
  if (!workoutId) return

  try {
    const callable = httpsCallable(functions, 'coachWorkoutLogged', { timeout: 180_000 })
    // Not awaited: the caller must not block on this, and must not fail with it.
    callable({
      workoutId,
      kind,
      timezoneOffset: new Date().getTimezoneOffset(),
    }).catch((err) => {
      // Visible in dev, silent to him.
      console.debug('Coach post-workout message skipped:', err?.message || err)
    })
  } catch (err) {
    console.debug('Coach post-workout message could not be sent:', err?.message || err)
  }
}

export default notifyWorkoutLogged
