// @vitest-environment jsdom

/**
 * The sheet behind two entry points: tapping a logged meal on the Fuel page,
 * and "Edit portions" on a coach card. Both land here, so the cases that matter
 * are what it lets you change, and what it refuses to.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MealDetailSheet from '../MealDetailSheet'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ENTRY = {
  id: 'e1',
  label: 'Chicken and rice',
  kcal: 610,
  protein: 43,
  carbs: 56,
  fat: 23,
  loggedAt: '2026-08-17T12:30:00.000Z',
  confidence: 'medium',
  source: 'photo',
  assumptions: ['Assumed thigh, not breast'],
  items: [
    { name: 'rice', quantity: '200g', grams: 200, kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 1 },
    { name: 'chicken thigh', quantity: '150g', grams: 150, kcal: 270, protein_g: 38, carbs_g: 0, fat_g: 13 },
    { name: 'olive oil', quantity: 'a drizzle', kcal: 80, protein_g: 0, carbs_g: 0, fat_g: 9 },
  ],
}

/** A manual entry: totals, no breakdown, nothing to weigh. */
const SHAKE = { id: 'e2', label: 'Protein shake', kcal: 240, protein: 30, carbs: 12, fat: 4 }

let container
let root

// The sheet portals to the body, so queries go there and not to the render root.
const sheet = () => document.body

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const render = (ui) => act(async () => root.render(ui))

const buttonWith = (text) =>
  [...sheet().querySelectorAll('button')].find((b) => b.textContent.includes(text))

const gramsInput = (name) => sheet().querySelector(`input[aria-label="Grams of ${name}"]`)

const type = (input, value) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      input,
      value
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('MealDetailSheet', () => {
  it('shows the breakdown behind the number', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    const text = sheet().textContent
    expect(text).toContain('Chicken and rice')
    expect(text).toContain('rice')
    expect(text).toContain('200g')
    expect(text).toContain('Assumed thigh, not breast')
    expect(text).toContain('610')
  })

  it('saves the totals recomputed from the corrected amounts, not the ones it opened with', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    await render(<MealDetailSheet open entry={ENTRY} onClose={onClose} onSave={onSave} />)

    await act(async () => buttonWith('Edit portions').click())
    await type(gramsInput('rice'), '100')

    await act(async () => buttonWith('Save changes').click())

    const next = onSave.mock.calls[0][0]
    expect(next.kcal).toBe(480)
    expect(next.carbs).toBe(28)
    expect(next.items[0].grams).toBe(100)
    // The meal is still the same meal — only its amounts moved.
    expect(next.id).toBe('e1')
    expect(next.items).toHaveLength(3)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows what the correction moved while it is being made', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    await act(async () => buttonWith('Edit portions').click())
    await type(gramsInput('rice'), '100')
    expect(sheet().textContent).toContain('was 610')
  })

  /**
   * An item the estimator never weighed has no factor to scale its macros by.
   * Offering a field for it would invite a number that does nothing.
   */
  it('offers no amount for an item that was never weighed', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    await act(async () => buttonWith('Edit portions').click())
    expect(gramsInput('rice')).toBeTruthy()
    expect(gramsInput('olive oil')).toBe(null)
  })

  it('edits the totals directly when there is no weighed breakdown', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await render(<MealDetailSheet open entry={SHAKE} onClose={() => {}} onSave={onSave} />)

    await act(async () => buttonWith('Edit portions').click())
    expect(sheet().textContent).toContain('nothing to resize')

    const kcal = [...sheet().querySelectorAll('input')].find((i) => i.value === '240')
    await type(kcal, '300')
    await act(async () => buttonWith('Save changes').click())

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'e2', kcal: 300, protein: 30 })
  })

  // Every write path reaches today's log, so a past day is readable and no more.
  it('offers no edit at all without an onSave', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} note="Past days can't be edited." />)
    expect(buttonWith('Edit portions')).toBeUndefined()
    expect(sheet().textContent).toContain("Past days can't be edited.")
  })

  it('opens straight into the amounts when asked to', async () => {
    await render(<MealDetailSheet open startInEdit entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    expect(gramsInput('rice')).toBeTruthy()
    expect(buttonWith('Save changes')).toBeTruthy()
  })

  it('needs two taps to delete', async () => {
    const onDelete = vi.fn()
    await render(
      <MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} onDelete={onDelete} />
    )
    const del = () =>
      [...sheet().querySelectorAll('button')].find((b) =>
        (b.getAttribute('aria-label') || '').startsWith('Delete') ||
        (b.getAttribute('aria-label') || '') === 'Confirm delete'
      )

    await act(async () => del().click())
    expect(onDelete).not.toHaveBeenCalled()
    await act(async () => del().click())
    expect(onDelete).toHaveBeenCalled()
  })

  // Same shape as the save-sheet crash: the page clears the entry as it closes,
  // and the children here are built before `Sheet` can decide to render nothing.
  it('survives the render where it closes and the entry goes null', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    await render(<MealDetailSheet open={false} entry={null} onClose={() => {}} onSave={() => {}} />)
    expect(document.body.textContent).toBe('')
  })
})
