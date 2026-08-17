import { setDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { formatLocalDate } from './localDate'

/**
 * The day an entry belongs to, from when it was logged.
 *
 * A coach card is a record of a turn, and turns persist — Tuesday's food card
 * is still in the thread on Thursday. Assuming a card's meal is on *today's*
 * log is how "Edit portions" opened read-only on anything logged before today,
 * which is most of the thread.
 *
 * The date is derived locally, matching how the day's document was named when
 * the meal went on it: the coach function builds the same id from the client's
 * timezone offset.
 */
export function logDateIdFor(entry, fallback = formatLocalDate()) {
  if (!entry?.loggedAt) return fallback
  const at = new Date(entry.loggedAt)
  return Number.isNaN(at.getTime()) ? fallback : formatLocalDate(at)
}

/**
 * Replace one entry on a day's log, in place of it.
 *
 * Two array transforms rather than a rewritten `entries` array, for the reason
 * `NutritionTracker.mutateEntry` gives: this document has two writers — this
 * app and the Coach's cloud function — and writing back a locally built array
 * silently erases whatever the other one added in the meantime.
 *
 * The order matters. The corrected entry goes on *first*, and only then is the
 * stale one removed. If the second write never lands, the day shows the meal
 * twice — visible, and deletable in a tap. The other order loses the meal
 * outright and looks like nothing ever happened.
 *
 * `previous` has to deep-equal what is stored for `arrayRemove` to match it, so
 * callers pass the entry as they last read it, not a copy they have edited.
 */
export async function replaceLogEntry(ref, { previous, next, dateId, targets }) {
  if (!ref || !previous || !next) return
  await setDoc(
    ref,
    {
      date: dateId,
      entries: arrayUnion(next),
      ...(targets && { targets }),
    },
    { merge: true }
  )
  await setDoc(ref, { entries: arrayRemove(previous) }, { merge: true })
}

/** The stored copy of an entry, by id — what `replaceLogEntry` needs to remove. */
export function findEntryById(entries = [], id) {
  if (!id) return null
  return entries.find((entry) => entry?.id === id) || null
}
