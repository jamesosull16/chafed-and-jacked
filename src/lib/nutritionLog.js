import { setDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore'
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

/**
 * Re-date an entry onto another day, keeping the time of day it was eaten.
 *
 * `loggedAt` is not decoration — `logDateIdFor` derives an entry's day from it,
 * which is how a coach card from Tuesday knows to open Tuesday's document. Move
 * an entry to another day without re-dating it and the meal sits on one day
 * while every lookup goes to another: the sheet opens read-only, and a
 * correction saves onto a document the meal is not on.
 *
 * The clock time survives the move because it is the part still known to be
 * true. A meal eaten at 7pm on the 4th, logged by mistake on the 5th, was still
 * eaten at 7pm. When there is no original time — an entry from before the field
 * existed — noon is used rather than the current moment, because midnight-
 * adjacent times are the ones that land on the wrong day under a timezone or
 * DST shift.
 */
export function retimeEntryTo(entry, toDateId) {
  const [y, m, d] = String(toDateId).split('-').map(Number)
  if (!y || !m || !d) return entry

  const original = entry?.loggedAt ? new Date(entry.loggedAt) : null
  const next = original && !Number.isNaN(original.getTime()) ? new Date(original) : null
  if (next) {
    next.setFullYear(y, m - 1, d)
  }

  return {
    ...entry,
    loggedAt: (next || new Date(y, m - 1, d, 12, 0, 0)).toISOString(),
    movedAt: new Date().toISOString(),
  }
}

/**
 * Move one logged entry from one day to another.
 *
 * Two documents, so unlike `replaceLogEntry` this is a batch. A batch is atomic
 * — the meal cannot end up on both days or on neither — and it still queues
 * offline like any other write, which is the property that made array
 * transforms the right call here in the first place. Sequencing the two writes
 * by hand would leave a phone that lost signal between them holding a
 * duplicate, and across two days a duplicate is much harder to notice than the
 * same-document case `replaceLogEntry` accepts.
 *
 * `entry` must deep-equal what is stored, because `arrayRemove` matches whole
 * objects. Callers pass the entry as they last read it.
 *
 * The destination is written with `merge`, so a day that has no document yet
 * gets one. It deliberately carries no `targets`: the targets for a past day
 * depend on that day's weight and training, and stamping today's onto it would
 * invent a number the day was never judged against.
 */
export async function moveLogEntry({ fromRef, toRef, entry, toDateId }) {
  if (!fromRef || !toRef || !entry || !toDateId) return null
  if (fromRef.path === toRef.path) return null

  const moved = retimeEntryTo(entry, toDateId)

  const batch = writeBatch(fromRef.firestore)
  batch.set(toRef, { date: toDateId, entries: arrayUnion(moved) }, { merge: true })
  batch.set(fromRef, { entries: arrayRemove(entry) }, { merge: true })
  await batch.commit()

  return moved
}
