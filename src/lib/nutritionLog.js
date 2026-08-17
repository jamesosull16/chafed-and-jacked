import { setDoc, arrayUnion, arrayRemove } from 'firebase/firestore'

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
