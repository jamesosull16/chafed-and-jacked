import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { onSnapshot, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import {
  ChevronLeft,
  Camera,
  Sparkles,
  Trash2,
  Plus,
  X,
  ImageOff,
  BookMarked,
  Bookmark,
  BookmarkCheck,
  Utensils,
  Calculator,
  ListPlus,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useWorkout } from '../hooks/useWorkout'
import { useStrengthBlock } from '../hooks/useStrengthBlock'
import { assessLogCoverage } from '../lib/logCompleteness'
import { useFirestore, formatLocalDate } from '../hooks/useFirestore'
import { useSavedMeals } from '../hooks/useSavedMeals'
import { getNutritionAdvice } from '../lib/nutritionAdvice'
import { calculateAge } from '../lib/bodyMetrics'
import {
  prepareImage,
  estimateMeal,
  estimateToEntry,
  CONFIDENCE_COPY,
} from '../lib/mealEstimation'
import { entryToSavedMeal, savedMealToEntry } from '../lib/savedMeals'
import {
  Card,
  CardLabel,
  Button,
  Badge,
  Field,
  Input,
  Textarea,
  ProgressBar,
  SkeletonPage,
  Sheet,
  Tabs,
  EmptyState,
} from '../components/ui'
import MealLibrary from '../components/nutrition/MealLibrary'
import SaveMealSheet from '../components/nutrition/SaveMealSheet'
import MealDetailSheet from '../components/nutrition/MealDetailSheet'
import IngredientEditor from '../components/nutrition/IngredientEditor'
import { blankRow, resolvedItems, buildRecipeMeal, recipeToSavedMeal } from '../lib/recipe'
import { replaceLogEntry, moveLogEntry, findEntryById } from '../lib/nutritionLog'
import { cn } from '../components/ui/cn'

const MACROS = [
  { key: 'kcal', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

function sumEntries(entries = []) {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    return d
  })
}

/**
 * The camera / describe flow.
 *
 * Deliberately two-step: estimate, then confirm. Portion estimation from a
 * photo is genuinely uncertain, and silently writing a guess into the day's
 * totals would quietly corrupt the data the whole block is steered by. The
 * itemised breakdown and stated assumptions are what make the number
 * reviewable rather than magic.
 */
function EstimateSheet({ open, onClose, onSave }) {
  const fileRef = useRef(null)
  const [description, setDescription] = useState('')
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [edited, setEdited] = useState(null)
  const [keep, setKeep] = useState(false)
  const [libraryName, setLibraryName] = useState('')
  const keepId = useId()

  function reset() {
    setDescription('')
    setImage(null)
    setEstimate(null)
    setEdited(null)
    setError('')
    setBusy(false)
    setKeep(false)
    setLibraryName('')
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      setImage(await prepareImage(file))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleEstimate() {
    setBusy(true)
    setError('')
    try {
      const result = await estimateMeal({
        description: description.trim() || undefined,
        imageBase64: image?.base64,
        mediaType: image?.mediaType,
      })
      setEstimate(result)
      setEdited({
        kcal: result.kcal,
        protein: result.protein_g,
        carbs: result.carbs_g,
        fat: result.fat_g,
      })
      setLibraryName(
        description.trim() || result.items.map((i) => i.name).join(', ').slice(0, 80)
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleConfirm() {
    const entry = estimateToEntry(
      {
        ...estimate,
        kcal: Number(edited.kcal) || 0,
        protein_g: Number(edited.protein) || 0,
        carbs_g: Number(edited.carbs) || 0,
        fat_g: Number(edited.fat) || 0,
      },
      { description, source: image ? 'photo' : 'text' }
    )
    onSave(entry, keep && libraryName.trim() ? { name: libraryName } : null)
    reset()
    onClose()
  }

  const confidence = estimate ? CONFIDENCE_COPY[estimate.confidence] : null

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={estimate ? 'Check the estimate' : 'Log a meal'}
      description={
        estimate
          ? 'Adjust anything that looks off before saving.'
          : 'Describe it, photograph it, or both.'
      }
      footer={
        estimate ? (
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setEstimate(null)}>
              Back
            </Button>
            <Button fullWidth onClick={handleConfirm}>
              Save meal
            </Button>
          </div>
        ) : (
          <Button
            fullWidth
            size="lg"
            icon={Sparkles}
            onClick={handleEstimate}
            disabled={busy || (!description.trim() && !image)}
          >
            {busy ? 'Estimating…' : 'Estimate macros'}
          </Button>
        )
      }
    >
      {!estimate ? (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="sr-only"
          />

          {image ? (
            <div className="relative">
              <img
                src={image.previewUrl}
                alt="The meal you are logging"
                className="w-full rounded-2xl border border-border-default"
              />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove photo"
                className="absolute top-2 right-2 p-2 rounded-xl bg-text/60 text-inverse hover:bg-text/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-border-strong text-muted hover:border-brand hover:text-brand transition-colors"
            >
              <Camera className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm font-medium">Take or choose a photo</span>
              <span className="text-xs text-subtle">Optional — text alone works too</span>
            </button>
          )}

          <Field
            label="What did you eat?"
            hint="Portions help most — “two eggs and 100g oats” beats “breakfast”."
          >
            {({ id, ...a11y }) => (
              <Textarea
                id={id}
                {...a11y}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. chicken thigh, rice, and a big spoon of peanut butter"
              />
            )}
          </Field>

          {error && (
            <div className="flex gap-2 p-3 rounded-xl bg-danger-subtle border border-danger-border">
              <ImageOff className="w-4 h-4 text-danger-strong shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-danger-strong">{error}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone={confidence.tone}>{confidence.label}</Badge>
            {estimate.grounded && <Badge tone="neutral">USDA-matched</Badge>}
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
                    value={edited[m.key]}
                    onChange={(e) => setEdited({ ...edited, [m.key]: e.target.value })}
                    className="text-center px-1"
                  />
                )}
              </Field>
            ))}
          </div>

          <div>
            <CardLabel>Breakdown</CardLabel>
            <ul className="mt-2 space-y-1.5">
              {estimate.items.map((item, i) => (
                <li key={`${item.name}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-text min-w-0">
                    {item.name}
                    <span className="text-subtle"> · {item.quantity || `${item.grams}g`}</span>
                    {item.source === 'usda' && (
                      <span className="text-subtle text-xs"> · USDA</span>
                    )}
                  </span>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {Math.round(item.kcal)} kcal
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Asked here, at the one moment the numbers have just been checked
              and the meal is fresh in mind. A prompt a day later is a prompt
              about a meal he can no longer verify. */}
          <div className="rounded-2xl border border-border-default p-3 space-y-2.5">
            <label htmlFor={keepId} className="flex items-start gap-2.5 cursor-pointer">
              <input
                id={keepId}
                type="checkbox"
                checked={keep}
                onChange={(e) => setKeep(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">Save to library</span>
                <span className="block text-xs text-muted">
                  Eat this often? Keep it and log it in a tap next time.
                </span>
              </span>
            </label>

            {keep && (
              <Field label="Name it" hint="Short and searchable.">
                {({ id, ...a11y }) => (
                  <Input
                    id={id}
                    {...a11y}
                    value={libraryName}
                    onChange={(e) => setLibraryName(e.target.value)}
                    placeholder="e.g. Post-lift bowl"
                  />
                )}
              </Field>
            )}
          </div>

          {estimate.assumptions.length > 0 && (
            <div>
              <CardLabel>Assumptions</CardLabel>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {estimate.assumptions.map((a) => (
                  <li key={a} className="text-xs text-muted">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

/**
 * Enter a meal by hand.
 *
 * Two ways in, because two different things are known. Off a wrapper, the
 * macros are the fact and typing four numbers is the fastest route to them.
 * Out of a pan, the fact is what went in it — "2 cans of 15 oz garbanzo beans"
 * — and the macros are what has to be worked out, along with the fact that the
 * pan holds four dinners and only one of them is tonight.
 */
function ManualEntryCard({ onAdd }) {
  const [mode, setMode] = useState('totals')
  const [fields, setFields] = useState({ label: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [rows, setRows] = useState([blankRow()])
  const [servings, setServings] = useState(1)
  const [eaten, setEaten] = useState(1)
  const [keep, setKeep] = useState(false)
  const keepId = useId()

  const byIngredients = mode === 'ingredients'
  const items = resolvedItems(rows)
  const complete = byIngredients
    ? items.length > 0
    : ['kcal', 'protein', 'carbs', 'fat'].every((k) => fields[k] !== '')
  // A saved meal is found by name, so an unnamed one is unfindable.
  const canKeep = !!fields.label.trim()

  function reset() {
    setFields({ label: '', kcal: '', protein: '', carbs: '', fat: '' })
    setRows([blankRow()])
    setServings(1)
    setEaten(1)
    setKeep(false)
  }

  function submit() {
    const label = fields.label.trim() || 'Meal'
    const base = { id: crypto.randomUUID(), loggedAt: new Date().toISOString(), source: 'manual' }

    const entry = byIngredients
      ? buildRecipeMeal({ base, label, items, servings, eaten })
      : {
          ...base,
          label,
          kcal: Number(fields.kcal) || 0,
          protein: Number(fields.protein) || 0,
          carbs: Number(fields.carbs) || 0,
          fat: Number(fields.fat) || 0,
        }

    // The library keeps one serving of the recipe, not the plate — so a batch
    // eaten two servings at a time is still logged one serving at a time
    // afterwards. `entryToSavedMeal` cannot work that out from the entry alone
    // once the plate is no longer a single serving, so it is done here where
    // the batch is still in hand.
    const keeping = keep && canKeep
    const saved =
      keeping && byIngredients
        ? { meal: recipeToSavedMeal({ name: label, items, servings }) }
        : keeping
          ? { name: label }
          : null

    onAdd(entry, saved)
    reset()
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardLabel>Or enter it manually</CardLabel>
        <Button
          variant="ghost"
          size="xs"
          icon={byIngredients ? Calculator : ListPlus}
          onClick={() => setMode(byIngredients ? 'totals' : 'ingredients')}
        >
          {byIngredients ? 'Just the totals' : 'By ingredient'}
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        <Input
          aria-label="Meal label"
          placeholder={byIngredients ? 'Name it — “Chickpea traybake”' : 'Label (optional)'}
          value={fields.label}
          onChange={(e) => setFields({ ...fields, label: e.target.value })}
        />
        {byIngredients ? (
          <IngredientEditor
            rows={rows}
            onRowsChange={setRows}
            servings={servings}
            onServingsChange={setServings}
            eaten={eaten}
            onEatenChange={setEaten}
            context={fields.label}
          />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {MACROS.map((m) => (
              <Input
                key={m.key}
                type="number"
                inputMode="decimal"
                aria-label={m.label}
                placeholder={m.label === 'Calories' ? 'kcal' : m.label}
                value={fields[m.key]}
                onChange={(e) => setFields({ ...fields, [m.key]: e.target.value })}
                className="text-center px-1"
              />
            ))}
          </div>
        )}
        <label
          htmlFor={keepId}
          className={cn(
            'flex items-center gap-2.5 text-sm',
            canKeep ? 'text-text cursor-pointer' : 'text-subtle cursor-not-allowed'
          )}
        >
          <input
            id={keepId}
            type="checkbox"
            checked={keep && canKeep}
            disabled={!canKeep}
            onChange={(e) => setKeep(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          Save to library{!canKeep && <span className="text-xs">— needs a label</span>}
        </label>
        <Button variant="secondary" fullWidth icon={Plus} onClick={submit} disabled={!complete}>
          Add
        </Button>
      </div>
    </Card>
  )
}

export default function NutritionTracker() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const viewDate = searchParams.get('date')

  const { user, userProfile } = useAuth()
  const { isStrength, strength } = useAppMode()
  const { getDocument, getCollection, userRef } = useFirestore()
  const library = useSavedMeals()

  // Both hooks run; only the active mode's numbers are used. They read
  // different collections, so there is no wasted duplicate work.
  const running = useWorkout()
  const block = useStrengthBlock()

  const [latest, setLatest] = useState({ weight: null, bodyFatPct: null })
  const [todayLog, setTodayLog] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [viewingDay, setViewingDay] = useState(null)
  const [tab, setTab] = useState('today')
  /** The logged entry queued for naming into the library, if any. */
  const [savingEntry, setSavingEntry] = useState(null)
  /** The logged entry whose breakdown is open, if any. */
  const [openEntry, setOpenEntry] = useState(null)

  const todayId = formatLocalDate()
  const isViewingPast = !!viewDate && viewDate !== todayId

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const metrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
      setLatest({
        weight: metrics[0]?.weight ?? userProfile?.onboarding?.initialWeight ?? null,
        bodyFatPct: metrics[0]?.bodyFatPct ?? userProfile?.onboarding?.initialBodyFat ?? null,
      })

      const days = await Promise.all(
        last7Days().map(async (d) => {
          const dateId = formatLocalDate(d)
          return { date: d, dateId, log: await getDocument(`nutritionLogs/${dateId}`) }
        })
      )
      setHistory(days)
    } catch {
      // Panels degrade to their empty states.
    }
    setLoading(false)
    // No `todayId` — today's log has its own subscription below, and this
    // fetch now only seeds the trailing week.
  }, [user, getCollection, getDocument, userProfile])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Today's log is subscribed to, not fetched.
   *
   * This document has two writers — this page and the Coach's cloud function —
   * and a one-shot read at mount is how a meal logged in chat stays invisible
   * here until the page is remounted. Which is exactly what it looked like:
   * "nothing was logged on the fuel page", for an entry that was.
   */
  useEffect(() => {
    const ref = userRef(`nutritionLogs/${todayId}`)
    if (!ref) return
    return onSnapshot(
      ref,
      (snap) => setTodayLog(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => {
        // Totals fall back to their empty state rather than a broken page.
      }
    )
  }, [userRef, todayId])

  useEffect(() => {
    if (!isViewingPast) {
      setViewingDay(null)
      return
    }
    getDocument(`nutritionLogs/${viewDate}`).then(setViewingDay)
  }, [isViewingPast, viewDate, getDocument])

  // Memoised for the same reason CoachChat memoises its copy: the targets
  // derived below are written with every log, so they have to be stable.
  const advice = useMemo(
    () =>
      latest.weight
        ? getNutritionAdvice({
            weightLbs: latest.weight,
            heightInches: userProfile?.profile?.heightInches || 0,
            ageYears: calculateAge(userProfile?.profile?.birthday),
            sex: userProfile?.profile?.biologicalSex || 'male',
            currentBodyFatPct: latest.bodyFatPct,
            // Both halves, always. Lifting stats still come from whichever hook
            // owns the programme, but runs are read unconditionally — gating
            // them on `isStrength` is what made a logged run invisible here.
            todayLiftStats: isStrength ? block.todayLiftStats : running.todayLiftStats,
            strength: { ...strength, isTrainingDay: block.isTrainingDay },
            dailyMiles: running.todayMiles || 0,
            weeklyMiles: isStrength ? running.weekDailySum : running.currentMileage || 0,
            trainingPhase: isStrength ? 'build' : running.weekInfo?.type || 'build',
            todayRuns: running.todayRuns,
            vo2max: userProfile?.profile?.vo2max || null,
          })
        : null,
    [
      latest,
      isStrength,
      userProfile,
      strength,
      block.todayLiftStats,
      block.isTrainingDay,
      running.todayLiftStats,
      running.currentMileage,
      running.weekInfo,
      running.todayMiles,
      running.weekDailySum,
      running.todayRuns,
    ]
  )

  // Memoised because `mutateEntries` writes these alongside the entries, and a
  // fresh object every render would rebuild the callback on every render too.
  const targets = useMemo(
    () =>
      advice
        ? {
            kcal: advice.calories.target,
            protein: advice.protein.grams,
            carbs: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2),
            fat: advice.fat.grams,
          }
        : null,
    [advice]
  )

  // Memoised because the coverage below depends on it, and a fresh [] every
  // render would recompute the whole week on every keystroke.
  const entries = useMemo(() => todayLog?.entries || [], [todayLog])
  const consumed = sumEntries(entries)

  /**
   * How much of the week the log can actually speak to.
   *
   * Today is taken from the live subscription rather than the mount-time
   * fetch, or the current day would read as a gap until the page remounted.
   * BMR comes from the advice so the implausible band exists at all — without
   * it every day with a single entry counts as logged.
   */
  const coverage = useMemo(
    () =>
      assessLogCoverage(
        history.map((day) => ({
          dateId: day.dateId,
          log: day.dateId === todayId ? { entries } : day.log,
        })),
        { bmr: advice?.bmr || null, todayId }
      ),
    [history, todayId, entries, advice]
  )

  /**
   * Add or remove one entry, as a field transform rather than a whole array.
   *
   * This document has two writers. The previous version wrote back an `entries`
   * array built from whatever the page had loaded at mount, so a meal the Coach
   * logged while the page was open was silently erased by the next entry added
   * here — a lost update with no error and no trace of what went missing.
   *
   * `arrayUnion` / `arrayRemove` are applied server-side against the current
   * document, so the two writers merge instead of overwriting. Chosen over a
   * transaction because a transaction needs the network and this is a phone in
   * a gym: transforms queue offline like any other write.
   *
   * The subscription above delivers the result; nothing is set locally.
   */
  const mutateEntry = useCallback(
    async (transform) => {
      const ref = userRef(`nutritionLogs/${todayId}`)
      if (!ref) return
      await setDoc(
        ref,
        {
          date: todayId,
          entries: transform,
          // Only once we have them. Writing a null over a stored target set is
          // how a day loses the numbers it was actually judged against.
          ...(targets && { targets }),
        },
        { merge: true }
      )
    },
    [userRef, todayId, targets]
  )

  const removeEntry = (entry) => mutateEntry(arrayRemove(entry))

  /**
   * Log an entry, and optionally keep the meal behind it.
   *
   * The library write is awaited after the log write rather than beside it: the
   * meal has to reach today either way, and a failed save is a meal he can
   * bookmark again from its card. A failed log is a day that silently misses a
   * meal.
   */
  async function addEntry(entry, keep) {
    await mutateEntry(arrayUnion(entry))
    // `keep.meal` is a serving the caller already worked out — a recipe knows
    // what one of itself is, which an entry holding two servings of it does
    // not. Everything else is derived from the entry as eaten.
    if (keep?.meal) await library.saveMeal(keep.meal)
    else if (keep?.name) await library.saveMeal(entryToSavedMeal(entry, { name: keep.name }))
  }

  /**
   * Save a corrected entry over the one it came from.
   *
   * `previous` is re-read from the live log rather than taken from the sheet,
   * because `arrayRemove` matches on the whole object: if the Coach corrected
   * this meal while the sheet was open, the copy the sheet opened with no
   * longer exists in the document and removing it would quietly do nothing,
   * leaving both versions on the day.
   */
  async function saveEntryEdit(next) {
    const previous = findEntryById(entries, next.id)
    if (!previous) return
    await replaceLogEntry(userRef(`nutritionLogs/${todayId}`), {
      previous,
      next,
      dateId: todayId,
      targets,
    })
  }

  /**
   * Put a meal on the day it was actually eaten.
   *
   * The stored copy is passed, not the one captured when the sheet opened —
   * `arrayRemove` matches whole objects, and the Coach may have corrected this
   * entry while the sheet was sitting open. Removing a stale copy would leave
   * the meal on both days.
   *
   * Today's list needs no refresh: it is a live subscription, so the entry
   * disappears on its own the moment the batch lands.
   */
  async function moveEntryToDay(entry, toDateId) {
    const stored = findEntryById(entries, entry.id)
    if (!stored) return
    await moveLogEntry({
      fromRef: userRef(`nutritionLogs/${todayId}`),
      toRef: userRef(`nutritionLogs/${toDateId}`),
      entry: stored,
      toDateId,
    })
    setOpenEntry(null)
    // The week strip and the coverage summary both read the fetched history,
    // which now has a meal on a day it did not have one on.
    await load()
  }

  /** Log a saved meal at the confirmed quantity, and count the use. */
  async function logSavedMeal(meal, { quantity, macros }) {
    const entry = savedMealToEntry(meal, { quantity, macros, id: crypto.randomUUID() })
    await mutateEntry(arrayUnion(entry))
    await library.markUsed(meal.id)
  }

  if (loading) return <SkeletonPage cards={3} />

  if (isViewingPast) {
    const pastEntries = viewingDay?.entries || []
    const pastConsumed = sumEntries(pastEntries)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => navigate('/nutrition')}
            aria-label="Back to today"
            className="p-2 -ml-2 rounded-xl text-muted hover:text-text hover:bg-surface"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-text tracking-tight">
            {new Date(`${viewDate}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </h1>
        </div>

        {viewingDay?.targets && (
          <Card>
            <div className="grid grid-cols-4 gap-3">
              {MACROS.map((m) => (
                <div key={m.key}>
                  <p className="text-xs text-muted">{m.label}</p>
                  <p className="text-base font-semibold text-text tabular-nums">
                    {Math.round(pastConsumed[m.key])}
                    {m.unit}
                  </p>
                  <p className="text-xs text-subtle tabular-nums">
                    / {Math.round(viewingDay.targets[m.key] || 0)}
                    {m.unit}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {pastEntries.length === 0 ? (
          <EmptyState title="Nothing logged" message="No meals recorded on this day." />
        ) : (
          pastEntries.map((e) => (
            <EntryCard key={e.id} entry={e} onOpen={() => setOpenEntry(e)} />
          ))
        )}

        {/* A past day is edited the same way today is — the day's document is
            just named after a different date. It has no live subscription, so
            the re-read is what puts the corrected numbers back on screen. */}
        <MealDetailSheet
          open={!!openEntry}
          entry={(openEntry && findEntryById(pastEntries, openEntry.id)) || openEntry}
          onClose={() => setOpenEntry(null)}
          onSave={async (next) => {
            const previous = findEntryById(pastEntries, next.id)
            if (!previous) return
            await replaceLogEntry(userRef(`nutritionLogs/${viewDate}`), {
              previous,
              next,
              dateId: viewDate,
            })
            setViewingDay(await getDocument(`nutritionLogs/${viewDate}`))
          }}
          onPeekDay={async (d) => (await getDocument(`nutritionLogs/${d}`))?.entries || []}
          onMoveDay={async (toDateId) => {
            const stored = findEntryById(pastEntries, openEntry.id)
            if (!stored) return
            await moveLogEntry({
              fromRef: userRef(`nutritionLogs/${viewDate}`),
              toRef: userRef(`nutritionLogs/${toDateId}`),
              entry: stored,
              toDateId,
            })
            setOpenEntry(null)
            // No live subscription on a past day — the re-read is what takes
            // the meal off the screen it was just moved from.
            setViewingDay(await getDocument(`nutritionLogs/${viewDate}`))
            await load()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back to dashboard"
          className="p-2 -ml-2 rounded-xl text-muted hover:text-text hover:bg-surface"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-text tracking-tight">Fuel</h1>
        {advice?.surplus ? (
          <Badge tone="brand" className="ml-auto">
            +{advice.surplus} kcal
          </Badge>
        ) : advice?.deficit ? (
          <Badge tone="warning" className="ml-auto">
            −{advice.deficit} kcal
          </Badge>
        ) : null}
      </div>

      <Tabs
        ariaLabel="Fuel views"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'today', label: 'Today', icon: Utensils },
          { id: 'library', label: 'Library', icon: BookMarked },
        ]}
      />

      {tab === 'library' ? (
        <MealLibrary
          meals={library.savedMeals}
          loading={library.loading}
          onLog={logSavedMeal}
          onUpdate={library.updateMeal}
          onDelete={library.deleteMeal}
        />
      ) : (
        <>
          {targets ? (
            <Card>
              <CardLabel>Today</CardLabel>
              <div className="grid grid-cols-4 gap-3 mt-3">
                {MACROS.map((m) => {
                  const target = targets[m.key]
                  const current = consumed[m.key]
                  const over = current > target
                  return (
                    <div key={m.key}>
                      <p className="text-xs text-muted truncate">{m.label}</p>
                      <p
                        className={cn(
                          'text-lg font-semibold tabular-nums mt-0.5',
                          over ? 'text-warning-strong' : 'text-text'
                        )}
                      >
                        {Math.round(current)}
                        {m.unit}
                      </p>
                      <p className="text-xs text-subtle tabular-nums">
                        / {Math.round(target)}
                        {m.unit}
                      </p>
                      <ProgressBar
                        value={current}
                        max={target}
                        size="sm"
                        className="mt-1.5"
                        label={`${m.label}: ${Math.round(current)} of ${Math.round(target)}`}
                      />
                    </div>
                  )
                })}
              </div>
              {advice?.calories.breakdown && (
                <p className="text-xs text-muted mt-3 pt-3 border-t border-border-default">
                  {advice.calories.breakdown} · {advice.carbs.guidance}
                </p>
              )}
            </Card>
          ) : (
            <Card to="/metrics">
              <p className="text-sm text-muted">Log your weight to get macro targets →</p>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" icon={Camera} onClick={() => setSheetOpen(true)}>
              Quick log
            </Button>
            <Button size="lg" variant="secondary" icon={Sparkles} onClick={() => navigate('/coach')}>
              Ask coach
            </Button>
          </div>

          <EstimateSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onSave={addEntry}
          />

          {entries.length > 0 && (
            <div className="space-y-2">
              <CardLabel className="px-1">Today&apos;s meals</CardLabel>
              {entries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onOpen={() => setOpenEntry(e)}
                  onDelete={() => removeEntry(e)}
                  onSave={() => setSavingEntry(e)}
                  saved={!!library.findByName(e.label)}
                />
              ))}
            </div>
          )}

          <ManualEntryCard onAdd={addEntry} />

          <Card>
            <div className="flex items-center justify-between gap-3 mb-3">
              <CardLabel>Last 7 days</CardLabel>
              <Badge
                tone={
                  coverage.unknown === 0 ? 'success' : coverage.coverage < 0.7 ? 'warning' : 'neutral'
                }
              >
                {coverage.known}/{coverage.total} logged
              </Badge>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {history.map((day, i) => {
                const isToday = day.dateId === todayId
                // Today comes from the live subscription; the fetched copy is a
                // mount-time snapshot and goes stale the moment anything is logged.
                const dayEntries = isToday ? entries : day.log?.entries || []
                const kcal = dayEntries.reduce((a, e) => a + (e.kcal || 0), 0)
                const target = (isToday ? targets?.kcal : day.log?.targets?.kcal) || 0
                const status = coverage.days[i]?.status || 'missing'

                return (
                  <button
                    key={day.dateId}
                    type="button"
                    // A gap day is the one most worth opening, and it used to be
                    // the only one that could not be. `!hasData` disabled exactly
                    // the days that needed filling in.
                    disabled={isToday}
                    onClick={() => navigate(`/nutrition?date=${day.dateId}`)}
                    title={
                      status === 'inProgress'
                        ? 'Today — still in progress'
                        : status === 'missing'
                        ? 'Nothing logged — tap to add it'
                        : status === 'implausible'
                          ? `Only ${Math.round(kcal)} kcal, below your resting metabolism — something is missing`
                          : undefined
                    }
                    className={cn(
                      'flex flex-col items-center py-2 rounded-xl border transition-colors min-h-14',
                      isToday
                        ? 'bg-brand-subtle border-brand-border'
                        : status === 'logged'
                          ? 'border-transparent hover:bg-surface'
                          : status === 'implausible'
                            ? 'bg-warning-subtle border-warning-border hover:bg-bg'
                            : status === 'inProgress'
                              ? 'border-transparent'
                              : 'border-dashed border-border-strong hover:bg-surface'
                    )}
                  >
                    <span
                      className={cn('text-xs font-medium', isToday ? 'text-brand' : 'text-muted')}
                    >
                      {day.date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                    </span>
                    <span
                      className={cn(
                        'text-xs tabular-nums mt-0.5',
                        status === 'logged' || status === 'inProgress' || isToday
                          ? 'text-text'
                          : 'text-warning-strong'
                      )}
                    >
                      {status === 'missing' ? '+' : Math.round(kcal)}
                    </span>
                    {target > 0 && status !== 'missing' && (
                      <span className="text-[10px] text-subtle tabular-nums">
                        /{Math.round(target)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-muted mt-3 leading-relaxed">{coverage.summary}</p>
            {coverage.unknown > 0 && (
              <p className="text-xs text-subtle mt-1.5 leading-relaxed">
                A day under your resting metabolism counts as a gap, not a light day. Until these
                are filled in, the weight trend has more to say about your intake than the log does.
              </p>
            )}
          </Card>
        </>
      )}

      {/* The live entry, not the one captured on tap, so the sheet follows a
          correction the Coach makes while it is open rather than showing a
          stale breakdown. */}
      <MealDetailSheet
        open={!!openEntry}
        entry={(openEntry && findEntryById(entries, openEntry.id)) || openEntry}
        onClose={() => setOpenEntry(null)}
        onSave={saveEntryEdit}
        onMoveDay={(toDateId) => moveEntryToDay(openEntry, toDateId)}
        onPeekDay={async (d) => (await getDocument(`nutritionLogs/${d}`))?.entries || []}
        onDelete={async () => {
          await removeEntry(findEntryById(entries, openEntry.id) || openEntry)
          setOpenEntry(null)
        }}
        onSaveToLibrary={() => {
          setSavingEntry(openEntry)
          setOpenEntry(null)
        }}
        saved={!!openEntry && !!library.findByName(openEntry.label)}
      />

      <SaveMealSheet
        open={!!savingEntry}
        draft={savingEntry}
        onClose={() => setSavingEntry(null)}
        isDuplicate={(name) => !!library.findByName(name)}
        onSave={async ({ name, kcal, protein, carbs, fat }) => {
          await library.saveMeal(
            entryToSavedMeal({ ...savingEntry, kcal, protein, carbs, fat }, { name })
          )
        }}
      />
    </div>
  )
}

function EntryCard({ entry, onOpen, onDelete, onSave, saved }) {
  const confidence = entry.confidence ? CONFIDENCE_COPY[entry.confidence] : null

  // The meal itself opens the breakdown; the bookmark and bin stay separate
  // controls beside it. A button around the whole card would have swallowed
  // them — nesting a button inside a button is invalid and the inner one stops
  // being reachable.
  const Body = onOpen ? 'button' : 'div'

  return (
    <Card className="flex items-start gap-3">
      <Body
        {...(onOpen && {
          type: 'button',
          onClick: onOpen,
          'aria-label': `${entry.label} — see the breakdown`,
        })}
        className={cn(
          'min-w-0 flex-1 text-left',
          onOpen && 'rounded-xl -m-1 p-1 transition-colors hover:bg-surface'
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-text">{entry.label}</p>
          {entry.source === 'photo' && (
            <Badge tone="neutral" size="xs" icon={Camera}>
              Photo
            </Badge>
          )}
          {confidence && entry.confidence !== 'high' && (
            <Badge tone={confidence.tone} size="xs">
              {confidence.label}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted tabular-nums">
          <span>{Math.round(entry.kcal)} kcal</span>
          <span>{Math.round(entry.protein)}g P</span>
          <span>{Math.round(entry.carbs)}g C</span>
          <span>{Math.round(entry.fat)}g F</span>
        </div>
        {entry.items?.length > 1 && (
          <p className="text-xs text-subtle mt-1 truncate">
            {entry.items.map((i) => i.name).join(' · ')}
          </p>
        )}
      </Body>
      {onSave && (
        <Button
          variant="ghost"
          size="xs"
          icon={saved ? BookmarkCheck : Bookmark}
          aria-label={saved ? `${entry.label} is in your library — save again` : `Save ${entry.label} to library`}
          onClick={onSave}
          className={cn('shrink-0', saved ? 'text-brand' : 'text-subtle hover:text-brand')}
        />
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="xs"
          icon={Trash2}
          aria-label={`Delete ${entry.label}`}
          onClick={onDelete}
          className="shrink-0 text-subtle hover:text-danger-strong"
        />
      )}
    </Card>
  )
}
