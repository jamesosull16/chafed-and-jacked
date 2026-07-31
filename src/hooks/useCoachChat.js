import { useState, useEffect, useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, functions } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

const HISTORY_LIMIT = 60

/**
 * Coach conversation state.
 *
 * The thread lives in Firestore so it persists across devices, and is
 * subscribed to rather than fetched so a message logged from the MCP server
 * shows up here too. The optimistic pending message is held in local state and
 * disappears once the real document arrives.
 */
export function useCoachChat({ buildContext }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  // Kept in a ref so `send` doesn't need to be rebuilt on every context change,
  // which would remount the composer's handlers mid-typing.
  const buildContextRef = useRef(buildContext)
  useEffect(() => {
    buildContextRef.current = buildContext
  }, [buildContext])

  useEffect(() => {
    if (!user) {
      setMessages([])
      setLoading(false)
      return
    }

    const ref = collection(db, 'users', user.uid, 'coachChat')
    const q = query(ref, orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT))

    return onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .reverse()
          .filter((m) => m.createdAt)
        setMessages(docs)
        setLoading(false)
      },
      (err) => {
        console.error('Coach thread subscription failed:', err)
        setLoading(false)
      }
    )
  }, [user])

  const write = useCallback(
    async (message) => {
      if (!user) return
      await addDoc(collection(db, 'users', user.uid, 'coachChat'), {
        ...message,
        createdAt: serverTimestamp(),
      })
    },
    [user]
  )

  /**
   * Send a turn. The user message is written first so it survives a failure
   * mid-turn; only the coach's reply depends on the call succeeding.
   */
  const send = useCallback(
    async ({ text, photo }) => {
      if (!user || sending) return
      if (!text?.trim() && !photo) return

      setError(null)
      setSending(true)
      setPending({ role: 'user', content: text || '', photoPreview: photo?.previewUrl || null })

      try {
        await write({
          role: 'user',
          content: text || '',
          // The thumbnail, never the full image — a chat document has to stay
          // under Firestore's 1MB cap.
          ...(photo?.thumbnailUrl && { photoPreview: photo.thumbnailUrl }),
        })

        const callable = httpsCallable(functions, 'coachTurn', { timeout: 180_000 })
        // History is no longer sent. The server reads the thread itself — it is
        // the record of what the coach has already said, and it carries the
        // cards, which this hook was stripping before they ever left the device.
        const { data } = await callable({
          message: text || '',
          photo: photo ? { base64: photo.base64, mediaType: photo.mediaType } : null,
          context: buildContextRef.current?.() || {},
          timezoneOffset: new Date().getTimezoneOffset(),
        })

        await write({
          role: 'assistant',
          content: data.reply,
          ...(data.cards?.length && { cards: data.cards }),
        })

        return data
      } catch (err) {
        const message = err?.message || 'Could not reach your coach.'
        setError(message)
        await write({ role: 'assistant', content: message, isError: true }).catch(() => {})
      } finally {
        setPending(null)
        setSending(false)
      }
    },
    // `messages` is no longer a dependency — dropping it means typing a second
    // message doesn't rebuild `send` on every snapshot the thread receives.
    [user, sending, write]
  )

  return { messages, pending, loading, sending, error, send, clearError: () => setError(null) }
}

export default useCoachChat
