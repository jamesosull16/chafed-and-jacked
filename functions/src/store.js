/**
 * Firestore accessor bound to exactly one uid.
 *
 * Every path is built from the uid captured at construction. No method takes a
 * uid, so nothing downstream — including a tool the model chose to call, with
 * arguments derived from user text — can reach another user's data.
 */

import { readFileSync } from 'node:fs'
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'

/**
 * Initialise the default app, if nothing has yet.
 *
 * Lives here rather than in the caller because `firebase-admin` keeps its app
 * registry per module instance, and this repo has two copies of the package —
 * one under `functions/`, one under `mcp/`. A caller that initialises through
 * its own copy registers an app `createStore` cannot see, and the failure is a
 * baffling "the default Firebase app does not exist" from a process that
 * plainly just created one. Initialising from the same module that reads it
 * makes that impossible.
 *
 * A no-op inside Cloud Functions, where the runtime has already done it.
 */
export function ensureApp({ serviceAccountPath = null, projectId = null } = {}) {
  if (getApps().length > 0) return
  initializeApp({
    credential: serviceAccountPath
      ? cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8')))
      : applicationDefault(),
    ...(projectId && { projectId }),
  })
}

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

    /** Merge into users/{uid}. Merged, never replaced — the document carries
     *  auth-adjacent fields that no caller here has any business clearing. */
    async setProfile(data) {
      await user.set(data, { merge: true })
      return data
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

    /**
     * Remove a document outright.
     *
     * Firestore's delete is idempotent and reports nothing about whether the
     * document existed, so callers that need to tell "deleted" from "was never
     * there" must read first. Every caller here does.
     */
    async deleteDoc(collection, docId) {
      await user.collection(collection).doc(docId).delete()
      return { id: docId, deleted: true }
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
