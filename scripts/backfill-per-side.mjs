#!/usr/bin/env node
/**
 * ONE-OFF BACKFILL — restore the missing side on historical per-side sets.
 *
 * Until commit a0efaeb the session UI rendered one row per prescribed set for
 * every exercise, including the ones performed a limb at a time. A four-set
 * single-leg hip thrust is four sets per leg, so half the work had nowhere to
 * be recorded and the athlete picked which side to log.
 *
 * `countSets` now credits a per-side pair as one set, because the weekly
 * landmarks are per-side figures. That is right for sessions logged under the
 * new layout and wrong for everything before it: four old rows describing four
 * sets per leg now credit as two. This script doubles those rows so the stored
 * session says what was actually performed.
 *
 * WHAT IT DOES NOT DO — the sides are dropped, not mirrored.
 *
 * An old row carries one real side: the leg he chose to record. The other leg's
 * numbers were never captured. Writing a mirrored twin would claim a perfect
 * left/right match that nobody measured, and `leftRightBalance` reads exactly
 * that field to decide whether an imbalance exists. Leaving the original side
 * in place is no better — one tagged side against an empty other reads as a
 * total imbalance, which is how a week of single-leg work logged all-left would
 * currently be scored.
 *
 * So both rows go out untagged. `countSets` keys off the exercise definition
 * rather than the tag, so weekly volume comes out right, while
 * `leftRightBalance` skips untagged sets and simply has no opinion about weeks
 * it has no data for. The discarded sides are preserved in the backup file.
 *
 * `exerciseProgress` is left alone on purpose. The next session's suggestion
 * comes from the top set's weight, which duplicating rows does not change.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *
 *   # See the plan. Writes nothing.
 *   node scripts/backfill-per-side.mjs
 *
 *   # Apply it. Writes a backup next to the script first.
 *   node scripts/backfill-per-side.mjs --apply
 *
 * Options:
 *   --apply           perform the writes (default is a dry run)
 *   --uid <uid>       restrict to one user (default: every user found)
 *   --before <iso>    only sessions dated before this (default: CUTOFF below)
 *   --verbose         list every session, not just a summary
 *
 * CREDENTIALS — the Admin SDK needs one of:
 *   gcloud auth application-default login
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *
 * Re-running is safe: every touched document is marked, and marked documents
 * are skipped.
 */

import { createRequire } from 'node:module'
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STRENGTH_EXERCISES } from '../src/lib/strength/exercises.js'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

// firebase-admin lives with the Cloud Functions rather than at the repo root,
// which has no server-side dependencies. Resolved explicitly so this script
// needs no install of its own, and lazily so the transform below stays
// importable — and testable — without the SDK loading or credentials existing.
const loadAdmin = () => require(resolve(here, '../functions/node_modules/firebase-admin'))

/**
 * Sessions logged before the per-side layout shipped. Anything on or after this
 * was recorded with a row per side already and must not be touched.
 */
const CUTOFF = '2026-08-03T00:00:00.000Z'

const MARKER = 'perSideBackfill'
const VERSION = 1

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const valueOf = (flag) => {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1]
}

const APPLY = has('--apply')
const VERBOSE = has('--verbose')
const ONLY_UID = valueOf('--uid')
const CUTOFF_ISO = valueOf('--before') || CUTOFF

export const PER_SIDE_IDS = new Set(
  Object.values(STRENGTH_EXERCISES)
    .filter((e) => e.perSide)
    .map((e) => e.id)
)

const isWorkingSet = (s) => !!s?.completed

/**
 * The amended exercise list, or null when this session needs nothing.
 *
 * Only per-side exercises are touched, and only their completed sets are
 * doubled — an incomplete row was not performed twice either.
 */
export function amendExercises(exercises = []) {
  let changed = false
  const discardedSides = []

  const next = exercises.map((ex) => {
    if (!PER_SIDE_IDS.has(ex.id)) return ex

    const sets = ex.sets || []
    const doubled = []
    for (const set of sets) {
      if (!isWorkingSet(set)) {
        doubled.push(set)
        continue
      }
      if (set.side) discardedSides.push({ exerciseId: ex.id, side: set.side })
      const untagged = { ...set }
      delete untagged.side
      doubled.push(untagged, { ...untagged })
      changed = true
    }

    return { ...ex, sets: doubled }
  })

  return changed ? { exercises: next, discardedSides } : null
}

export function totalVolumeOf(exercises = []) {
  let total = 0
  for (const ex of exercises) {
    const multiplier = STRENGTH_EXERCISES[ex.id]?.weightMultiplier || 1
    for (const set of ex.sets || []) {
      if (!isWorkingSet(set)) continue
      total += (set.reps || 0) * (set.weight || 0) * multiplier
    }
  }
  return Math.round(total)
}

