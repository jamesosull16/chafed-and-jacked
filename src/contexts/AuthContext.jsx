import { createContext, useContext, useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore'
import { auth, googleProvider, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Listen to auth state changes and load profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser)
        if (firebaseUser) {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data())
          } else {
            setUserProfile(null)
          }
        } else {
          setUserProfile(null)
        }
      } catch (err) {
        console.error('Failed to load user profile:', err)
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider)
    await ensureUserDoc(result.user)
    return result.user
  }

  async function loginWithEmail(email, password) {
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result.user
  }

  async function signUpWithEmail(email, password, displayName) {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName })
    await ensureUserDoc(result.user)
    return result.user
  }

  async function logout() {
    await signOut(auth)
    setUserProfile(null)
  }

  // Create user doc in Firestore if it doesn't exist
  async function ensureUserDoc(firebaseUser) {
    const userRef = doc(db, 'users', firebaseUser.uid)
    const snap = await getDoc(userRef)
    if (!snap.exists()) {
      const newProfile = {
        displayName: firebaseUser.displayName || '',
        email: firebaseUser.email,
        createdAt: new Date().toISOString(),
        preferences: { viewMode: 'list', restTimerEnabled: true },
        onboarding: { completed: false },
      }
      await setDoc(userRef, newProfile)
      setUserProfile(newProfile)
    } else {
      setUserProfile(snap.data())
    }
  }

  // Update onboarding data and mark complete
  async function completeOnboarding(data) {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    const { profile, races, goals, ...onboardingData } = data
    const updated = {
      ...userProfile,
      onboarding: { completed: true, ...onboardingData },
      ...(profile && { profile }),
      ...(races && { races }),
      ...(goals && { goals }),
    }
    await setDoc(userRef, updated, { merge: true })
    setUserProfile(updated)

    // Save initial body metrics as the first bodyMetrics entry
    if (onboardingData.initialWeight) {
      const bodyFatPct = onboardingData.initialBodyFat || 0
      const weight = onboardingData.initialWeight
      const fatMass = bodyFatPct > 0 ? Math.round(weight * (bodyFatPct / 100) * 10) / 10 : 0
      const leanMass = bodyFatPct > 0 ? Math.round((weight - fatMass) * 10) / 10 : 0
      const metricsRef = collection(db, 'users', user.uid, 'bodyMetrics')
      await addDoc(metricsRef, {
        date: new Date().toISOString(),
        weight,
        bodyFatPct,
        bmi: onboardingData.initialBMI || 0,
        fatMass,
        leanMass,
      })
    }
  }

  // Update profile fields (for Settings page edits)
  async function updateUserProfile(data) {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    const updated = { ...userProfile, ...data }
    await setDoc(userRef, updated, { merge: true })
    setUserProfile(updated)
  }

  // Refresh profile from Firestore
  async function refreshProfile() {
    if (!user) return
    const snap = await getDoc(doc(db, 'users', user.uid))
    if (snap.exists()) setUserProfile(snap.data())
  }

  const value = {
    user,
    userProfile,
    loading,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout,
    completeOnboarding,
    updateUserProfile,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
