/**
 * FIRESTORE RULES — executable specification.
 *
 * These run against the Firestore emulator with the real `firestore.rules`
 * loaded, so they test the deployed artifact rather than a description of it.
 * Run with `npm run test:rules` (wraps the emulator); they are deliberately
 * excluded from `npm test`, which must stay runnable with no emulator.
 *
 * The case that matters most is `coachUsage`. The coach rate limiter is the
 * only thing standing between a stolen session and an unbounded bill on a paid
 * model API, and its counter is only safe if the client cannot write it. That
 * is asserted here rather than assumed from where the collection sits.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from 'firebase/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const ALICE = 'alice-uid'
const BOB = 'bob-uid'

/** Every per-user collection the app actually reads or writes. */
const USER_COLLECTIONS = [
  'nutritionLogs',
  'coachChat',
  'bodyMetrics',
  'workoutSessions',
  'exerciseProgress',
  'mileageLogs',
  'dailyMileage',
]

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'chafed-and-jacked-rules',
    firestore: {
      rules: readFileSync(join(HERE, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // Seed through the back door so the rules under test don't gate the fixtures.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ALICE), { mode: 'strength' })
    await setDoc(doc(db, 'users', BOB), { mode: 'strength' })
    await setDoc(doc(db, 'coachUsage', ALICE), { windowStart: Date.now(), count: 59 })
    await setDoc(doc(db, 'coachMemory', ALICE), { facts: ['Doesn\'t tolerate whey'] })
    await setDoc(doc(db, 'program', 'block-a'), { name: 'Hypertrophy A' })
    for (const c of USER_COLLECTIONS) {
      await setDoc(doc(db, 'users', ALICE, c, 'seed'), { v: 1 })
      await setDoc(doc(db, 'users', BOB, c, 'seed'), { v: 1 })
    }
  })
})

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore()
const asBob = () => testEnv.authenticatedContext(BOB).firestore()
const asAnon = () => testEnv.unauthenticatedContext().firestore()

describe('users/{uid} — own profile', () => {
  it('lets the owner read and write their profile', async () => {
    const db = asAlice()
    await assertSucceeds(getDoc(doc(db, 'users', ALICE)))
    await assertSucceeds(setDoc(doc(db, 'users', ALICE), { mode: 'running' }, { merge: true }))
  })

  it('refuses another signed-in user', async () => {
    const db = asBob()
    await assertFails(getDoc(doc(db, 'users', ALICE)))
    await assertFails(setDoc(doc(db, 'users', ALICE), { mode: 'running' }, { merge: true }))
    await assertFails(deleteDoc(doc(db, 'users', ALICE)))
  })

  it('refuses an unauthenticated caller', async () => {
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'users', ALICE)))
    await assertFails(setDoc(doc(db, 'users', ALICE), { mode: 'running' }, { merge: true }))
  })

  it('refuses an unconstrained listing of every user', async () => {
    await assertFails(getDocs(collection(asAlice(), 'users')))
  })
})

describe('users/{uid}/** — the recursive wildcard', () => {
  it('covers every per-user collection for the owner', async () => {
    const db = asAlice()
    for (const c of USER_COLLECTIONS) {
      await assertSucceeds(getDoc(doc(db, 'users', ALICE, c, 'seed')))
      await assertSucceeds(setDoc(doc(db, 'users', ALICE, c, '2026-07-22'), { v: 2 }))
      await assertSucceeds(getDocs(collection(db, 'users', ALICE, c)))
      await assertSucceeds(addDoc(collection(db, 'users', ALICE, c), { v: 3 }))
    }
  })

  it('covers a collection that does not exist yet, so a new feature needs no rules change', async () => {
    const db = asAlice()
    await assertSucceeds(setDoc(doc(db, 'users', ALICE, 'somethingNewNextMonth', 'x'), { v: 1 }))
  })

  it('walls off every one of them from another user', async () => {
    const db = asBob()
    for (const c of USER_COLLECTIONS) {
      await assertFails(getDoc(doc(db, 'users', ALICE, c, 'seed')))
      await assertFails(setDoc(doc(db, 'users', ALICE, c, 'x'), { v: 9 }))
      await assertFails(getDocs(collection(db, 'users', ALICE, c)))
      await assertFails(deleteDoc(doc(db, 'users', ALICE, c, 'seed')))
    }
  })

  it('walls off every one of them from an anonymous caller', async () => {
    const db = asAnon()
    for (const c of USER_COLLECTIONS) {
      await assertFails(getDoc(doc(db, 'users', ALICE, c, 'seed')))
      await assertFails(setDoc(doc(db, 'users', ALICE, c, 'x'), { v: 9 }))
    }
  })

  it('lets each user reach their own copy of the same collection', async () => {
    await assertSucceeds(getDoc(doc(asBob(), 'users', BOB, 'nutritionLogs', 'seed')))
  })
})

