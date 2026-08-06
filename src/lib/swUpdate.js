/**
 * SERVICE WORKER UPDATES — Chafed & Jacked
 *
 * Getting a new build onto the phone.
 *
 * The pieces were nearly all already there and the chain ended one link short.
 * `sw.js` and `index.html` are served no-cache, so the browser always sees a
 * fresh shell; the worker is built with `skipWaiting` and `clientsClaim`, so a
 * new one activates and takes over immediately rather than waiting for every
 * tab to close. What nothing did was *notice*. The new worker claimed a page
 * that had already rendered the old bundle, and there it stayed.
 *
 * On a desktop that is invisible: reloading is reflexive, and the next
 * navigation picks the new build up. An installed PWA is resumed from the app
 * switcher rather than navigated to — no load event, no update check, no
 * reload — so it can serve a build from days ago while the laptop is current.
 * Which is exactly what it did.
 *
 * Two halves, and both are needed:
 *
 *   ask    — `registration.update()` whenever the app comes back to the
 *            foreground, plus a slow interval for a session left open. Without
 *            this a resumed PWA never checks at all.
 *   react  — reload when a new worker takes control, because the running page
 *            is still the old JS.
 *
 * Timing is what keeps the reload from being hostile. Checks happen when the
 * app becomes visible — the athlete has just opened it and is not mid-set — so
 * the refresh lands at the moment it costs least. An in-progress session is
 * drafted to localStorage and restores on the other side regardless.
 */

/** An hour. Long: the check costs a request, and a stale tab is not urgent. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Whether a `controllerchange` should reload the page.
 *
 * Two cases where it must not. First install has no controller to replace —
 * the event fires as the very first worker claims an uncontrolled page, and
 * reloading there is a pointless flash on a first visit. And `reload()` itself
 * triggers a controller change on the way back up, so an unguarded handler is
 * a refresh loop.
 *
 * Pure, and exported, because a refresh loop is not something to find out
 * about from a phone.
 */
export function shouldReload({ hadController, alreadyReloading }) {
  return !!hadController && !alreadyReloading
}

/**
 * Wire the update loop. Safe to call anywhere — it no-ops without a service
 * worker, which covers the dev server and any browser that lacks one.
 *
 * @param deps injectable for tests; defaults to the real globals
 */
export function watchForUpdates({
  navigatorRef = typeof navigator === 'undefined' ? null : navigator,
  documentRef = typeof document === 'undefined' ? null : document,
  reload = () => window.location.reload(),
  interval = CHECK_INTERVAL_MS,
} = {}) {
  const container = navigatorRef?.serviceWorker
  if (!container) return () => {}

  const hadController = !!container.controller
  let alreadyReloading = false

  const onControllerChange = () => {
    if (!shouldReload({ hadController, alreadyReloading })) return
    alreadyReloading = true
    reload()
  }
  container.addEventListener('controllerchange', onControllerChange)

  let timer = null
  const onVisible = () => {
    if (documentRef?.visibilityState !== 'visible') return
    // Failures are silent on purpose: offline is the common one, and a coach
    // app that reports its own update checks is noise.
    container.ready?.then((registration) => registration.update?.()).catch(() => {})
  }

  documentRef?.addEventListener('visibilitychange', onVisible)
  timer = setInterval(onVisible, interval)
  onVisible()

  return () => {
    container.removeEventListener('controllerchange', onControllerChange)
    documentRef?.removeEventListener('visibilitychange', onVisible)
    if (timer) clearInterval(timer)
  }
}
