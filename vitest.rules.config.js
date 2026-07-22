import { defineConfig } from 'vitest/config'

/**
 * Firestore rules tests only. Kept separate from `npm test` because these need
 * the Firestore emulator running — `npm run test:rules` wraps them in
 * `firebase emulators:exec`, which starts and tears it down.
 *
 * The `.check.js` suffix keeps them out of the default vitest glob
 * (`*.test.js` / `*.spec.js`), so the main suite stays emulator-free.
 */
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.check.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