describe('coachUsage/{uid} — the rate-limit counter', () => {
  it('lets the owner read their own remaining budget', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'coachUsage', ALICE)))
  })

  // The whole point of the collection sitting outside the user subtree.
  it('refuses the owner writing it — no resetting your own limit', async () => {
    const db = asAlice()
    await assertFails(setDoc(doc(db, 'coachUsage', ALICE), { windowStart: Date.now(), count: 0 }))
    await assertFails(updateDoc(doc(db, 'coachUsage', ALICE), { count: 0 }))
    await assertFails(deleteDoc(doc(db, 'coachUsage', ALICE)))
  })

  it('refuses another user reading or writing it', async () => {
    const db = asBob()
    await assertFails(getDoc(doc(db, 'coachUsage', ALICE)))
    await assertFails(setDoc(doc(db, 'coachUsage', ALICE), { count: 0 }))
  })

  it('refuses an anonymous caller entirely', async () => {
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'coachUsage', ALICE)))
    await assertFails(setDoc(doc(db, 'coachUsage', ALICE), { count: 0 }))
  })

  it('refuses creating a counter that does not exist yet', async () => {
    await assertFails(setDoc(doc(asBob(), 'coachUsage', BOB), { windowStart: Date.now(), count: 0 }))
  })
})

describe('coachMemory/{uid} — what the coach remembers', () => {
  it('lets the owner read what is remembered about him', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'coachMemory', ALICE)))
  })

  // This text is injected into the model's system context on every turn.
  // A writable memory is a client that can put words in its own coach's mouth.
  it('refuses the owner writing it — no planting facts about yourself', async () => {
    const db = asAlice()
    await assertFails(setDoc(doc(db, 'coachMemory', ALICE), { facts: ['Cleared to run'] }))
    await assertFails(updateDoc(doc(db, 'coachMemory', ALICE), { facts: [] }))
    await assertFails(deleteDoc(doc(db, 'coachMemory', ALICE)))
  })

  it('refuses another user reading or writing it', async () => {
    const db = asBob()
    await assertFails(getDoc(doc(db, 'coachMemory', ALICE)))
    await assertFails(setDoc(doc(db, 'coachMemory', ALICE), { facts: [] }))
  })

  it('refuses an anonymous caller entirely', async () => {
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'coachMemory', ALICE)))
    await assertFails(setDoc(doc(db, 'coachMemory', ALICE), { facts: [] }))
  })
})

describe('program/{docId} — shared reference data', () => {
  it('is readable by any signed-in user', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'program', 'block-a')))
  })

  it('is not readable anonymously', async () => {
    await assertFails(getDoc(doc(asAnon(), 'program', 'block-a')))
  })

  it('is not writable by anyone', async () => {
    await assertFails(setDoc(doc(asAlice(), 'program', 'block-a'), { name: 'tampered' }))
    await assertFails(setDoc(doc(asAlice(), 'program', 'new'), { name: 'injected' }))
  })
})

describe('anything not explicitly matched', () => {
  it('is denied by default, even to a signed-in user', async () => {
    const db = asAlice()
    await assertFails(getDoc(doc(db, 'someFutureCollection', 'x')))
    await assertFails(setDoc(doc(db, 'someFutureCollection', 'x'), { v: 1 }))
    await assertFails(setDoc(doc(db, 'coachUsageBackup', ALICE), { count: 0 }))
  })
})
