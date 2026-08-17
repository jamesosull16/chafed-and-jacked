import { useEffect, useState } from 'react'
import { Pencil, Check, Trash2, Bookmark, BookmarkCheck, Camera } from 'lucide-react'
import { Sheet, Button, Badge, Field, Input, CardLabel } from '../ui'
import { cn } from '../ui/cn'
import { CONFIDENCE_COPY } from '../../lib/mealEstimation'
import {
  itemGrams,
  hasWeighedItems,
  resizeItem,
  totalsFromItems,
  entryWithPortions,
  entryWithMacros,
} from '../../lib/portions'

const MACROS = [
  { key: 'kcal', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

const MACRO_TONE = {
  kcal: 'text-text',
  protein: 'text-brand',
  carbs: 'text-accent-strong',
  fat: 'text-warning-strong',
}

function Totals({ totals, was }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MACROS.map((m) => {
        const changed = was && Math.round(was[m.key]) !== Math.round(totals[m.key])
        return (
          <div key={m.key} className="bg-surface rounded-xl py-2 text-center">
            <p className={cn('text-base font-semibold tabular-nums', MACRO_TONE[m.key])}>
              {Math.round(totals[m.key])}
              {m.unit}
            </p>
            <p className="text-[10px] text-subtle mt-0.5">{m.label}</p>
            {/* Only where it moved — a row of "was" under unchanged numbers is
                noise, and the point is to show what the correction cost. */}
            {changed && (
              <p className="text-[10px] text-muted tabular-nums">
                was {Math.round(was[m.key])}
                {m.unit}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * One line of the breakdown.
 *
 * `editable` is false either because the sheet is being read rather than
 * edited, or because this item never had a weight to scale its macros by — in
 * which case it rides along at whatever it was estimated at.
 */
function ItemRow({ item, shown, editable, value, onChange }) {
  const grams = itemGrams(item)
  return (
    <li className="flex items-center justify-between gap-3 min-h-8">
      <span className="text-sm text-text min-w-0 flex-1 truncate">
        {item.name}
        {!editable && (
          <span className="text-subtle">
            {' · '}
            {item.quantity || (grams ? `${grams}g` : '—')}
          </span>
        )}
      </span>
      {editable && (
        <span className="flex items-center gap-1 shrink-0">
          {/* Width on the wrapper, not the input: `Input`'s base is `w-full`
              and `cn` doesn't resolve Tailwind conflicts, so a width passed in
              here would be ignored — which is how a set row shipped three
              times at the wrong size. */}
          <span className="w-20">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="5"
              aria-label={`Grams of ${item.name}`}
              value={value}
              onChange={onChange}
              className="text-center px-1"
            />
          </span>
          <span className="text-xs text-subtle">g</span>
        </span>
      )}
      <span className="text-xs text-muted tabular-nums shrink-0 w-16 text-right">
        {Math.round(shown.kcal)} kcal
      </span>
    </li>
  )
}

/**
 * Everything behind a logged meal, and the amounts made correctable.
 *
 * One sheet for the Fuel page and the coach thread, because "what was actually
 * in that" and "that portion was wrong" are the same visit: he taps the meal to
 * see the breakdown, and the reason he wanted the breakdown is usually that one
 * line of it is wrong.
 *
 * Read-only when no `onSave` is given — a meal on a past day is history, and
 * the write path here only reaches today's log.
 */
export default function MealDetailSheet({
  open,
  onClose,
  entry,
  onSave,
  onDelete,
  onSaveToLibrary,
  saved,
  startInEdit = false,
  note,
}) {
  const [editing, setEditing] = useState(false)
  const [amounts, setAmounts] = useState([])
  const [macros, setMacros] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open || !entry) return
    setEditing(startInEdit && !!onSave)
    setAmounts((entry.items || []).map((item) => itemGrams(item) ?? ''))
    setMacros({
      kcal: Math.round(entry.kcal ?? 0),
      protein: Math.round((entry.protein ?? 0) * 10) / 10,
      carbs: Math.round((entry.carbs ?? 0) * 10) / 10,
      fat: Math.round((entry.fat ?? 0) * 10) / 10,
    })
    setBusy(false)
    setConfirmingDelete(false)
  }, [open, entry, startInEdit, onSave])

  // Guarded on the props, not on the state copied from them: `macros` outlives
  // a close, and the children below are built before `Sheet` can decide to
  // render nothing. Reading `entry.items` off null here is what white-screened
  // the save sheet.
  if (!open || !entry || !macros) return null

  const weighed = hasWeighedItems(entry)
  const items = entry.items || []
  const editedItems = items.map((item, i) => resizeItem(item, amounts[i]))
  const stored = {
    kcal: entry.kcal ?? 0,
    protein: entry.protein ?? 0,
    carbs: entry.carbs ?? 0,
    fat: entry.fat ?? 0,
  }
  const totals = editing ? (weighed ? totalsFromItems(editedItems) : macros) : stored
  const confidence = entry.confidence ? CONFIDENCE_COPY[entry.confidence] : null
  const loggedAt = entry.loggedAt ? new Date(entry.loggedAt) : null

  async function handleSave() {
    setBusy(true)
    try {
      await onSave(
        weighed ? entryWithPortions(entry, amounts) : entryWithMacros(entry, macros)
      )
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const description = [
    loggedAt && `Logged ${loggedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    entry.mealType,
    entry.editedAt && 'edited',
  ]
    .filter(Boolean)
    .join(' · ')

  // A read-only sheet has nothing to put in a footer, and an empty one is worse
  // than none: it renders as a bar of dead space under the content that looks
  // like controls that failed to load.
  const hasActions = !!(onSave || onDelete || onSaveToLibrary)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry.label}
      description={description || undefined}
      footer={
        !hasActions ? undefined : editing ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button className="flex-1" icon={Check} onClick={handleSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            {onDelete && (
              <Button
                variant={confirmingDelete ? 'danger' : 'dangerGhost'}
                icon={Trash2}
                onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
                aria-label={confirmingDelete ? 'Confirm delete' : `Delete ${entry.label}`}
                className="shrink-0"
              >
                {confirmingDelete ? 'Sure?' : ''}
              </Button>
            )}
            {onSaveToLibrary && (
              <Button
                variant="secondary"
                icon={saved ? BookmarkCheck : Bookmark}
                onClick={onSaveToLibrary}
                aria-label={
                  saved
                    ? `${entry.label} is in your library — save again`
                    : `Save ${entry.label} to library`
                }
                className={cn('shrink-0 px-3', saved && 'text-brand')}
              />
            )}
            {onSave && (
              <Button fullWidth icon={Pencil} onClick={() => setEditing(true)}>
                Edit portions
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-4">
        {note && <p className="text-xs text-muted">{note}</p>}

        {(confidence || entry.source === 'photo' || entry.editedAt) && (
          <div className="flex flex-wrap gap-1.5">
            {entry.source === 'photo' && (
              <Badge tone="neutral" size="xs" icon={Camera}>
                Photo
              </Badge>
            )}
            {confidence && !entry.editedAt && (
              <Badge tone={confidence.tone} size="xs">
                {confidence.label}
              </Badge>
            )}
            {/* A corrected meal is no longer the estimator's guess, so its old
                confidence badge would be claiming something about numbers he
                typed himself. */}
            {entry.editedAt && (
              <Badge tone="success" size="xs">
                Portions corrected
              </Badge>
            )}
          </div>
        )}

        <Totals totals={totals} was={editing ? stored : null} />

        {items.length > 0 && (
          <div>
            <CardLabel>{editing ? 'How much of each?' : 'Breakdown'}</CardLabel>
            <ul className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <ItemRow
                  key={`${item.name}-${i}`}
                  item={item}
                  shown={editedItems[i]}
                  editable={editing && weighed && itemGrams(item) !== null}
                  value={amounts[i]}
                  onChange={(e) => {
                    const next = [...amounts]
                    next[i] = e.target.value
                    setAmounts(next)
                  }}
                />
              ))}
            </ul>
          </div>
        )}

        {editing && !weighed && (
          <div>
            <CardLabel>Totals</CardLabel>
            <p className="text-xs text-subtle mt-1">
              This meal was logged without weighed items, so there is nothing to resize — correct
              the totals instead.
            </p>
            <div className="grid grid-cols-4 gap-2 mt-2">
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
          </div>
        )}

        {entry.assumptions?.length > 0 && (
          <div>
            <CardLabel>What was assumed</CardLabel>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              {entry.assumptions.map((a) => (
                <li key={a} className="text-xs text-muted">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
