// @vitest-environment jsdom

/**
 * Mount tests for the cards added with training load and log coverage.
 *
 * Written because everything here was about to ship having never been
 * rendered, which is precisely how this repo has shipped broken before: a
 * saved meal that white-screened the page it was saved from, set-row widths
 * that never applied across three deploys, an "Edit portions" button wired to
 * a handler no caller passed. Green unit tests on the pure modules underneath
 * say nothing about whether the component reading them survives its own empty
 * state.
 *
 * The first case in each block is the state James will actually see on the
 * first load — no sRPE rated yet, coverage with real gaps in it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import TrainingLoadCard from '../TrainingLoadCard'
import WeightTrendCard from '../WeightTrendCard'
import SessionRpe from '../../workout/SessionRpe'
import { trainingLoadSummary } from '../../../lib/trainingLoad'
import { assessLogCoverage } from '../../../lib/logCompleteness'
import { BODY_COMP_GOALS } from '../../../lib/appMode'

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

const render = (ui) => {
  act(() => root.render(<MemoryRouter>{ui}</MemoryRouter>))
}

const lift = (daysAgo, sRPE) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { date: d.toISOString(), duration: 85, sRPE, completed: true }
}

describe('TrainingLoadCard', () => {
  it('renders the state it will actually be in on day one', () => {
    // Four sessions this week, none rated — the live shape, verified against
    // production data. This is the render most likely to be hit and the one
    // most likely to divide by zero or read off null.
    const load = trainingLoadSummary({
      sessions: [lift(1, null), lift(2, null), lift(4, null), lift(5, null)],
      runs: [],
    })
    render(<TrainingLoadCard load={load} />)
    expect(container.textContent).toMatch(/none rated yet/)
    expect(container.textContent).toMatch(/0\/4 rated/)
  })

  it('renders nothing rather than an empty shell when there is no training at all', () => {
    render(<TrainingLoadCard load={trainingLoadSummary({ sessions: [], runs: [] })} />)
    expect(container.textContent).toBe('')
  })

  it('survives a null load prop', () => {
    render(<TrainingLoadCard load={null} />)
    expect(container.textContent).toBe('')
  })

  it('shows the totals and the coverage caveat once some sessions are rated', () => {
    const load = trainingLoadSummary({
      sessions: [lift(1, 7), lift(2, 8), lift(4, null)],
      runs: [],
    })
    render(<TrainingLoadCard load={load} />)
    expect(container.textContent).toMatch(/AU this week/)
    // A partial week is a floor, and the card has to say so.
    expect(container.textContent).toMatch(/floor rather than a total/)
  })

  it('explains why there is no ratio instead of printing a meaningless one', () => {
    const load = trainingLoadSummary({ sessions: [lift(1, 7), lift(3, 7)], runs: [] })
    render(<TrainingLoadCard load={load} />)
    expect(container.textContent).toMatch(/No acute:chronic ratio yet/)
    expect(container.textContent).not.toMatch(/Working range/)
  })

  it('renders the ratio once four weeks carry load', () => {
    const load = trainingLoadSummary({
      sessions: [0, 1, 7, 8, 14, 15, 21, 22].map((n) => lift(n, 7)),
      runs: [],
    })
    render(<TrainingLoadCard load={load} />)
    expect(container.textContent).toMatch(/Acute : chronic/)
    expect(container.textContent).toMatch(/monitoring aid, not a rule/)
  })
})

describe('SessionRpe', () => {
  it('renders unrated, with the timing guidance that makes the number worth having', () => {
    render(<SessionRpe value={null} durationMinutes={85} onChange={vi.fn()} />)
    expect(container.textContent).toMatch(/Not rated/)
    expect(container.textContent).toMatch(/twenty minutes from now/)
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(10)
  })

  it('reports the load it implies once rated', () => {
    render(<SessionRpe value={7} durationMinutes={85} onChange={vi.fn()} />)
    expect(container.textContent).toMatch(/595 AU/)
    expect(container.textContent).toMatch(/Hard/)
  })

  it('survives a session saved without a duration', () => {
    // `updateSession` carries the stored duration through, and an older
    // session may not have one. No duration means no load, not NaN AU.
    render(<SessionRpe value={7} durationMinutes={undefined} onChange={vi.fn()} />)
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.textContent).not.toMatch(/AU/)
  })

  it('reports the selection, and clears it when the same value is tapped again', () => {
    const onChange = vi.fn()
    render(<SessionRpe value={null} durationMinutes={60} onChange={onChange} />)
    const seven = container.querySelectorAll('[role="radio"]')[6]
    act(() => seven.click())
    expect(onChange).toHaveBeenCalledWith(7)

    render(<SessionRpe value={7} durationMinutes={60} onChange={onChange} />)
    act(() => container.querySelectorAll('[role="radio"]')[6].click())
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('marks the chosen value for assistive tech, not just visually', () => {
    render(<SessionRpe value={4} durationMinutes={60} onChange={vi.fn()} />)
    const checked = [...container.querySelectorAll('[role="radio"]')].filter(
      (b) => b.getAttribute('aria-checked') === 'true'
    )
    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toBe('4')
  })
})

describe('WeightTrendCard with log coverage', () => {
  const metrics = [
    { date: '2026-08-03', weight: 174.5, bodyFatPct: 21.7 },
    { date: '2026-08-10', weight: 176.7, bodyFatPct: 21.4 },
    { date: '2026-08-17', weight: 178.5, bodyFatPct: 22.3 },
    { date: '2026-08-31', weight: 180.2, bodyFatPct: 22.2 },
  ]
  const meal = (kcal) => ({ kcal })
  const gappyWeek = assessLogCoverage(
    [
      { dateId: '2026-08-25', log: { entries: [meal(2332)] } },
      { dateId: '2026-08-26', log: { entries: [meal(2838)] } },
      { dateId: '2026-08-27', log: { entries: [meal(2552)] } },
      { dateId: '2026-08-28', log: { entries: [meal(1786)] } },
      { dateId: '2026-08-29', log: null },
      { dateId: '2026-08-30', log: { entries: [meal(1176)] } },
      { dateId: '2026-08-31', log: { entries: [meal(2503)] } },
    ],
    { bmr: 1743 }
  )

  it('refuses to offer a surplus adjustment when the log cannot support one', () => {
    // The whole point of the gate: no "Adjust surplus" button, and a link to
    // the thing that would actually change the answer.
    render(
      <WeightTrendCard
        bodyMetrics={metrics}
        goal={BODY_COMP_GOALS.cut}
        currentSurplus={-400}
        onApplySurplus={vi.fn()}
        logCoverage={gappyWeek}
      />
    )
    expect(container.textContent).toMatch(/Fill in the missing days/)
    expect(container.textContent).not.toMatch(/Adjust surplus/)
  })

  it('offers the adjustment once the log is complete', () => {
    const complete = assessLogCoverage(
      ['25', '26', '27', '28', '29', '30', '31'].map((d) => ({
        dateId: `2026-08-${d}`,
        log: { entries: [meal(2600)] },
      })),
      { bmr: 1743 }
    )
    render(
      <WeightTrendCard
        bodyMetrics={metrics}
        goal={BODY_COMP_GOALS.cut}
        currentSurplus={-400}
        onApplySurplus={vi.fn()}
        logCoverage={complete}
      />
    )
    expect(container.textContent).toMatch(/Adjust surplus/)
  })

  it('renders unchanged when no coverage is supplied at all', () => {
    // Every existing caller passed nothing until this change; none may break.
    render(
      <WeightTrendCard
        bodyMetrics={metrics}
        goal={BODY_COMP_GOALS.cut}
        currentSurplus={-400}
        onApplySurplus={vi.fn()}
      />
    )
    expect(container.textContent).toMatch(/lb\/wk/)
    expect(container.textContent).not.toMatch(/Fill in the missing days/)
  })

  it('survives having no weigh-ins', () => {
    render(<WeightTrendCard bodyMetrics={[]} goal={BODY_COMP_GOALS.cut} currentSurplus={-400} />)
    expect(container.textContent).toMatch(/No weigh-ins logged yet/)
  })
})
