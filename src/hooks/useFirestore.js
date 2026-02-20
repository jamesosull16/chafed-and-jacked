import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Hook for Firestore operations scoped to the current user.
 * All paths are relative to users/{userId}/.
 */
export function useFirestore() {
  const { user } = useAuth()

  const userRef = useCallback(
    (path) => {
      if (!user) return null
      return path ? doc(db, 'users', user.uid, ...path.split('/')) : doc(db, 'users', user.uid)
    },
    [user]
  )

  const userCollection = useCallback(
    (collectionName) => {
      if (!user) return null
      return collection(db, 'users', user.uid, collectionName)
    },
    [user]
  )

  /** Get a single document from a user subcollection */
  const getDocument = useCallback(
    async (path) => {
      const ref = userRef(path)
      if (!ref) return null
      const snap = await getDoc(ref)
      return snap.exists() ? { id: snap.id, ...snap.data() } : null
    },
    [userRef]
  )

  /** Get all documents from a user subcollection, optionally ordered */
  const getCollection = useCallback(
    async (collectionName, orderField, orderDir = 'desc', limitCount) => {
      const colRef = userCollection(collectionName)
      if (!colRef) return []
      let q = query(colRef)
      if (orderField) q = query(q, orderBy(orderField, orderDir))
      if (limitCount) q = query(q, limit(limitCount))
      const snap = await getDocs(q)
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    [userCollection]
  )

  /** Set a document (create or overwrite) */
  const setDocument = useCallback(
    async (path, data) => {
      const ref = userRef(path)
      if (!ref) return
      await setDoc(ref, data, { merge: true })
    },
    [userRef]
  )

  /** Add a new document with auto-generated ID */
  const addDocument = useCallback(
    async (collectionName, data) => {
      const colRef = userCollection(collectionName)
      if (!colRef) return null
      const docRef = await addDoc(colRef, data)
      return docRef.id
    },
    [userCollection]
  )

  /** Update specific fields on an existing document */
  const updateDocument = useCallback(
    async (path, data) => {
      const ref = userRef(path)
      if (!ref) return
      await updateDoc(ref, data)
    },
    [userRef]
  )

  return { getDocument, getCollection, setDocument, addDocument, updateDocument, userRef, userCollection }
}

/**
 * Hook for real-time Firestore subscription to a user subcollection.
 */
export function useRealtimeCollection(collectionName, orderField, orderDir = 'desc', limitCount) {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setData([])
      setLoading(false)
      return
    }

    const colRef = collection(db, 'users', user.uid, collectionName)
    let q = query(colRef)
    if (orderField) q = query(q, orderBy(orderField, orderDir))
    if (limitCount) q = query(q, limit(limitCount))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })

    return unsubscribe
  }, [user, collectionName, orderField, orderDir, limitCount])

  return { data, loading }
}

/**
 * Get the week ID string (YYYY-WNN) for consistent document IDs.
 */
export function getWeekId(date = new Date()) {
  const d = new Date(date)
  // ISO week: Monday is first day
  const dayNum = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dayNum)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Get Monday of the current week.
 */
export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}
