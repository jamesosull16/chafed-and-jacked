/**
 * Firestore accessor bound to exactly one uid.
 *
 * Every path is built from the uid captured at construction. No method takes a
 * uid, so nothing downstream — including a tool the model chose to call, with
 * arguments derived from user text — can reach another user's data.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'

export function createStore(uid) {
  if (!uid) throw new Error('createStore requires a uid')
  const db = getFirestore()
  const user = db.collection('users').doc(uid)

  return {
    uid,

    async getProfile() {
      const snap = await user.get()
      return snap.exists ? snap.data() : null
    },

    async getDoc(collection, docId) {
      const snap = await user.collection(collection).doc(docId).get()
      return snap.exists ? { id: snap.id, ...snap.data() } : null
    },

    async setDoc(collection, docId, data) {
      await user.collection(collection).doc(docId).set(data, { merge: true })
      return { id: docId, ...data }
    },

    async addDoc(collection, data) {
      const ref = await user.collection(collection).add(data)
      return { id: ref.id, ...data }
    },

    async query(collection, { orderField, direction = 'desc', limit } = {}) {
      let ref = user.collection(collection)
      if (orderField) ref = ref.orderBy(orderField, direction)
      if (limit) ref = ref.limit(limit)
      const snap = await ref.get()
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },

    /**
     * A top-level document keyed by this uid, outside the user subtree.
     *
     * Used for state the client must not be able to write — Firestore rules
     * are a permissive union, so a deny nested under the user's own recursive
     * wildcard would be overridden by it.
     */
    async getSystemDoc(collection) {
      const snap = await db.collection(collection).doc(uid).get()
      return snap.exists ? snap.data() : null
    },

    async setSystemDoc(collection, data) {
      await db.collection(collection).doc(uid).set(data, { merge: true })
      return data
    },

    newId: () => randomUUID(),
  }
}

/** Local-timezone YYYY-MM-DD. Must match how the app builds nutrition doc ids. */
export function localDateId(date = new Date(), offsetMinutes = 0) {
  const d = new Date(date.getTime() - offsetMinutes * 60000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}
