import { useEffect, useState } from 'react'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import { Sheet, Button, Field, Input, CardLabel } from '../ui'
import { libraryKey, normaliseName } from '../../lib/savedMeals'

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
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open || !draft) return
    setFields({
      name: normaliseName(draft.name || draft.label || ''),
      kcal: Math.round(draft.kcal ?? 0),
      protein: Math.round((draft.protein ?? 0) * 10) / 10,
      carbs: Math.round((draft.carbs ?? 0) * 10) / 10,
      fat: Math.round((draft.fat ?? 0) * 10) / 10,
    })
    setBusy(false)
    setConfirmingDelete(false)
  }, [open, draft])

  if (!fields) return null

  const name = normaliseName(fields.name, '')
  // Only a warning when it would land on a *different* meal — re-saving the
  // one being edited under its own name is not a collision.
  const collides =
    mode === 'create' && !!name && !!isDuplicate?.(name) && libraryKey(name) !== libraryKey(draft?.name)

  async function handleSave() {
    setBusy(true)
    try {
      await onSave({
        ...draft,
        name,
        kcal: Number(fields.kcal) || 0,
        protein: Number(fields.protein) || 0,
        carbs: Number(fields.carbs) || 0,
        fat: Number(fields.fat) || 0,
      })
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

        {draft.items?.length > 0 && (
          <p className="text-xs text-subtle">
            Keeping the breakdown: {draft.items.map((i) => i.name).join(' · ')}
          </p>
        )}
      </div>
    </Sheet>
  )
}
