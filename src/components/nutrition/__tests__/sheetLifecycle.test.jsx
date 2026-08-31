// @vitest-environment jsdom

/**
 * The first rendering test in this repo, added the day a save took the whole
 * page down.
 *
 * Saving a meal to the library worked — the write landed, the meal was there
 * after a refresh — and then the app went white. `SaveMealSheet` copies its
 * draft into local state on open and nothing clears that copy on close, so the
 * guard `if (!fields) return null` still let the body render on the one render
 * where the sheet had just been dismissed and its draft was back to null. JSX
 * children are evaluated before `Sheet` is ever called and can decide to render
 * nothing, so `draft.items` was read off null regardless.
 *
 * Every UI change in this repo has shipped unseen — no DOM environment, and the
 * pages need a signed-in Firebase user. These tests don't fix that. They cover
 * the one thing that does not need a session or a network: mounting a component
 * and driving it through the prop transitions the app actually performs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import SaveMealSheet from '../SaveMealSheet'
import LogSavedMealSheet from '../LogSavedMealSheet'
import MealLibrary from '../MealLibrary'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ENTRY = {
  id: 'entry-1',
  label: 'Overnight oats',
  kcal: 500,
  protein: 30,
  carbs: 60,
  fat: 15,
  // A meal's breakdown sums to its totals — the estimator guarantees it, and
  // the sheet now derives the saved numbers from the ingredients, so a fixture
  // where the two disagree would be testing a state the app cannot produce.
  items: [
    { name: 'oats', quantity: '100g', grams: 100, kcal: 500, protein_g: 30, carbs_g: 60, fat_g: 15 },
  ],
}

const MEAL = { id: 'sm-1', name: 'Overnight oats', ...ENTRY, useCount: 3 }

/**
 * A library meal built from a batch: `items` is the one serving the library
 * stores and logs, `recipe` is the pot it was a quarter of.
 */
const TRAYBAKE = {
  id: 'sm-2',
  name: 'Chickpea traybake',
  kcal: 239,
  protein: 9.5,
  carbs: 29.8,
  fat: 8.8,
  useCount: 2,
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
      { input: '2 tbsp olive oil', name: 'olive oil', quantity: '2 tbsp', grams: 28, kcal: 248, protein_g: 0, carbs_g: 0, fat_g: 28 },
    ],
  },
}

let container
let root

/**
 * `Sheet` portals to `document.body`, so a sheet's markup is never inside the
 * root React renders into. Scope sheet queries to the body; `container` still
 * holds everything a component renders in place.
 */
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

const render = async (ui) => act(async () => root.render(ui))

