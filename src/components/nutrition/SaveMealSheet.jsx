import { useEffect, useState } from 'react'
import { BookmarkPlus, Trash2, ListPlus } from 'lucide-react'
import { Sheet, Button, Field, Input, CardLabel } from '../ui'
import { libraryKey, normaliseName } from '../../lib/savedMeals'
import IngredientEditor from './IngredientEditor'
import {
  blankRow,
  rowsFromItems,
  resolvedItems,
  recipeFromEntry,
  recipeToSavedMeal,
  entryTotals,
  scaleItems,
  normaliseServings,
} from '../../lib/recipe'

const MACROS = [
  { key: 'kcal', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
]

/**
 * Name a meal into the library, or correct one already in it.
 *
 * One sheet for both because they are the same decision — what is this called
 * and what is in one serving — and the library is only as useful as the names
 * in it are searchable. The name is prefilled from the log entry but always
 * editable: "chicken thigh, rice, and a big spoon of peanut butter" is a fine
 * description of a meal and a useless thing to search for at 6am.
 *
 * The ingredients are editable here too, and that is the version of a
 * correction worth making: fixing the beans in the library fixes every future
 * log of the meal, where fixing them on today's card fixes today.
 */
export default function SaveMealSheet({
  open,
  onClose,
  draft,
  onSave,
  onDelete,
  isDuplicate,
  mode = 'create',
}) {
  const [fields, setFields] = useState(null)
  const [rows, setRows] = useState([])
  const [servings, setServings] = useState(1)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open || !draft) return
    const recipe = recipeFromEntry(draft)
    setFields({
      name: normaliseName(draft.name || draft.label || ''),
      kcal: Math.round(draft.kcal ?? 0),
      protein: Math.round((draft.protein ?? 0) * 10) / 10,
      carbs: Math.round((draft.carbs ?? 0) * 10) / 10,
      fat: Math.round((draft.fat ?? 0) * 10) / 10,
    })
    setRows(recipe.items.length ? rowsFromItems(recipe.items) : [])
    setServings(recipe.servings)
    setBusy(false)
    setConfirmingDelete(false)
  }, [open, draft])

  /**
   * Guarded on `draft`, not just on the copied fields.
   *
   * `fields` survives closing — the effect fills it and nothing clears it — so
   * a guard on `fields` alone still renders the body on the render where the
   * sheet has just been dismissed and `draft` is back to null. JSX children are
   * built before `Sheet` is called and can decide to render nothing, so
   * `draft.items` below was evaluated anyway, and reading it off null took the
   * whole page down at the exact moment a save succeeded: white screen, meal
   * written, back on a refresh.
   */
  if (!open || !draft || !fields) return null

  const name = normaliseName(fields.name, '')
  // Only a warning when it would land on a *different* meal — re-saving the
  // one being edited under its own name is not a collision.
  const collides =
    mode === 'create' && !!name && !!isDuplicate?.(name) && libraryKey(name) !== libraryKey(draft?.name)

  const items = resolvedItems(rows)
  const byIngredients = items.length > 0
  // The library stores a serving, so that is what the numbers on this sheet
  // describe — the editor shows the same figure under "Per serving".
  const serving = entryTotals(scaleItems(items, 1 / normaliseServings(servings)))

  async function handleSave() {
    setBusy(true)
    try {
      if (byIngredients) {
        await onSave(recipeToSavedMeal({ name, items, servings, base: draft }))
      } else {
        // Ingredients deleted down to none is a deliberate act — the meal goes
        // back to being four numbers, and keeping a breakdown that no longer
        // adds up to them would leave the card explaining itself with items the
        // totals disagree with.
        const base = { ...draft }
        if (rows.length) {
          delete base.items
          delete base.recipe
          delete base.assumptions
        }
        await onSave({
          ...base,
          name,
          kcal: Number(fields.kcal) || 0,
          protein: Number(fields.protein) || 0,
          carbs: Number(fields.carbs) || 0,
          fat: Number(fields.fat) || 0,
        })
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit saved meal' : 'Save to library'}
      description={
        mode === 'edit'
          ? 'These are the numbers logged each time you tap it.'
          : 'Give it a name you would search for, and log it in a tap from now on.'
      }
      footer={
        <div className="flex gap-2">
          {onDelete && (
            <Button
              variant={confirmingDelete ? 'danger' : 'dangerGhost'}
              icon={Trash2}
              onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
              aria-label={confirmingDelete ? 'Confirm delete' : 'Delete saved meal'}
            >
              {confirmingDelete ? 'Sure?' : ''}
            </Button>
          )}
          <Button
            fullWidth
            icon={mode === 'edit' ? undefined : BookmarkPlus}
            onClick={handleSave}
            disabled={busy || !name}
          >
            {busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save to library'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="Name"
          hint={collides ? undefined : 'Short and searchable — “Overnight oats”, “Post-lift bowl”.'}
          error={collides ? 'A saved meal already has this name — saving will replace it.' : undefined}
        >
          {({ id, ...a11y }) => (
            <Input
              id={id}
              {...a11y}
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
              placeholder="Meal name"
              autoFocus
            />
          )}
        </Field>

        {/* With ingredients on the meal the four numbers are an output, not an
            input. Two places to type the same total is two answers to which one
            is right. */}
        {byIngredients ? (
          <div>
            <CardLabel>One serving</CardLabel>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {MACROS.map((m) => (
                <div key={m.key} className="bg-surface rounded-xl py-2 text-center">
                  <p className="text-base font-semibold text-text tabular-nums">
                    {Math.round(serving[m.key])}
                  </p>
                  <p className="text-[10px] text-subtle mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <CardLabel>One serving</CardLabel>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {MACROS.map((m) => (
                <Field key={m.key} label={m.label}>
                  {({ id, ...a11y }) => (
                    <Input
                      id={id}
                      {...a11y}
                      type="number"
                      inputMode="decimal"
                      value={fields[m.key]}
                      onChange={(e) => setFields({ ...fields, [m.key]: e.target.value })}
                      className="text-center px-1"
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 ? (
          <div>
            <CardLabel>Ingredients</CardLabel>
            <div className="mt-2">
              <IngredientEditor
                rows={rows}
                onRowsChange={setRows}
                servings={servings}
                onServingsChange={setServings}
                context={fields.name}
                busy={busy}
              />
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" icon={ListPlus} fullWidth onClick={() => setRows([blankRow()])}>
            Add ingredients
          </Button>
        )}
      </div>
    </Sheet>
  )
}
