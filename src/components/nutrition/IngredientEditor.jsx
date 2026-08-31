import { useId, useState } from 'react'
import { Plus, X, Sparkles, ChevronDown, Loader2 } from 'lucide-react'
import { Button, Input } from '../ui'
import { cn } from '../ui/cn'
import { resolveIngredients } from '../../lib/mealEstimation'
import {
  MACRO_FIELDS,
  MAX_ROWS,
  blankRow,
  isStale,
  pendingRows,
  applyResolved,
  rowItem,
  resolvedItems,
  canResize,
  itemTotals,
  normaliseServings,
  scaleItems,
} from '../../lib/recipe'

/**
 * One ingredient: the line as typed, and what came back for it.
 *
 * Collapsed by default to a single readable summary — "chickpeas, canned,
 * drained · 510g · 709 kcal" — because the common case is that the lookup got
 * it right and the next thing he wants is the next row, not a grid of numbers.
 * The override lives one tap down, for the case where it did not.
 */
function IngredientRow({ row, onChange, onRemove, disabled, canRemove }) {
  const [open, setOpen] = useState(false)
  const item = rowItem(row)
  const stale = isStale(row)
  const resizable = canResize(row.item)

  return (
    <li className="rounded-xl border border-border bg-bg">
      <div className="flex items-start gap-1.5 p-1.5">
        <div className="flex-1 min-w-0">
          <Input
            aria-label="Ingredient"
            placeholder="2 cans of 15 oz garbanzo beans"
            value={row.input}
            disabled={disabled}
            onChange={(e) => onChange({ ...row, input: e.target.value })}
            className="border-0 bg-transparent px-2 focus:ring-0"
          />

          {item && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Correct'} ${item.name}`}
              className="flex items-center gap-1.5 w-full px-2 pb-1 text-left"
            >
              <span className="text-xs text-muted truncate flex-1 min-w-0">
                {item.name}
                {item.grams > 0 && ` · ${Math.round(item.grams)}g`}
              </span>
              <span className="text-xs text-text tabular-nums shrink-0">
                {Math.round(item.kcal)} kcal
              </span>
              <ChevronDown
                className={cn('w-3.5 h-3.5 text-subtle transition-transform', open && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          )}

          {/* The correction he did not make himself. A can that came back 40%
              under its label has to say why on the row, not two screens away in
              a list of assumptions. */}
          {item?.note && !open && (
            <p className="px-2 pb-1.5 text-[11px] text-subtle leading-snug">{item.note}</p>
          )}

          {stale && row.input.trim() && (
            <p className="px-2 pb-1.5 text-[11px] text-warning-strong">Not looked up yet</p>
          )}
        </div>

        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${item?.name || row.input.trim() || 'ingredient'}`}
            className="px-2 shrink-0"
          />
        )}
      </div>

      {item && open && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          {item.note && <p className="text-[11px] text-subtle leading-snug">{item.note}</p>}

          {/* An item the lookup never weighed — "a drizzle of olive oil" — has
              no mass for a new one to be a proportion of. Offering the field
              anyway would invite a number that does nothing. */}
          {resizable && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted w-14 shrink-0" htmlFor={`${row.key}-grams`}>
                Weight
              </label>
              <Input
                id={`${row.key}-grams`}
                type="number"
                inputMode="decimal"
                min="0"
                step="5"
                aria-label={`Grams of ${row.item.name}`}
                value={row.grams ?? row.item.grams ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ ...row, grams: e.target.value })}
                className="text-center px-1"
              />
              <span className="text-xs text-subtle">g</span>
            </div>
          )}

          {/* Weight and macros are two different corrections — "it was a smaller
              can" and "that is not what this food contains" — so editing the
              weight carries the macros with it, and editing a macro leaves the
              weight alone. */}
          <div className="grid grid-cols-4 gap-1.5">
            {MACRO_FIELDS.map((m) => (
              <label key={m.key} className="block">
                <span className="block text-[10px] text-subtle text-center mb-0.5">{m.label}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  aria-label={`${m.label} for ${row.item.name}`}
                  value={row.macros?.[m.key] ?? item[m.key] ?? ''}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({ ...row, macros: { ...row.macros, [m.key]: e.target.value } })
                  }
                  className="text-center px-1"
                />
              </label>
            ))}
          </div>

          <p className="text-[11px] text-subtle">
            {item.source === 'manual'
              ? 'Your numbers'
              : item.source === 'usda'
                ? `USDA${item.usdaDescription ? ` · ${item.usdaDescription}` : ''}`
                : 'Estimated — no database match'}
          </p>
        </div>
      )}
    </li>
  )
}

/**
 * A small labelled number box, for the two servings fields.
 *
 * The id is passed in rather than fixed, because the Fuel page can have this
 * editor open in the manual-add card and again inside a sheet over it — and two
 * inputs sharing an id means the second label points at the first field.
 */
function ServingsInput({ id, label, describe, value, onChange, disabled }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 flex-1">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0.25"
        step="1"
        aria-label={describe}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="text-center px-1"
      />
    </label>
  )
}

/**
 * Build a meal out of its ingredients.
 *
 * Shared by every place a meal can be written: the manual add on Fuel, the
 * sheet behind a logged card, and the library editor. They differ only in what
 * they do with the result, and an ingredient list that behaved differently
 * depending on which one you opened would be three chances to get the
 * arithmetic wrong.
 *
 * Controlled — the host owns `rows`, `servings` and `eaten`, so it can seed
 * them from whatever it is editing and decide what saving means. `eaten` is
 * omitted by the library, where a saved meal has no occasion to have been eaten
 * on: it stores a serving, and the quantity is asked at log time.
 */
export default function IngredientEditor({
  rows,
  onRowsChange,
  servings,
  onServingsChange,
  eaten,
  onEatenChange,
  context,
  busy = false,
}) {
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState(null)
  const fieldId = useId()

  const frozen = looking || busy
  const pending = pendingRows(rows)
  const items = resolvedItems(rows)
  const made = normaliseServings(servings)
  const ate = normaliseServings(eaten ?? 1)

  const batch = itemTotals(items)
  const perServing = itemTotals(scaleItems(items, 1 / made))
  const plate = itemTotals(scaleItems(items, ate / made))
  const shown = onEatenChange ? plate : perServing
  const split = made !== 1 || ate !== 1

  async function lookUp() {
    setError(null)
    setLooking(true)
    try {
      // Keys, not indices. The lookup runs on a subset of the rows and returns
      // answers tagged with their position in *that* subset, so the only stable
      // handle on "the row this belongs to" is the row's own key.
      const keys = pending.map((row) => row.key)
      const { items: resolved } = await resolveIngredients(
        pending.map((row) => row.input),
        { context }
      )
      const byKey = new Map()
      for (const item of resolved) {
        const key = keys[item.index]
        if (key) byKey.set(key, item)
      }
      onRowsChange(applyResolved(rows, byKey))
    } catch (err) {
      setError(err.message)
    } finally {
      setLooking(false)
    }
  }

  function removeRow(key) {
    const next = rows.filter((row) => row.key !== key)
    onRowsChange(next.length ? next : [blankRow()])
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <IngredientRow
            key={row.key}
            row={row}
            disabled={frozen}
            canRemove={rows.length > 1 || !!row.item || !!row.input.trim()}
            onChange={(next) => onRowsChange(rows.map((r) => (r.key === row.key ? next : r)))}
            onRemove={() => removeRow(row.key)}
          />
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          className="flex-1"
          disabled={frozen || rows.length >= MAX_ROWS}
          onClick={() => onRowsChange([...rows, blankRow()])}
        >
          Add ingredient
        </Button>
        {pending.length > 0 && (
          <Button
            size="sm"
            icon={looking ? Loader2 : Sparkles}
            className="flex-1"
            disabled={frozen}
            onClick={lookUp}
          >
            {looking
              ? 'Looking up…'
              : `Work out ${pending.length} ${pending.length === 1 ? 'line' : 'lines'}`}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-danger-strong">{error}</p>}

      {items.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-3">
            <ServingsInput
              id={`${fieldId}-servings`}
              label="Makes"
              describe="Servings this makes"
              value={servings}
              disabled={frozen}
              onChange={onServingsChange}
            />
            {onEatenChange && (
              <ServingsInput
                id={`${fieldId}-eaten`}
                label="I ate"
                describe="Servings eaten"
                value={eaten}
                disabled={frozen}
                onChange={onEatenChange}
              />
            )}
          </div>

          {/* Both numbers whenever they differ. The whole point of the servings
              field is that the pot and the plate are not the same meal, and
              showing one of them is how a batch lands on a Sunday. */}
          <div className="rounded-xl bg-surface p-2.5 space-y-1">
            {split && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-subtle">
                  {made === 1 ? 'All ingredients' : `All ${made} servings`}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {Math.round(batch.kcal)} kcal
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-text">
                {!onEatenChange
                  ? 'Per serving'
                  : split
                    ? `Logging ${ate === 1 ? '1 serving' : `${ate} servings`}`
                    : 'Logging'}
              </span>
              <span className="text-sm font-semibold text-text tabular-nums">
                {Math.round(shown.kcal)} kcal
              </span>
            </div>
            <p className="text-[11px] text-muted tabular-nums text-right">
              {Math.round(shown.protein_g)}g protein · {Math.round(shown.carbs_g)}g carbs ·{' '}
              {Math.round(shown.fat_g)}g fat
            </p>
          </div>
        </div>
      )}

      {items.length === 0 && pending.length === 0 && (
        <p className="text-xs text-subtle leading-snug">
          One ingredient a line, as you would read it off the packet — “2 cans of 15 oz garbanzo
          beans”, “1 tbsp olive oil”. Cans and jars are corrected to drained weight.
        </p>
      )}
    </div>
  )
}