async function listUserIds(db) {
  if (ONLY_UID) return [ONLY_UID]
  const snap = await db.collection('users').get()
  return snap.docs.map((d) => d.id)
}

async function main() {
  if (PER_SIDE_IDS.size === 0) {
    console.error('No per-side exercises found in the catalogue — refusing to run.')
    process.exit(1)
  }

  // Taken from .firebaserc so the script targets the same project the app
  // deploys to, and so the only thing left to supply is credentials.
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    JSON.parse(readFileSync(resolve(here, '../.firebaserc'), 'utf8')).projects?.default

  if (!projectId) {
    console.error('No project id — set GOOGLE_CLOUD_PROJECT or add one to .firebaserc.')
    process.exit(1)
  }

  const admin = loadAdmin()
  admin.initializeApp({ projectId, credential: admin.credential.applicationDefault() })
  const db = admin.firestore()

  console.log(`Project: ${projectId}`)

  const uids = await listUserIds(db)
  if (uids.length === 0) {
    console.log('No users found.')
    return
  }

  const plan = []
  const backup = []

  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).collection('workoutSessions').get()

    for (const doc of snap.docs) {
      const data = doc.data()

      if (data[MARKER]) continue
      if (!data.date || data.date >= CUTOFF_ISO) continue

      const amended = amendExercises(data.exercises)
      if (!amended) continue

      const before = (data.exercises || []).reduce((n, ex) => n + (ex.sets?.length || 0), 0)
      const after = amended.exercises.reduce((n, ex) => n + (ex.sets?.length || 0), 0)
      const volumeAfter = totalVolumeOf(amended.exercises)

      plan.push({
        uid,
        id: doc.id,
        date: data.date,
        name: data.name || '(unnamed)',
        rowsBefore: before,
        rowsAfter: after,
        volumeBefore: data.totalVolume ?? 0,
        volumeAfter,
        perSide: amended.exercises
          .filter((ex) => PER_SIDE_IDS.has(ex.id))
          .map((ex) => ex.id),
        discardedSides: amended.discardedSides,
        _next: { exercises: amended.exercises, totalVolume: volumeAfter },
      })

      backup.push({ uid, id: doc.id, before: data })
    }
  }

  if (plan.length === 0) {
    console.log('Nothing to do — no unmarked pre-cutoff sessions contain per-side work.')
    return
  }

  console.log(`\nPer-side backfill — ${APPLY ? 'APPLYING' : 'DRY RUN'}`)
  console.log(`Cutoff: sessions dated before ${CUTOFF_ISO}`)
  console.log(`Per-side exercises: ${[...PER_SIDE_IDS].join(', ')}\n`)

  const rowsAdded = plan.reduce((n, p) => n + (p.rowsAfter - p.rowsBefore), 0)
  const sidesDropped = plan.reduce((n, p) => n + p.discardedSides.length, 0)

  if (VERBOSE) {
    for (const p of plan) {
      console.log(
        `  ${p.date.slice(0, 10)}  ${p.name.padEnd(24)} ` +
          `rows ${p.rowsBefore}→${p.rowsAfter}  ` +
          `volume ${p.volumeBefore.toLocaleString()}→${p.volumeAfter.toLocaleString()} lbs  ` +
          `[${p.perSide.join(', ')}]`
      )
    }
    console.log('')
  }

  console.log(`Sessions to amend : ${plan.length}`)
  console.log(`Set rows added    : ${rowsAdded}`)
  console.log(`Side tags dropped : ${sidesDropped} (kept in the backup)`)

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to perform it.')
    return
  }

  const backupPath = resolve(here, `per-side-backfill-backup-${Date.now()}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\nBackup written to ${backupPath}`)

  // Batched, and chunked well under Firestore's 500-op limit.
  const CHUNK = 200
  let written = 0
  for (let i = 0; i < plan.length; i += CHUNK) {
    const batch = db.batch()
    for (const p of plan.slice(i, i + CHUNK)) {
      const ref = db.collection('users').doc(p.uid).collection('workoutSessions').doc(p.id)
      batch.update(ref, {
        exercises: p._next.exercises,
        totalVolume: p._next.totalVolume,
        [MARKER]: { at: new Date().toISOString(), version: VERSION },
      })
    }
    await batch.commit()
    written += Math.min(CHUNK, plan.length - i)
    console.log(`  committed ${written}/${plan.length}`)
  }

  console.log('\nDone.')
}

// Only when run as a script — the transform above is imported by its tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (err) {
    console.error('\nBackfill failed:', err?.message || err)
    process.exit(1)
  }
}
