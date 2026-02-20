import { useState, useEffect } from 'react'

/**
 * Push notification permission scaffold.
 * Requests notification permission once and stores the decision.
 * Actual push delivery would require Firebase Cloud Messaging setup (future).
 */
export default function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [permission, setPermission] = useState(null)

  useEffect(() => {
    // Only show if browser supports notifications and user hasn't been asked
    if (!('Notification' in window)) return
    const existing = Notification.permission
    setPermission(existing)
    if (existing === 'default') {
      // Show prompt after a short delay (don't ask immediately on load)
      const dismissed = localStorage.getItem('cj_notif_dismissed')
      if (!dismissed) {
        const timer = setTimeout(() => setShow(true), 5000)
        return () => clearTimeout(timer)
      }
    }
  }, [])

  async function handleEnable() {
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        // Future: register with Firebase Cloud Messaging here
        // const messaging = getMessaging(app)
        // const token = await getToken(messaging, { vapidKey: '...' })
        // Save token to user's Firestore profile for server-side push
      }
    } catch {
      // Permission request failed
    }
    setShow(false)
  }

  function handleDismiss() {
    localStorage.setItem('cj_notif_dismissed', 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="bg-surface border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-200">Enable Notifications?</p>
          <p className="text-xs text-gray-500 mt-1">
            Get reminders for training days and weekly weigh-ins.
          </p>
        </div>
        <button onClick={handleDismiss} className="text-gray-600 text-xs hover:text-gray-400">✕</button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleEnable}
          className="flex-1 bg-brand hover:bg-brand-light text-white text-xs font-medium py-2 rounded-lg transition-colors"
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 border border-gray-700 text-gray-400 text-xs py-2 rounded-lg hover:bg-gray-900 transition-colors"
        >
          Not Now
        </button>
      </div>
    </div>
  )
}
