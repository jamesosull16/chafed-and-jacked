/**
 * Firestore access for the MCP server.
 *
 * Authenticates with a service account, so it bypasses the client-side security
 * rules that normally scope reads to the signed-in user. Every path here is
 * therefore pinned explicitly to the configured uid — there is no code path
 * that takes a uid from tool input.
 */

import { readFileSync } from 'node:fs'
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let db = null
let uid = null

export function initFirestore({ serviceAccountPath, projectId, userId }) {
  if (!userId) {
    throw new Error('CJ_USER_ID is required — the MCP server needs to know whose data to read.')
  }
  uid = userId

  if (getApps().length === 0) {
    initializeApp({
      credential: serviceAccountPath
        ? cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8')))
        : applicationDefault(),
      ...(projectId && { projectId }),
    })
  }
  db = getFirestore()
  return db
}

function requireDb() {
  if (!db) throw new Error('Firestore has not been initialised.')
  return db
}

/** users/{uid} */
export async function getProfile() {
  const snap = await requireDb().collection('users').doc(uid).get()
  return snap.exists ? snap.data() : null
}

/** users/{uid}/{collection}/{docId} */
export async function getDoc(collection, docId) {
  const snap = await requireDb().collection('users').doc(uid).collection(collection).doc(docId).get()
  return snap.exists ? { id: snap.id, ...snap.data() } : null
}

export async function setDoc(collection, docId, data) {
  await requireDb()
    .collection('users')
    .doc(uid)
    .collection(collection)
    .doc(docId)
    .set(data, { merge: true })
  return { id: docId, ...data }
}

export async function queryCollection(collection, { orderField, direction = 'desc', limit } = {}) {
  let ref = requireDb().collection('users').doc(uid).collection(collection)
  if (orderField) ref = ref.orderBy(orderField, direction)
  if (limit) ref = ref.limit(limit)
  const snap = await ref.get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Local-timezone YYYY-MM-DD, matching how the app builds nutrition doc ids. */
export function localDateId(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}
