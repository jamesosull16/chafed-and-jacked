import { useEffect, useState } from 'react'
import { Pencil, Check, Trash2, Bookmark, BookmarkCheck, Camera, ListPlus, CalendarDays } from 'lucide-react'
import { Sheet, Button, Badge, Field, Input, CardLabel } from '../ui'
import { cn } from '../ui/cn'
import { CONFIDENCE_COPY } from '../../lib/mealEstimation'
import { logDateIdFor } from '../../lib/nutritionLog'
import { formatLocalDate } from '../../lib/localDate'
import IngredientEditor from './IngredientEditor'
import {
  blankRow,
  rowsFromItems,
  resolvedItems,
  recipeFromEntry,
  buildRecipeMeal,
  mealWithMacros,
  normaliseServings,
} from '../../lib/recipe'

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

/** One line of the breakdown, as read rather than edited. */
function ItemRow({ item }) {
  return (
    <li className="flex items-center justify-between gap-3 min-h-8">
      <span className="text-sm text-text min-w-0 flex-1 truncate">
        {item.name}
        <span className="text-subtle">
          {' · '}
          {item.quantity || (item.grams > 0 ? `${item.grams}g` : '—')}
        </span>
      </span>
      <span className="text-xs text-muted tabular-nums shrink-0 w-16 text-right">
        {Math.round(item.kcal)} kcal
      </span>
    </li>
  )
}

/**
 * Everything behind a logged meal, and the ingredients made correctable.
 *
 * One sheet for the Fuel page and the coach thread, because "what was actually
 * in that" and "that portion was wrong" are the same visit: he taps the meal to
 * see the breakdown, and the reason he wanted the breakdown is usually that one
 * line of it is wrong.
 *
 * Editing runs through the same ingredient list that builds a meal in the first
 * place, so a card can gain an ingredient he forgot, lose one that was never
 * there, and be re-weighed — the three corrections that used to need a delete
 * and a re-log. A meal with no breakdown at all keeps the four-number path, and
 * can be broken into ingredients on demand.
 *
 * Read-only when no `onSave` is given — a meal on a past day reached through
 * the coach thread is history, and that write path only reaches today's log.
 *
 * `onMoveDay` adds the other correction the log could not make: putting a meal
 * on the day it was actually eaten. A meal that looks like it failed to log
 * gets logged again, and the second attempt lands on today — so the fix is a
 * move between two days, not an edit within one.
 */
