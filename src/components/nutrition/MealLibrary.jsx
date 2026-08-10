import { useEffect, useMemo, useState } from 'react'
import { Search, BookMarked, Pencil, Plus, Check, X } from 'lucide-react'
import { Card, Button, Badge, Input, EmptyState, Skeleton } from '../ui'
import { searchSavedMeals } from '../../lib/savedMeals'
import LogSavedMealSheet from './LogSavedMealSheet'
import SaveMealSheet from './SaveMealSheet'

/**
 * The meal library.
 *
 * Everything he eats often, logged without a model in the loop. The estimate
 * behind a saved meal was checked once, when it was saved; re-estimating the
 * same bowl of oats every morning only introduces a chance for the number to
 * come back different.
 *
 * Search covers names and the itemised breakdown — see `searchSavedMeals`.
 */
export default function MealLibrary({ meals, loading, onLog, onUpdate, onDelete }) {
  const [query, setQuery] = useState('')
  const [logging, setLogging] = useState(null)
  const [editing, setEditing] = useState(null)
  const [justLogged, setJustLogged] = useState(null)

  const results = useMemo(() => searchSavedMeals(meals, query), [meals, query])

  // The confirmation is the only signal that a tap landed — the entry itself
  // appears on the Today tab, which isn't on screen when it happens.
  useEffect(() => {
    if (!justLogged) return
    const timer = setTimeout(() => setJustLogged(null), 3000)
    return () => clearTimeout(timer)
  }, [justLogged])

  async function handleLog(meal, options) {
    await onLog(meal, options)
    setJustLogged(meal.name)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" rounded="rounded-2xl" />
        ))}
      </div>
    )
  }

  if (!meals.length) {
    return (
      <EmptyState
        icon={BookMarked}
        title="No saved meals yet"
        message="Log a meal, then tap the bookmark on its card to keep it here. Anything saved is one tap to log again."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${meals.length} saved meal${meals.length === 1 ? '' : 's'}`}
          aria-label="Search saved meals"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-subtle hover:text-text hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {justLogged && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success-subtle border border-success-border">
          <Check className="w-4 h-4 text-success-strong shrink-0" aria-hidden="true" />
          <output className="text-xs text-success-strong">{justLogged} added to today.</output>
        </div>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches"
          message={`No saved meal called “${query}”. Log it once and save it, and it will be here next time.`}
        />
      ) : (
        <div className="space-y-2">
          {results.map((meal) => (
            <Card key={meal.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLogging(meal)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-text">{meal.name}</p>
                  {meal.mealType && (
                    <Badge tone="neutral" size="xs">
                      {meal.mealType}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted tabular-nums">
                  <span>{Math.round(meal.kcal)} kcal</span>
                  <span>{Math.round(meal.protein)}g P</span>
                  <span>{Math.round(meal.carbs)}g C</span>
                  <span>{Math.round(meal.fat)}g F</span>
                </div>
                {meal.useCount > 0 && (
                  <p className="text-xs text-subtle mt-1">Logged {meal.useCount}×</p>
                )}
              </button>

              <Button
                variant="ghost"
                size="xs"
                icon={Pencil}
                aria-label={`Edit ${meal.name}`}
                onClick={() => setEditing(meal)}
                className="shrink-0 text-subtle hover:text-text"
              />
              <Button
                size="sm"
                icon={Plus}
                onClick={() => setLogging(meal)}
                className="shrink-0"
              >
                Log
              </Button>
            </Card>
          ))}
        </div>
      )}

      <LogSavedMealSheet
        open={!!logging}
        meal={logging}
        onClose={() => setLogging(null)}
        onLog={handleLog}
      />

      <SaveMealSheet
        open={!!editing}
        mode="edit"
        draft={editing}
        onClose={() => setEditing(null)}
        onSave={async ({ name, kcal, protein, carbs, fat }) => {
          await onUpdate(editing.id, { name, kcal, protein, carbs, fat })
        }}
        onDelete={async () => {
          await onDelete(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}
