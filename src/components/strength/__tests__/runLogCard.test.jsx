// @vitest-environment jsdom

/**
 * The strength block had no way to log a run at all — the only route was
 * telling the coach in chat, which wrote to `dailyMileage` where no screen in
 * strength mode ever read it. This card is that route.
 *
 * Same constraints as sheetLifecycle.test.jsx: no session, no network, so what
 * is covered is mounting and the prop transitions the app actually performs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import RunLogCard from '../RunLogCard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(props = {}) {
  act(() => {
    root.render(<RunLogCard onAddRun={vi.fn()} today="2026-09-04" {...props} />)
  })
}

function byText(text) {
  return [...container.querySelectorAll('button, p, span, li')].find((el) =>
    el.textContent.includes(text)
  )
}

function inputs() {
  return [...container.querySelectorAll('input')]
}

function type(input, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RunLogCard', () => {
  it('says plainly that nothing is logged rather than showing an empty list', () => {
    render({ todayRuns: [] })
    expect(container.textContent).toMatch(/No run logged today/)
    expect(byText('Log a run')).toBeTruthy()
  })

  it('lists today\'s runs and offers to add another', () => {
    render({ todayRuns: [{ miles: 6.2, duration_minutes: 52, avg_hr_bpm: 148, enteredAt: 'a' }] })
    expect(container.textContent).toMatch(/6\.2 mi/)
    expect(container.textContent).toMatch(/52 min/)
    expect(container.textContent).toMatch(/148 bpm/)
    expect(byText('Log another run')).toBeTruthy()
  })

  it('marks a run that will fall back to the distance estimate', () => {
    // Without duration AND heart rate the calorie figure comes from distance
    // alone, which runs ~25% under Keytel on a long effort. The day's whole
    // target moves with it, so the card has to say which one it got.
    render({ todayRuns: [{ miles: 8, enteredAt: 'a' }] })
    expect(container.textContent).toMatch(/distance estimate/)

    render({ todayRuns: [{ miles: 8, duration_minutes: 70, avg_hr_bpm: 150, enteredAt: 'a' }] })
    expect(container.textContent).not.toMatch(/distance estimate/)
  })

  it('will not submit without a distance', () => {
    render({ todayRuns: [] })
    act(() => byText('Log a run').click())
    const submit = byText('Log run')
    expect(submit.disabled).toBe(true)
  })

  it('passes duration and HR through as options, omitting the blanks', async () => {
    const onAddRun = vi.fn().mockResolvedValue(undefined)
    render({ todayRuns: [], onAddRun })
    act(() => byText('Log a run').click())

    const [miles, duration] = inputs()
    type(miles, '6.2')
    type(duration, '52')

    await act(async () => byText('Log run').click())

    // Null date means "today" to the hook; an empty HR box must not become 0.
    expect(onAddRun).toHaveBeenCalledWith(6.2, null, { duration_minutes: 52 })
  })

  it('clears the form after a save so the next run starts empty', async () => {
    const onAddRun = vi.fn().mockResolvedValue(undefined)
    render({ todayRuns: [], onAddRun })
    act(() => byText('Log a run').click())
    type(inputs()[0], '4')
    await act(async () => byText('Log run').click())

    expect(inputs()).toHaveLength(0)
    expect(byText('Log a run')).toBeTruthy()
  })

  it('shows weekly volume in both units once there is any', () => {
    render({ todayRuns: [], weekDailySum: 18.4, weekDailyMinutes: 162 })
    expect(container.textContent).toMatch(/18\.4 mi this week/)
    expect(container.textContent).toMatch(/162 min/)
  })

  it('hides the weekly badge entirely at zero rather than showing 0 mi', () => {
    render({ todayRuns: [], weekDailySum: 0 })
    expect(container.textContent).not.toMatch(/this week/)
  })
})
