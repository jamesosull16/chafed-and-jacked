import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Camera, Sparkles, Trash2, Plus, X, ImageOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useWorkout } from '../hooks/useWorkout'
import { useStrengthBlock } from '../hooks/useStrengthBlock'
import { useFirestore, formatLocalDate } from '../hooks/useFirestore'
import { getNutritionAdvice } from '../lib/nutritionAdvice'
import { calculateAge } from '../lib/bodyMetrics'
import {
  prepareImage,
  estimateMeal,
  estimateToEntry,
  CONFIDENCE_COPY,
} from '../lib/mealEstimation'
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
  EmptyState,
} from '../components/ui'
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

  function reset() {
    setDescription('')
    setImage(null)
    setEstimate(null)
    setEdited(null)
    setError('')
    setBusy(false)
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
    onSave(entry)
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
  const complete = ['kcal', 'protein', 'carbs', 'fat'].every((k) => fields[k] !== '')

  function submit() {
    onAdd({
      id: crypto.randomUUID(),
      label: fields.label.trim() || 'Meal',
      kcal: Number(fields.kcal) || 0,
      protein: Number(fields.protein) || 0,
      carbs: Number(fields.carbs) || 0,
      fat: Number(fields.fat) || 0,
      loggedAt: new Date().toISOString(),
      source: 'manual',
    })
    setFields({ label: '', kcal: '', protein: '', carbs: '', fat: '' })
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
  const { getDocument, setDocument, getCollection } = useFirestore()

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

      setTodayLog(await getDocument(`nutritionLogs/${todayId}`))

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
  }, [user, getCollection, getDocument, todayId, userProfile])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!isViewingPast) {
      setViewingDay(null)
      return
    }
    getDocument(`nutritionLogs/${viewDate}`).then(setViewingDay)
  }, [isViewingPast, viewDate, getDocument])

  const advice = latest.weight
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
    : null

  const targets = advice
    ? {
        kcal: advice.calories.target,
        protein: advice.protein.grams,
        carbs: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2),
        fat: advice.fat.grams,
      }
    : null

  const entries = todayLog?.entries || []
  const consumed = sumEntries(entries)

  async function persist(nextEntries) {
    const doc = { date: todayId, targets, entries: nextEntries }
    await setDocument(`nutritionLogs/${todayId}`, doc)
    setTodayLog(doc)
    setHistory((prev) => prev.map((d) => (d.dateId === todayId ? { ...d, log: doc } : d)))
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
        onSave={(entry) => persist([...entries, entry])}
      />

      {entries.length > 0 && (
        <div className="space-y-2">
          <CardLabel className="px-1">Today&apos;s meals</CardLabel>
          {entries.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              onDelete={() => persist(entries.filter((x) => x.id !== e.id))}
            />
          ))}
        </div>
      )}

      <ManualEntryCard onAdd={(entry) => persist([...entries, entry])} />

      <Card>
        <CardLabel>Last 7 days</CardLabel>
        <div className="grid grid-cols-7 gap-1 mt-3">
          {history.map((day) => {
            const dayEntries = day.log?.entries || []
            const kcal = dayEntries.reduce((a, e) => a + (e.kcal || 0), 0)
            const target = day.log?.targets?.kcal || 0
            const isToday = day.dateId === todayId
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
    </div>
  )
}

function EntryCard({ entry, onDelete }) {
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