describe('SaveMealSheet', () => {
  it('renders a draft, then survives the render where it closes and the draft goes null', async () => {
    await render(<SaveMealSheet open draft={ENTRY} onClose={() => {}} onSave={() => {}} />)
    expect(sheet().textContent).toContain('Save to library')
    expect(sheet().querySelector('input').value).toBe('Overnight oats')

    // Exactly what the page does on save: write, then clear the entry it was
    // naming. This is the render that white-screened.
    await render(<SaveMealSheet open={false} draft={null} onClose={() => {}} onSave={() => {}} />)
    expect(sheet().textContent).toBe('')
  })

  /**
   * The coach page pins itself with `position: fixed`, which opens a stacking
   * context — anything rendered inside it is stuck below the bottom nav no
   * matter its z-index, which is how the save button ended up behind the nav
   * bar. Rendering to the body is what keeps the footer reachable.
   */
  it('renders outside the tree it was opened from, so no page can stack over it', async () => {
    await render(<SaveMealSheet open draft={ENTRY} onClose={() => {}} onSave={() => {}} />)
    expect(container.textContent).toBe('')
    expect(document.body.textContent).toContain('Save to library')
  })

  it('saves the edited name and macros rather than the draft it started from', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    await render(<SaveMealSheet open draft={ENTRY} onClose={onClose} onSave={onSave} />)

    const nameInput = sheet().querySelector('input')
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set.call(nameInput, 'Post-lift bowl')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const save = [...sheet().querySelectorAll('button')].find((b) =>
      b.textContent.includes('Save to library')
    )
    await act(async () => save.click())

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Post-lift bowl', kcal: 500 }))
    // The breakdown rides along untouched — it is what makes a saved meal
    // explain itself later.
    expect(onSave.mock.calls[0][0].items).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()
  })

  /**
   * The library stores a serving, so the batch has to be divided by the yield
   * on the way in — and shown divided, because that is the number that gets
   * logged on every future tap.
   */
  it('edits the batch behind a saved meal and stores one serving of it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await render(<SaveMealSheet open mode="edit" draft={TRAYBAKE} onClose={() => {}} onSave={onSave} />)

    const lines = [...sheet().querySelectorAll('input[aria-label="Ingredient"]')]
    expect(lines[0].value).toBe('2 cans of 15 oz garbanzo beans')
    expect(sheet().textContent).toContain('239')

    // Same pot, half the dinners out of it.
    const makes = sheet().querySelector('input[aria-label="Servings this makes"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(makes, '2')
      makes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(sheet().textContent).toContain('479')

    const save = [...sheet().querySelectorAll('button')].find((b) =>
      b.textContent.includes('Save changes')
    )
    await act(async () => save.click())

    const saved = onSave.mock.calls[0][0]
    expect(saved.kcal).toBe(479)
    expect(saved.items[0].grams).toBe(255)
    expect(saved.recipe).toEqual({ servings: 2, items: TRAYBAKE.recipe.items })
    // The library's own bookkeeping is not the sheet's to reset.
    expect(saved.useCount).toBe(2)
  })

  it('needs two taps to delete, so a mis-tap cannot empty the library', async () => {
    const onDelete = vi.fn()
    await render(
      <SaveMealSheet
        open
        mode="edit"
        draft={MEAL}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={onDelete}
      />
    )

    const del = () =>
      [...sheet().querySelectorAll('button')].find((b) =>
        (b.getAttribute('aria-label') || '').includes('delete') ||
        (b.getAttribute('aria-label') || '').includes('Delete')
      )

    await act(async () => del().click())
    expect(onDelete).not.toHaveBeenCalled()
    expect(sheet().textContent).toContain('Sure?')

    await act(async () => del().click())
    expect(onDelete).toHaveBeenCalled()
  })
})

describe('LogSavedMealSheet', () => {
  it('scales the macros with the quantity, and closes without reading a null meal', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    await render(<LogSavedMealSheet open meal={MEAL} onClose={onClose} onLog={onLog} />)

    const double = [...sheet().querySelectorAll('button')].find((b) => b.textContent === '2×')
    await act(async () => double.click())
    expect(sheet().textContent).toContain('Log 1000 kcal')

    const log = [...sheet().querySelectorAll('button')].find((b) =>
      b.textContent.includes('Log 1000')
    )
    await act(async () => log.click())
    expect(onLog).toHaveBeenCalledWith(MEAL, {
      quantity: 2,
      macros: { kcal: 1000, protein: 60, carbs: 120, fat: 30 },
    })

    await render(<LogSavedMealSheet open={false} meal={null} onClose={onClose} onLog={onLog} />)
    expect(sheet().textContent).toBe('')
  })
})

describe('MealLibrary', () => {
  const props = { loading: false, onLog: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() }

  it('filters by name and by what was in the meal', async () => {
    const meals = [
      MEAL,
      {
        id: 'sm-2',
        name: 'Tuesday dinner',
        kcal: 800,
        protein: 55,
        carbs: 70,
        fat: 30,
        items: [{ name: 'salmon fillet' }],
      },
    ]
    await render(<MealLibrary meals={meals} {...props} />)
    expect(container.textContent).toContain('Overnight oats')

    const search = container.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        search,
        'salmon'
      )
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Searching the breakdown is the whole reason "salmon" finds a meal whose
    // name never mentions it.
    expect(container.textContent).toContain('Tuesday dinner')
    expect(container.textContent).not.toContain('Overnight oats')
  })

  it('tells him to save one rather than showing an empty list', async () => {
    await render(<MealLibrary meals={[]} {...props} />)
    expect(container.textContent).toContain('No saved meals yet')
  })
})