/** "today", "yesterday", or a plain date — whichever reads fastest. */
function dayLabel(dateId) {
  if (!dateId) return 'that day'
  const today = formatLocalDate()
  if (dateId === today) return 'today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateId === formatLocalDate(yesterday)) return 'yesterday'
  return new Date(`${dateId}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function MealDetailSheet({
  open,
  onClose,
  entry,
  onSave,
  onDelete,
  onSaveToLibrary,
  onMoveDay,
  onPeekDay,
  saved,
  startInEdit = false,
  note,
}) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState([])
  const [servings, setServings] = useState(1)
  const [eaten, setEaten] = useState(1)
  const [macros, setMacros] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [movingTo, setMovingTo] = useState(null)
  const [dupe, setDupe] = useState(null)

  useEffect(() => {
    if (!open || !entry) return
    const recipe = recipeFromEntry(entry)
    setEditing(startInEdit && !!onSave)
    // Reset on every open, or the sheet reopens on a different meal still
    // offering to move it to the day the last one was being moved to.
    setMovingTo(null)
    setDupe(null)
    setRows(recipe.items.length ? rowsFromItems(recipe.items) : [])
    setServings(recipe.servings)
    setEaten(recipe.eaten)
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

  const items = entry.items || []
  const stored = {
    kcal: entry.kcal ?? 0,
    protein: entry.protein ?? 0,
    carbs: entry.carbs ?? 0,
    fat: entry.fat ?? 0,
  }

  // Ingredients are the edit path whenever there are any rows — which is
  // whenever the meal had a breakdown, or he asked for one.
  const byIngredients = rows.length > 0
  const edited = resolvedItems(rows)
  const factor = normaliseServings(eaten) / normaliseServings(servings)
  const next = byIngredients
    ? buildRecipeMeal({
        base: entry,
        items: edited,
        servings,
        eaten,
        editedAt: new Date().toISOString(),
      })
    : mealWithMacros(entry, macros)

  const totals = editing
    ? { kcal: next.kcal, protein: next.protein, carbs: next.carbs, fat: next.fat }
    : stored
  const confidence = entry.confidence ? CONFIDENCE_COPY[entry.confidence] : null
  const loggedAt = entry.loggedAt ? new Date(entry.loggedAt) : null
  const recipeServings = entry.recipe?.servings

  const currentDay = logDateIdFor(entry)
  const today = formatLocalDate()

  /**
   * Look for the same meal already sitting on the destination day.
   *
   * The scenario that produces a move is exactly the scenario that produces a
   * duplicate: a meal looks like it failed to log, so it gets logged again.
   * Without this, moving turns "a duplicate on the wrong day" into "a
   * duplicate on the right day", which is harder to spot and quietly doubles
   * that day's total. Matched on label and calories rather than id, because
   * the second attempt is a different entry, not the same one.
   */
  async function pickDay(dateId) {
    setMovingTo(dateId || null)
    setDupe(null)
    if (!dateId || dateId === currentDay || !onPeekDay) return
    try {
      const onDay = (await onPeekDay(dateId)) || []
      // Deliberately not excluding this entry's own id. If a meal has somehow
      // ended up on both days, the destination genuinely does already hold it
      // and the warning is the correct answer, not a false positive.
      const match = onDay.find(
        (e) =>
          String(e?.label || '').trim().toLowerCase() ===
            String(entry.label || '').trim().toLowerCase() &&
          Math.abs((e?.kcal || 0) - (entry.kcal || 0)) <= 25
      )
      if (match) setDupe(match)
    } catch {
      // A failed peek must not block the move — it is a warning, not a gate.
    }
  }

  async function handleMove() {
    if (!movingTo || movingTo === currentDay || busy) return
    setBusy(true)
    try {
      await onMoveDay(movingTo)
      setMovingTo(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    try {
      await onSave(next)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const description = [
    loggedAt && `Logged ${loggedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    // What the card is a portion of, where it is a portion of something —
    // otherwise the numbers look like they lost an ingredient.
    recipeServings &&
      `${entry.quantity || 1} of ${recipeServings} serving${recipeServings === 1 ? '' : 's'}`,
    entry.mealType,
    entry.editedAt && 'edited',
  ]
    .filter(Boolean)
    .join(' · ')

  // A read-only sheet has nothing to put in a footer, and an empty one is worse
  // than none: it renders as a bar of dead space under the content that looks
  // like controls that failed to load.
  const hasActions = !!(onSave || onDelete || onSaveToLibrary)
  // Saving an empty ingredient list would zero the meal. Whatever went wrong,
  // that is never the correction he meant to make.
  const canSave = !byIngredients || edited.length > 0

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
            <Button
              className="flex-1"
              icon={Check}
              onClick={handleSave}
              disabled={busy || !canSave}
            >
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

        {/* Moving a meal between days is a different operation from correcting
            its portions — a different write, over two documents — so it gets
            its own row rather than a field buried in the portions editor,
            where a stray tap would silently re-date a meal. Hidden while
            editing portions, so the sheet only ever offers one correction. */}
        {/* While portions are being edited the move is deliberately out of
            reach: editing is staged behind "Save changes" and moving writes
            immediately, and a date changed in a staged form that then silently
            does not save is worse than one extra tap. The line says where it
            went, because the coach thread opens this sheet already editing and
            nobody would think to press Cancel to find it. */}
        {onMoveDay && editing && (
          <p className="text-xs text-subtle">
            Eaten on a different day? Cancel this edit to move it.
          </p>
        )}

        {onMoveDay && !editing && (
          <div className="rounded-2xl border border-border-default p-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
              <CardLabel>Day eaten</CardLabel>
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                type="date"
                aria-label={`Day ${entry.label} was eaten`}
                value={movingTo ?? currentDay}
                // Food cannot be eaten in the future, and a fat-fingered year
                // is the easiest way to send a meal somewhere it will never be
                // found again.
                max={today}
                disabled={busy}
                onChange={(e) => pickDay(e.target.value)}
              />
              {movingTo && movingTo !== currentDay && (
                <Button onClick={handleMove} disabled={busy} className="shrink-0">
                  {busy ? 'Moving…' : 'Move'}
                </Button>
              )}
            </div>
            {movingTo && movingTo !== currentDay && (
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Moves the meal and its macros off {dayLabel(currentDay)} and onto{' '}
                {dayLabel(movingTo)}, keeping the time of day. Both days&apos; totals change.
              </p>
            )}
            {dupe && (
              <p className="text-xs text-warning-strong mt-2 leading-relaxed">
                {dayLabel(movingTo)} already has &ldquo;{dupe.label}&rdquo; at{' '}
                {Math.round(dupe.kcal || 0)} kcal. If that is the same meal, delete this one
                instead of moving it — moving would count it twice.
              </p>
            )}
          </div>
        )}

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

        {editing && byIngredients && (
          <div>
            <CardLabel>Ingredients</CardLabel>
            <div className="mt-2">
              <IngredientEditor
                rows={rows}
                onRowsChange={setRows}
                servings={servings}
                onServingsChange={setServings}
                eaten={eaten}
                onEatenChange={setEaten}
                context={entry.label}
                busy={busy}
              />
            </div>
            {factor !== 1 && (
              <p className="mt-2 text-[11px] text-subtle">
                The ingredients are the whole batch. This card holds what you ate.
              </p>
            )}
          </div>
        )}

        {editing && !byIngredients && (
          <div>
            <CardLabel>Totals</CardLabel>
            <p className="text-xs text-subtle mt-1">
              This meal was logged as four numbers, with nothing behind them to resize — correct
              the totals, or break it into ingredients.
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
            <Button
              variant="secondary"
              size="sm"
              icon={ListPlus}
              fullWidth
              className="mt-2"
              onClick={() => setRows([blankRow()])}
            >
              Break into ingredients
            </Button>
          </div>
        )}

        {!editing && items.length > 0 && (
          <div>
            <CardLabel>Breakdown</CardLabel>
            <ul className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <ItemRow key={`${item.name}-${i}`} item={item} />
              ))}
            </ul>
          </div>
        )}

        {!editing && entry.assumptions?.length > 0 && (
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
