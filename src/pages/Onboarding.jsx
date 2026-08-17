import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Dumbbell, Footprints } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { calculateProgramStart } from '../lib/periodization'
import { calculateBMI, calculateAge } from '../lib/bodyMetrics'
import {
  MODES,
  BODY_COMP_GOALS,
  INJURY_FLAGS,
  EQUIPMENT_LEVELS,
  defaultStrengthSettings,
} from '../lib/appMode'
import { Button, Field, Input, SegmentedControl, Badge } from '../components/ui'
import { cn } from '../components/ui/cn'

const RACE_DISTANCES = [
  { value: '26.2', label: 'Marathon' },
  { value: '31', label: '50K' },
  { value: '50', label: '50 Mile' },
  { value: '62', label: '100K' },
  { value: '100', label: '100 Mile' },
  { value: 'custom', label: 'Custom' },
]

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

export default function Onboarding() {
  const { user, userProfile, completeOnboarding, loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const defaults = defaultStrengthSettings()

  const [data, setData] = useState({
    mode: MODES.STRENGTH,
    birthday: '',
    biologicalSex: '',
    heightFeet: '',
    heightInches: '',
    initialWeight: '',
    initialBodyFat: '',
    // Strength
    bodyCompGoal: 'leanBulk',
    trainingDayIndices: defaults.trainingDayIndices,
    equipment: 'fullGym',
    injuryFlags: [],
    // Running
    raceName: '',
    raceDistance: '',
    raceDistanceCustom: '',
    raceDate: '',
    baselineMileage: '',
  })

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (userProfile?.onboarding?.completed) return <Navigate to="/" replace />

  const isStrength = data.mode === MODES.STRENGTH
  const update = (field, value) => setData((prev) => ({ ...prev, [field]: value }))

  function toggle(field, value) {
    setData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value].sort((a, b) => a - b),
    }))
  }

  async function handleComplete() {
    setSubmitting(true)

    const heightTotalInches =
      (parseInt(data.heightFeet, 10) || 0) * 12 + (parseInt(data.heightInches, 10) || 0)
    const weight = parseFloat(data.initialWeight) || 0

    const raceDate = data.raceDate ? new Date(`${data.raceDate}T00:00:00`) : null
    const race = raceDate
      ? {
          id: crypto.randomUUID(),
          name: data.raceName || 'A Race',
          distance:
            parseFloat(
              data.raceDistance === 'custom' ? data.raceDistanceCustom : data.raceDistance
            ) || 0,
          distanceUnit: 'miles',
          date: data.raceDate,
          isARace: true,
          programStart: calculateProgramStart(raceDate).toISOString().slice(0, 10),
        }
      : null

    await completeOnboarding({
      initialWeight: weight,
      initialBodyFat: parseFloat(data.initialBodyFat) || 0,
      initialBMI: calculateBMI(weight, heightTotalInches),
      baselineMileage: parseFloat(data.baselineMileage) || 0,
      trainingDays: 'mon-wed-fri',
      mode: data.mode,
      strength: {
        ...defaults,
        bodyCompGoal: data.bodyCompGoal,
        calorieSurplus: BODY_COMP_GOALS[data.bodyCompGoal].kcalDelta,
        trainingDayIndices: data.trainingDayIndices,
        trainingDaysPerWeek: data.trainingDayIndices.length,
        equipment: data.equipment,
        injuryFlags: data.injuryFlags,
      },
      profile: {
        birthday: data.birthday || '',
        biologicalSex: data.biologicalSex || '',
        heightInches: heightTotalInches || 0,
      },
      races: race ? [race] : [],
    })
    navigate('/')
  }

  const steps = [
    // 0 — Welcome + mode
    <div key="welcome" className="space-y-5">
      <div className="text-center space-y-2">
        <img src="/favicon.svg" alt="" className="w-14 h-14 mx-auto" />
        <h1 className="text-2xl font-semibold text-text tracking-tight">Chafed &amp; Jacked</h1>
        <p className="text-sm text-muted">
          Let&apos;s set up your programme. A few numbers now means every target the app shows is
          actually yours.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted mb-2">What are you training for?</p>
        <SegmentedControl
          ariaLabel="Training mode"
          value={data.mode}
          onChange={(v) => update('mode', v)}
          options={[
            { value: MODES.STRENGTH, label: 'Strength', icon: Dumbbell },
            { value: MODES.RUNNING, label: 'Running', icon: Footprints },
          ]}
        />
        <p className="text-xs text-subtle mt-2">
          {isStrength
            ? 'A hypertrophy block — build muscle, correct imbalances, train around injuries.'
            : 'Race-periodised endurance training with mileage-scaled lifting.'}
        </p>
      </div>

      <Button size="lg" fullWidth onClick={() => setStep(1)}>
        Get started
      </Button>
    </div>,

    // 1 — About you
    <div key="personal" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text">About you</h2>
        <p className="text-sm text-muted mt-1">
          Drives BMR, body-composition ranges and safe rate-of-change limits.
        </p>
      </div>

      <Field label="Birthday" hint={data.birthday ? `Age ${calculateAge(data.birthday)}` : undefined}>
        {({ id, ...a11y }) => (
          <Input
            id={id}
            {...a11y}
            type="date"
            value={data.birthday}
            onChange={(e) => update('birthday', e.target.value)}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Height (ft)">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              value={data.heightFeet}
              onChange={(e) => update('heightFeet', e.target.value)}
              placeholder="5"
            />
          )}
        </Field>
        <Field label="Height (in)">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              value={data.heightInches}
              onChange={(e) => update('heightInches', e.target.value)}
              placeholder="10"
            />
          )}
        </Field>
      </div>

      <div>
        <p className="text-xs font-medium text-muted mb-1.5">Biological sex</p>
        <SegmentedControl
          ariaLabel="Biological sex"
          value={data.biologicalSex}
          onChange={(v) => update('biologicalSex', v)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={() => setStep(0)}>
          Back
        </Button>
        <Button
          fullWidth
          onClick={() => setStep(2)}
          disabled={!data.birthday || !data.biologicalSex || !data.heightFeet}
        >
          Next
        </Button>
      </div>
    </div>,

    // 2 — Body metrics
    <div key="body" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text">Where you are now</h2>
        <p className="text-sm text-muted mt-1">From your scale, or a best estimate.</p>
      </div>

      <Field label="Bodyweight (lbs)">
        {({ id }) => (
          <Input
            id={id}
            type="number"
            step="0.1"
            value={data.initialWeight}
            onChange={(e) => update('initialWeight', e.target.value)}
            placeholder="175"
          />
        )}
      </Field>

      <Field label="Body fat (%)" hint="Optional, but it makes the BMR estimate meaningfully better.">
        {({ id, ...a11y }) => (
          <Input
            id={id}
            {...a11y}
            type="number"
            step="0.1"
            value={data.initialBodyFat}
            onChange={(e) => update('initialBodyFat', e.target.value)}
            placeholder="18.5"
          />
        )}
      </Field>

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={() => setStep(1)}>
          Back
        </Button>
        <Button fullWidth onClick={() => setStep(3)} disabled={!data.initialWeight}>
          Next
        </Button>
      </div>
    </div>,

    // 3 — Mode-specific setup
    isStrength ? (
      <div key="strength" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Your block</h2>
          <p className="text-sm text-muted mt-1">
            22 weeks by default. Everything here is editable later.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Goal</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(BODY_COMP_GOALS).map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={data.bodyCompGoal === g.id}
                onClick={() => update('bodyCompGoal', g.id)}
                className={cn(
                  'p-3 rounded-xl border text-left transition-colors min-h-14',
                  data.bodyCompGoal === g.id
                    ? 'bg-brand-subtle border-brand-border'
                    : 'bg-bg border-border-default hover:bg-surface'
                )}
              >
                <span
                  className={cn(
                    'block text-sm font-medium',
                    data.bodyCompGoal === g.id ? 'text-brand' : 'text-text'
                  )}
                >
                  {g.label}
                </span>
                <span className="block text-xs text-muted tabular-nums mt-0.5">
                  {g.kcalDelta > 0 ? '+' : ''}
                  {g.kcalDelta} kcal
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">
            Training days{' '}
            <span className="text-subtle font-normal">({data.trainingDayIndices.length}/week)</span>
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {WEEKDAYS.map((d) => {
              const active = data.trainingDayIndices.includes(d.value)
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle('trainingDayIndices', d.value)}
                  className={cn(
                    'min-h-11 rounded-xl border text-xs font-medium transition-colors',
                    active
                      ? 'bg-brand text-inverse border-brand'
                      : 'bg-bg text-muted border-border-strong hover:bg-surface'
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Equipment</p>
          <SegmentedControl
            ariaLabel="Equipment"
            size="sm"
            value={data.equipment}
            onChange={(v) => update('equipment', v)}
            options={Object.values(EQUIPMENT_LEVELS).map((e) => ({
              value: e.id,
              label: e.id === 'fullGym' ? 'Full gym' : e.id === 'homeGym' ? 'Home' : 'Minimal',
            }))}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setStep(2)}>
            Back
          </Button>
          <Button
            fullWidth
            onClick={() => setStep(4)}
            disabled={data.trainingDayIndices.length < 2}
          >
            Next
          </Button>
        </div>
      </div>
    ) : (
      <div key="race" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Your A race</h2>
          <p className="text-sm text-muted mt-1">
            Drives taper timing, periodisation and body-comp goals. You can skip and add it later.
          </p>
        </div>

        <Field label="Race name">
          {({ id }) => (
            <Input
              id={id}
              value={data.raceName}
              onChange={(e) => update('raceName', e.target.value)}
              placeholder="e.g. Leadville 100"
            />
          )}
        </Field>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Distance</p>
          <div className="grid grid-cols-3 gap-1.5">
            {RACE_DISTANCES.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={data.raceDistance === d.value}
                onClick={() => update('raceDistance', d.value)}
                className={cn(
                  'min-h-11 rounded-xl border text-xs font-medium transition-colors',
                  data.raceDistance === d.value
                    ? 'bg-brand-subtle border-brand-border text-brand'
                    : 'bg-bg border-border-strong text-muted hover:bg-surface'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          {data.raceDistance === 'custom' && (
            <Input
              type="number"
              aria-label="Custom distance in miles"
              className="mt-2"
              value={data.raceDistanceCustom}
              onChange={(e) => update('raceDistanceCustom', e.target.value)}
              placeholder="Distance in miles"
            />
          )}
        </div>

        <Field label="Race date">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={data.raceDate}
              onChange={(e) => update('raceDate', e.target.value)}
            />
          )}
        </Field>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setStep(2)}>
            Back
          </Button>
          <Button fullWidth onClick={() => setStep(4)}>
            {data.raceDate ? 'Next' : 'Skip for now'}
          </Button>
        </div>
      </div>
    ),

    // 4 — Final: injuries (strength) or mileage (running)
    isStrength ? (
      <div key="injuries" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Anything to train around?</h2>
          <p className="text-sm text-muted mt-1">
            These are hard filters on exercise selection, not notes. A flagged movement will never
            be programmed.
          </p>
        </div>

        <div className="space-y-2">
          {Object.values(INJURY_FLAGS).map((flag) => {
            const active = data.injuryFlags.includes(flag.id)
            return (
              <button
                key={flag.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle('injuryFlags', flag.id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-colors',
                  active
                    ? 'bg-warning-subtle border-warning-border'
                    : 'bg-bg border-border-default hover:bg-surface'
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-4 h-4 rounded border-2 shrink-0',
                      active ? 'bg-warning border-warning' : 'border-border-strong'
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-text">{flag.label}</span>
                </div>
                {active && <p className="text-xs text-muted mt-1.5 ml-6">{flag.guidance}</p>}
              </button>
            )
          })}
        </div>

        {data.injuryFlags.length > 0 && (
          <Badge tone="warning">
            {data.injuryFlags.length} guardrail{data.injuryFlags.length === 1 ? '' : 's'} active
          </Badge>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setStep(3)}>
            Back
          </Button>
          <Button fullWidth onClick={handleComplete} disabled={submitting}>
            {submitting ? 'Setting up…' : 'Start the block'}
          </Button>
        </div>
      </div>
    ) : (
      <div key="running" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text">Running baseline</h2>
          <p className="text-sm text-muted mt-1">
            Weekly mileage drives how much lifting load gets scaled back.
          </p>
        </div>

        <Field label="Weekly mileage">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              value={data.baselineMileage}
              onChange={(e) => update('baselineMileage', e.target.value)}
              placeholder="40"
            />
          )}
        </Field>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => setStep(3)}>
            Back
          </Button>
          <Button fullWidth onClick={handleComplete} disabled={submitting || !data.baselineMileage}>
            {submitting ? 'Setting up…' : 'Start training'}
          </Button>
        </div>
      </div>
    ),
  ]

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-1.5 mb-8" aria-hidden="true">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all',
                i === step ? 'w-6 bg-brand' : i < step ? 'w-3 bg-brand/40' : 'w-3 bg-surface-2'
              )}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  )
}
