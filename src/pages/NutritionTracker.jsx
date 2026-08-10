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
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useWorkout } from '../hooks/useWorkout'
import { useStrengthBlock } from '../hooks/useStrengthBlock'
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

function ManualEntryCard({ onAdd }) {
  const [fields, setFields] = useState({ label: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [keep, setKeep] = useState(false)
  const keepId = useId()
  const complete = ['kcal', 'protein', 'carbs', 'fat'].every((k) => fields[k] !== '')
  // A saved meal is found by name, so an unnamed one is unfindable.
  const canKeep = !!fields.label.trim()

  function submit() {
    onAdd(
      {
        id: crypto.randomUUID(),
        label: fields.label.trim() || 'Meal',
        kcal: Number(fields.kcal) || 0,
        protein: Number(fields.protein) || 0,
        carbs: Number(fields.carbs) || 0,
        fat: Number(fields.fat) || 0,
        loggedAt: new Date().toISOString(),
        source: 'manual',
      },
      keep && canKeep ? { name: fields.label } : null
    )
    setFields({ label: '', kcal: '', protein: '', carbs: '', fat: '' })
    setKeep(false)
  }

  return (
    <Card>
      <CardLabel>Or enter it manually</CardLabel>
      <div className="mt-3 space-y-2">
        <Input
          aria-label="Meal label"
          placeholder="Label (optional)"
          value={fields.label}
          onChange={(e) => setFields({ ...fields, label: e.target.value })}
        />
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
            mode: isStrength ? 'strength' : 'running',
            weightLbs: latest.weight,
            heightInches: userProfile?.profile?.heightInches || 0,
            ageYears: calculateAge(userProfile?.profile?.birthday),
            sex: userProfile?.profile?.biologicalSex || 'male',
            currentBodyFatPct: latest.bodyFatPct,
            todayLiftStats: isStrength ? block.todayLiftStats : running.todayLiftStats,
            strength: { ...strength, isTrainingDay: block.isTrainingDay },
            dailyMiles: running.todayMiles || 0,
            weeklyMiles: running.currentMileage || 0,
            trainingPhase: running.weekInfo?.type || 'build',
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
      running.todayMiles,
      running.currentMileage,
      running.weekInfo,
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

  const entries = todayLog?.entries || []
  const consumed = sumEntries(entries)

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
    if (keep?.name) await library.saveMeal(entryToSavedMeal(entry, { name: keep.name }))
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
          pastEntries.map((e) => <EntryCard key={e.id} entry={e} />)
        )}
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
                  onDelete={() => removeEntry(e)}
                  onSave={() => setSavingEntry(e)}
                  saved={!!library.findByName(e.label)}
                />
              ))}
            </div>
          )}

          <ManualEntryCard onAdd={addEntry} />

          <Card>
            <CardLabel>Last 7 days</CardLabel>
            <div className="grid grid-cols-7 gap-1 mt-3">
              {history.map((day) => {
                const isToday = day.dateId === todayId
                // Today comes from the live subscription; the fetched copy is a
                // mount-time snapshot and goes stale the moment anything is logged.
                const dayEntries = isToday ? entries : day.log?.entries || []
                const kcal = dayEntries.reduce((a, e) => a + (e.kcal || 0), 0)
                const target = (isToday ? targets?.kcal : day.log?.targets?.kcal) || 0
                const hasData = dayEntries.length > 0

                return (
                  <button
                    key={day.dateId}
                    type="button"
                    disabled={isToday || !hasData}
                    onClick={() => navigate(`/nutrition?date=${day.dateId}`)}
                    className={cn(
                      'flex flex-col items-center py-2 rounded-xl transition-colors min-h-14',
                      isToday
                        ? 'bg-brand-subtle border border-brand-border'
                        : hasData
                          ? 'hover:bg-surface'
                          : 'opacity-40'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isToday ? 'text-brand' : 'text-muted'
                      )}
                    >
                      {day.date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
                    </span>
                    <span className="text-xs text-text tabular-nums mt-0.5">
                      {hasData ? Math.round(kcal) : '—'}
                    </span>
                    {target > 0 && hasData && (
                      <span className="text-[10px] text-subtle tabular-nums">
                        /{Math.round(target)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        </>
      )}

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

function EntryCard({ entry, onDelete, onSave, saved }) {
  const confidence = entry.confidence ? CONFIDENCE_COPY[entry.confidence] : null

  return (
    <Card className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
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
      </div>
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
