// @vitest-environment jsdom

/**
 * The sheet behind two entry points: tapping a logged meal on the Fuel page,
 * and "Edit portions" on a coach card. Both land here, so the cases that matter
 * are what it lets you change, and what it refuses to.
 *
 * Since the ingredient editor moved in behind it, "change" covers adding an
 * ingredient that was forgotten and deleting one that was never there, not just
 * re-weighing the ones the estimator found. The lookup is stubbed — it is a
 * cloud call, and what these tests are about is what the sheet does with what
 * comes back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MealDetailSheet from '../MealDetailSheet'
import { resolveIngredients } from '../../../lib/mealEstimation'

vi.mock('../../../lib/mealEstimation', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveIngredients: vi.fn(),
}))

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

/** A batch cooked once and eaten a quarter at a time. */
const TRAYBAKE = {
  id: 'e3',
  label: 'Chickpea traybake',
  kcal: 239,
  protein: 9.5,
  carbs: 29.8,
  fat: 8.8,
  loggedAt: '2026-08-31T18:00:00.000Z',
  source: 'manual',
  items: [
    { name: 'chickpeas, canned, drained', quantity: '127.5g', grams: 127.5, kcal: 177, protein_g: 9.5, carbs_g: 29.8, fat_g: 1.8 },
    { name: 'olive oil', quantity: '7g', grams: 7, kcal: 62, protein_g: 0, carbs_g: 0, fat_g: 7 },
  ],
  recipe: {
    servings: 4,
    items: [
      {
        input: '2 cans of 15 oz garbanzo beans',
        name: 'chickpeas, canned, drained',
        quantity: '2 × 15 oz can, drained',
        grams: 510,
        kcal: 709,
        protein_g: 38,
        carbs_g: 119,
        fat_g: 7,
        note: 'A 15 oz can is 425g net; about 255g drained.',
      },
      {
        input: '2 tbsp olive oil',
        name: 'olive oil',
        quantity: '2 tbsp',
        grams: 28,
        kcal: 248,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 28,
      },
    ],
  },
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
  resolveIngredients.mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const render = (ui) => act(async () => root.render(ui))

const buttonWith = (text) =>
  [...sheet().querySelectorAll('button')].find((b) => b.textContent.includes(text))

const labelled = (label) => sheet().querySelector(`[aria-label="${label}"]`)

const click = (el) => act(async () => el.click())

/** Open one ingredient's corrections — the weight and macro fields live there. */
const correct = (name) => click(labelled(`Correct ${name}`))

const gramsInput = (name) => sheet().querySelector(`input[aria-label="Grams of ${name}"]`)

const ingredientInputs = () => [...sheet().querySelectorAll('input[aria-label="Ingredient"]')]

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

    await click(buttonWith('Edit portions'))
    await correct('rice')
    await type(gramsInput('rice'), '100')

    await click(buttonWith('Save changes'))

    const next = onSave.mock.calls[0][0]
    expect(next.kcal).toBe(480)
    expect(next.carbs).toBe(28)
    expect(next.items[0].grams).toBe(100)
    // The meal is still the same meal — only its amounts moved.
    expect(next.id).toBe('e1')
    expect(next.items).toHaveLength(3)
    expect(next.editedAt).toBeTruthy()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows what the correction moved while it is being made', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    await click(buttonWith('Edit portions'))
    await correct('rice')
    await type(gramsInput('rice'), '100')
    expect(sheet().textContent).toContain('was 610')
  })

  /**
   * An item the estimator never weighed has no factor to scale its macros by.
   * Offering a field for it would invite a number that does nothing — its
   * macros are corrected directly instead.
   */
  it('offers no weight for an item that was never weighed', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    await click(buttonWith('Edit portions'))
    await correct('rice')
    expect(gramsInput('rice')).toBeTruthy()
    await correct('olive oil')
    expect(gramsInput('olive oil')).toBe(null)
    expect(labelled('Fat for olive oil')).toBeTruthy()
  })

  it('drops an ingredient that was never in the meal', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={onSave} />)

    await click(buttonWith('Edit portions'))
    await click(labelled('Remove olive oil'))

    expect(sheet().textContent).toContain('was 610')
    await click(buttonWith('Save changes'))

    const next = onSave.mock.calls[0][0]
    expect(next.items).toHaveLength(2)
    expect(next.kcal).toBe(530)
    expect(next.fat).toBe(14)
  })

  it('adds an ingredient that was forgotten, priced by the lookup', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    resolveIngredients.mockResolvedValue({
      items: [
        {
          index: 0,
          input: '2 tbsp peanut butter',
          name: 'peanut butter',
          quantity: '2 tbsp',
          grams: 32,
          kcal: 188,
          protein_g: 8,
          carbs_g: 6,
          fat_g: 16,
          source: 'usda',
        },
      ],
      grounded: true,
    })

    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} onSave={onSave} />)
    await click(buttonWith('Edit portions'))
    await click(buttonWith('Add ingredient'))

    const blank = ingredientInputs().at(-1)
    await type(blank, '2 tbsp peanut butter')
    await click(buttonWith('Work out 1 line'))

    expect(resolveIngredients).toHaveBeenCalledWith(['2 tbsp peanut butter'], {
      context: 'Chicken and rice',
    })

    await click(buttonWith('Save changes'))
    const next = onSave.mock.calls[0][0]
    expect(next.items).toHaveLength(4)
    expect(next.kcal).toBe(798)
    expect(next.fat).toBe(39)
  })

  /**
   * The batch is what he typed and the plate is what he ate. Opening the editor
   * on a quarter portion has to show two cans of chickpeas, not 127.5g of them
   * — nobody typed 127.5g, and correcting it there would leave the other three
   * servings describing a meal that no longer matches.
   */
  it('edits the batch behind a portioned meal, and re-derives the portion from it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await render(<MealDetailSheet open entry={TRAYBAKE} onClose={() => {}} onSave={onSave} />)
    expect(sheet().textContent).toContain('1 of 4 servings')

    await click(buttonWith('Edit portions'))
    expect(ingredientInputs()[0].value).toBe('2 cans of 15 oz garbanzo beans')

    await correct('chickpeas, canned, drained')
    await type(gramsInput('chickpeas, canned, drained'), '255')
    await click(buttonWith('Save changes'))

    const next = onSave.mock.calls[0][0]
    // Half the beans in the pot, so half the beans on the plate.
    expect(next.recipe.items[0].grams).toBe(255)
    expect(next.recipe.servings).toBe(4)
    expect(next.items[0].grams).toBe(63.8)
    expect(next.kcal).toBe(151)
  })

  it('edits the totals directly when there is no breakdown', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await render(<MealDetailSheet open entry={SHAKE} onClose={() => {}} onSave={onSave} />)

    await click(buttonWith('Edit portions'))
    expect(sheet().textContent).toContain('nothing behind them to resize')

    const kcal = [...sheet().querySelectorAll('input')].find((i) => i.value === '240')
    await type(kcal, '300')
    await click(buttonWith('Save changes'))

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'e2', kcal: 300, protein: 30 })
  })

  /** Four numbers is where a meal starts, not where it has to stay. */
  it('breaks a totals-only meal into ingredients on request', async () => {
    await render(<MealDetailSheet open entry={SHAKE} onClose={() => {}} onSave={() => {}} />)
    await click(buttonWith('Edit portions'))
    await click(buttonWith('Break into ingredients'))
    expect(ingredientInputs()).toHaveLength(1)
    // Nothing resolved yet, so there is nothing to save over the meal with.
    expect(buttonWith('Save changes').disabled).toBe(true)
  })

  it('offers no edit at all without an onSave', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} note="This one was deleted." />)
    expect(buttonWith('Edit portions')).toBeUndefined()
    expect(sheet().textContent).toContain('This one was deleted.')
  })

  /**
   * A read-only sheet used to render its action bar anyway — empty, bordered,
   * and padded. On a phone it read as controls that had failed to load, which
   * is exactly how it was reported: "the ability to change anything is cut off".
   */
  it('renders no action bar when there are no actions', async () => {
    await render(<MealDetailSheet open entry={ENTRY} onClose={() => {}} />)
    const bars = [...sheet().querySelectorAll('div')].filter((d) =>
      d.className.includes('border-t')
    )
    expect(bars).toHaveLength(0)
  })

  it('opens straight into the ingredients when asked to', async () => {
    await render(<MealDetailSheet open startInEdit entry={ENTRY} onClose={() => {}} onSave={() => {}} />)
    expect(ingredientInputs()).toHaveLength(3)
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

    await click(del())
    expect(onDelete).not.toHaveBeenCalled()
    await click(del())
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
