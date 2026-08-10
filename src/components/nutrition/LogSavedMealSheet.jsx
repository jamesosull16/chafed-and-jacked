import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Sheet, Button, Badge, Field, Input, CardLabel } from '../ui'
import { cn } from '../ui/cn'
import { QUANTITY_PRESETS, scaleMacros, scaleItems, normaliseQuantity } from '../../lib/savedMeals'

const MACROS = [
  { key: 'kcal', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
]

/**
 * Confirm a saved meal before it lands on the day.
 *
 * A saved meal is a stored serving, not a measurement of what was just eaten —
 * the same "Overnight oats" is a bigger bowl on a long-run morning. So the
 * quantity is asked for every time rather than assumed, and the macros stay
 * editable underneath it: the multiplier is a shortcut to the numbers, not a
 * replacement for them. Editing a field wins over the arithmetic that filled
 * it, until the quantity changes again and the scaling reasserts itself.
 */
export default function LogSavedMealSheet({ open, onClose, meal, onLog }) {
  const [quantity, setQuantity] = useState(1)
  const [macros, setMacros] = useState(null)
  const [busy, setBusy] = useState(false)

  // Reopening on a different meal must not inherit the last one's portion.
  useEffect(() => {
    if (!open || !meal) return
    setQuantity(1)
    setMacros(scaleMacros(meal, 1))
    setBusy(false)
  }, [open, meal])

  if (!meal || !macros) return null

  function applyQuantity(next) {
    setQuantity(next)
    setMacros(scaleMacros(meal, next))
  }

  async function handleLog() {
    setBusy(true)
    try {
      await onLog(meal, {
        quantity: normaliseQuantity(quantity),
        macros: {
          kcal: Number(macros.kcal) || 0,
          protein: Number(macros.protein) || 0,
          carbs: Number(macros.carbs) || 0,
          fat: Number(macros.fat) || 0,
        },
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const factor = normaliseQuantity(quantity)
  const items = scaleItems(meal.items, factor)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meal.name}
      description="Check the portion before it goes on today."
      footer={
        <Button fullWidth size="lg" icon={Check} onClick={handleLog} disabled={busy}>
          {busy ? 'Logging…' : `Log ${Math.round(Number(macros.kcal) || 0)} kcal`}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <CardLabel>How much?</CardLabel>
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {QUANTITY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyQuantity(preset)}
                aria-pressed={factor === preset}
                className={cn(
                  'min-h-11 rounded-xl text-sm font-medium tabular-nums transition-colors border',
                  factor === preset
                    ? 'bg-brand-subtle border-brand-border text-brand'
                    : 'bg-bg border-border-strong text-muted hover:text-text hover:bg-surface'
                )}
              >
                {preset}×
              </button>
            ))}
            <Input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              aria-label="Custom quantity"
              value={quantity}
              onChange={(e) => applyQuantity(e.target.value)}
              className="text-center px-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MACROS.map((m) => (
            <Field key={m.key} label={m.label}>
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="number"
                  inputMode="decimal"
                  value={macros[m.key]}
                  onChange={(e) => setMacros({ ...macros, [m.key]: e.target.value })}
                  className="text-center px-1"
                />
              )}
            </Field>
          ))}
        </div>

        {items.length > 0 && (
          <div>
            <CardLabel>Breakdown</CardLabel>
            <ul className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <li key={`${item.name}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-text min-w-0">
                    {item.name}
                    <span className="text-subtle"> · {item.quantity || `${item.grams}g`}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {Math.round(item.kcal)} kcal
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {meal.assumptions?.length > 0 && (
          <div>
            <CardLabel>Assumptions from when this was saved</CardLabel>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              {meal.assumptions.map((a) => (
                <li key={a} className="text-xs text-muted">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {meal.useCount > 0 && (
          <Badge tone="neutral" size="xs">
            Logged {meal.useCount}×
          </Badge>
        )}
      </div>
    </Sheet>
  )
}
