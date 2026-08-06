import { describe, it, expect, vi } from 'vitest'
import { shouldReload, watchForUpdates } from '../swUpdate'

/** Minimal stand-ins for the two browser objects the module touches. */
function fakeEnv({ controller = {} } = {}) {
  const listeners = {}
  const on = (target) => (type, fn) => ((listeners[target + type] ||= []).push(fn))
  const off = (target) => (type, fn) => {
    listeners[target + type] = (listeners[target + type] || []).filter((f) => f !== fn)
  }
  const fire = (target, type) => (listeners[target + type] || []).forEach((fn) => fn())

  const update = vi.fn().mockResolvedValue(undefined)
  const navigatorRef = {
    serviceWorker: {
      controller,
      ready: Promise.resolve({ update }),
      addEventListener: on('sw'),
      removeEventListener: off('sw'),
    },
  }
  const documentRef = {
    visibilityState: 'visible',
    addEventListener: on('doc'),
    removeEventListener: off('doc'),
  }
  return { navigatorRef, documentRef, update, fire, listeners }
}

describe('shouldReload', () => {
  it('reloads when a new worker replaces an existing one', () => {
    expect(shouldReload({ hadController: true, alreadyReloading: false })).toBe(true)
  })

  it('does not reload on first install', () => {
    // The event fires as the very first worker claims an uncontrolled page.
    // Reloading there is a pointless flash on someone's first visit.
    expect(shouldReload({ hadController: false, alreadyReloading: false })).toBe(false)
  })

  it('does not reload twice', () => {
    // reload() itself provokes a controller change on the way back up; an
    // unguarded handler is a refresh loop, on a phone, in a gym.
    expect(shouldReload({ hadController: true, alreadyReloading: true })).toBe(false)
  })
})

describe('watchForUpdates', () => {
  it('reloads once when a new worker takes control', () => {
    const env = fakeEnv()
    const reload = vi.fn()
    watchForUpdates({ ...env, reload, interval: 1e9 })

    env.fire('sw', 'controllerchange')
    env.fire('sw', 'controllerchange')

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stays put on the first worker this browser has ever had', () => {
    const env = fakeEnv({ controller: null })
    const reload = vi.fn()
    watchForUpdates({ ...env, reload, interval: 1e9 })

    env.fire('sw', 'controllerchange')
    expect(reload).not.toHaveBeenCalled()
  })

  it('asks for an update on start and whenever the app is brought forward', async () => {
    // The half that makes this work on a phone: a resumed PWA never navigates,
    // so without a visibility check it never asks whether a build exists.
    const env = fakeEnv()
    watchForUpdates({ ...env, reload: vi.fn(), interval: 1e9 })
    await Promise.resolve()
    expect(env.update).toHaveBeenCalledTimes(1)

    env.fire('doc', 'visibilitychange')
    await Promise.resolve()
    expect(env.update).toHaveBeenCalledTimes(2)
  })

  it('does not ask while the app is in the background', async () => {
    const env = fakeEnv()
    env.documentRef.visibilityState = 'hidden'
    watchForUpdates({ ...env, reload: vi.fn(), interval: 1e9 })
    await Promise.resolve()
    expect(env.update).not.toHaveBeenCalled()
  })

  it('no-ops where there is no service worker', () => {
    expect(() => watchForUpdates({ navigatorRef: {}, documentRef: null })).not.toThrow()
  })

  it('detaches everything it attached', () => {
    const env = fakeEnv()
    const reload = vi.fn()
    const stop = watchForUpdates({ ...env, reload, interval: 1e9 })

    stop()
    env.fire('sw', 'controllerchange')
    expect(reload).not.toHaveBeenCalled()
  })
})
