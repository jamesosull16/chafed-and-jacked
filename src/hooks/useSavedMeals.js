import { useCallback, useMemo } from 'react'
import { setDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore'
import { useFirestore, useRealtimeCollection } from './useFirestore'
import { libraryKey, normaliseName, sortSavedMeals } from '../lib/savedMeals'

/**
 * The meal library, live.
 *
 * Documents live at `users/{uid}/savedMeals/{id}` — inside the user subtree, so
 * the existing recursive rule already covers them and no rules change is needed.
 *
 * Subscribed rather than fetched, for the same reason today's nutrition log is:
 * the coach and the MCP server write here too, and a one-shot read at mount is
 * how a meal saved from a Claude conversation stays invisible on the Fuel page
 * until the app is reloaded.
 *
 * Ordered by `createdAt` on the server and re-sorted by use on the client.
 * Firestore's `orderBy` silently drops documents missing the field, so ordering
 * on `lastUsedAt` — which is null until a meal is logged — would hide every
 * meal that has never been used. Which is exactly the ones worth showing.
 */
export function useSavedMeals() {
  const { data, loading } = useRealtimeCollection('savedMeals', 'createdAt', 'desc')
  const { userRef } = useFirestore()

  const savedMeals = useMemo(() => sortSavedMeals(data), [data])

  const findByName = useCallback(
    (name) => data.find((m) => m.key === libraryKey(name)) || null,
    [data]
  )

  /**
   * Save a meal, or update the one already under that name.
   *
   * Name-keyed rather than append-only on purpose: re-saving "Overnight oats"
   * with a better estimate should correct the entry he already searches for,
   * not leave two meals with the same name and different macros for him to
   * pick between at 6am.
   *
   * @returns {{ id: string, replaced: boolean }|null}
   */
  const saveMeal = useCallback(
    async (meal) => {
      const name = normaliseName(meal?.name)
      const existing = data.find((m) => m.key === libraryKey(name)) || null
      const id = existing?.id || crypto.randomUUID()
      const ref = userRef(`savedMeals/${id}`)
      if (!ref) return null

      const now = new Date().toISOString()
      await setDoc(
        ref,
        {
          ...meal,
          name,
          key: libraryKey(name),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          // Only on creation — an update must not reset how often it's used, and
          // `lastUsedAt` must exist from the start so sorting has something to
          // compare rather than an absent field.
          ...(existing ? {} : { useCount: 0, lastUsedAt: null }),
        },
        { merge: true }
      )
      return { id, replaced: !!existing }
    },
    [data, userRef]
  )

  /** Edit a stored meal in place. Renaming re-derives the match key with it. */
  const updateMeal = useCallback(
    async (id, patch) => {
      const ref = userRef(`savedMeals/${id}`)
      if (!ref) return
      const name = patch.name !== undefined ? normaliseName(patch.name) : undefined
      await updateDoc(ref, {
        ...patch,
        ...(name !== undefined && { name, key: libraryKey(name) }),
        updatedAt: new Date().toISOString(),
      })
    },
    [userRef]
  )

  const deleteMeal = useCallback(
    async (id) => {
      const ref = userRef(`savedMeals/${id}`)
      if (ref) await deleteDoc(ref)
    },
    [userRef]
  )

  /**
   * Record that a meal was logged.
   *
   * `increment` rather than a read-then-write: the coach logs from the library
   * too, and a count computed from a stale local copy would quietly undo its
   * writes. Failures are swallowed — a missed usage stat must never take down
   * the meal log that just succeeded.
   */
  const markUsed = useCallback(
    async (id) => {
      const ref = userRef(`savedMeals/${id}`)
      if (!ref) return
      try {
        await updateDoc(ref, { lastUsedAt: new Date().toISOString(), useCount: increment(1) })
      } catch {
        // Ordering falls back to creation date.
      }
    },
    [userRef]
  )

  return { savedMeals, loading, saveMeal, updateMeal, deleteMeal, markUsed, findByName }
}
