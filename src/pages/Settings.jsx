import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Dumbbell,
  Footprints,
  User,
  Target,
  CalendarRange,
  ShieldAlert,
  Flag,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useFirestore } from '../hooks/useFirestore'
import { calculateProgramStart } from '../lib/periodization'
import { getRecommendedBodyFatRange, calculateTimeGatedGoal } from '../lib/bodyCompGoals'
import { calculateAge } from '../lib/bodyMetrics'
import {
  BODY_COMP_GOALS,
  EQUIPMENT_LEVELS,
  INJURY_FLAGS,
  MODES,
  defaultStrengthSettings,
} from '../lib/appMode'
import { getSplitLabels } from '../lib/strength/strengthProgram'
import { getBlockStatus } from '../lib/strength/strengthPeriodization'
import {
  Card,
  Button,
  Badge,
  Field,
  Input,
  SegmentedControl,
  ProgressBar,
} from '../components/ui'
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
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
]

function Section({ title, icon: Icon, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left min-h-14"
      >
        {Icon && <Icon className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />}
        <h2 className="text-sm font-semibold text-text flex-1">{title}</h2>
        {badge}
        <ChevronDown
          className={cn('w-4 h-4 text-subtle transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </Card>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { user, userProfile, updateUserProfile, updateStrengthSettings, setMode, logout } = useAuth()
  const { mode, isStrength, strength, goal } = useAppMode()
  const { getCollection } = useFirestore()

  // Profile
  const [birthday, setBirthday] = useState('')
  const [sex, setSex] = useState('')
  const [heightFeet, setHeightFeet] = useState('')
  const [heightInches, setHeightInches] = useState('')
  const [vo2max, setVo2max] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // Strength block
  const [blockDraft, setBlockDraft] = useState(strength)
  const [blockSaving, setBlockSaving] = useState(false)

  // Races (running mode)
  const [races, setRaces] = useState([])
  const [showAddRace, setShowAddRace] = useState(false)
  const [newRace, setNewRace] = useState({ name: '', distance: '', distanceCustom: '', date: '' })

  // Body comp goals (running mode)
  const [targetBF, setTargetBF] = useState('')
  const [goalResult, setGoalResult] = useState(null)
  const [goalSaving, setGoalSaving] = useState(false)

  useEffect(() => {
    if (!userProfile) return
    setBirthday(userProfile.profile?.birthday || '')
    setSex(userProfile.profile?.biologicalSex || '')
    const ht = userProfile.profile?.heightInches || 0
    setHeightFeet(ht ? Math.floor(ht / 12) : '')
    setHeightInches(ht ? ht % 12 : '')
    setVo2max(userProfile.profile?.vo2max || '')
    setRaces(userProfile.races || [])
    setTargetBF(userProfile.goals?.targetBodyFatPct || '')
    setBlockDraft({ ...defaultStrengthSettings(), ...(userProfile.strength || {}) })
  }, [userProfile])

  async function saveProfile() {
    setProfileSaving(true)
    const totalInches = (parseInt(heightFeet, 10) || 0) * 12 + (parseInt(heightInches, 10) || 0)
    await updateUserProfile({
      profile: {
        birthday,
        biologicalSex: sex,
        heightInches: totalInches,
        ...(vo2max && { vo2max: parseFloat(vo2max) }),
      },
    })
    setProfileSaving(false)
  }

  async function saveBlock() {
    setBlockSaving(true)
    await updateStrengthSettings({
      ...blockDraft,
      calorieSurplus: Number(blockDraft.calorieSurplus),
      trainingDaysPerWeek: blockDraft.trainingDayIndices.length,
    })
    setBlockSaving(false)
  }

  function toggleInjury(flagId) {
    setBlockDraft((prev) => ({
      ...prev,
      injuryFlags: prev.injuryFlags.includes(flagId)
        ? prev.injuryFlags.filter((f) => f !== flagId)
        : [...prev.injuryFlags, flagId],
    }))
  }

  function toggleTrainingDay(day) {
    setBlockDraft((prev) => {
      const next = prev.trainingDayIndices.includes(day)
        ? prev.trainingDayIndices.filter((d) => d !== day)
        : [...prev.trainingDayIndices, day].sort((a, b) => a - b)
      // A split needs at least two days to be meaningful.
      if (next.length < 2) return prev
      return { ...prev, trainingDayIndices: next, trainingDaysPerWeek: next.length }
    })
  }

  async function addRace() {
    const distance =
      parseFloat(newRace.distance === 'custom' ? newRace.distanceCustom : newRace.distance) || 0
    const race = {
      id: crypto.randomUUID(),
      name: newRace.name || 'Untitled Race',
      distance,
      distanceUnit: 'miles',
      date: newRace.date,
      isARace: races.length === 0,
      programStart: calculateProgramStart(new Date(`${newRace.date}T00:00:00`))
        .toISOString()
        .slice(0, 10),
    }
    const updated = [...races, race]
    setRaces(updated)
    await updateUserProfile({ races: updated })
    setNewRace({ name: '', distance: '', distanceCustom: '', date: '' })
    setShowAddRace(false)
  }

  async function calculateGoals() {
    if (!targetBF || !sex) return
    setGoalSaving(true)
    let currentWeight = userProfile?.onboarding?.initialWeight || 0
    let currentBF = userProfile?.onboarding?.initialBodyFat || 0
    try {
      const latest = await getCollection('bodyMetrics', 'date', 'desc', 1)
      if (latest.length > 0) {
        currentWeight = latest[0].weight || currentWeight
        currentBF = latest[0].bodyFatPct || currentBF
      }
    } catch {
      // Fall back to onboarding values.
    }

    const activeRace =
      races.find((r) => r.isARace && new Date(`${r.date}T00:00:00`) > new Date()) ||
      races.find((r) => new Date(`${r.date}T00:00:00`) > new Date())

    if (!activeRace) {
      setGoalResult({ error: 'Add an upcoming race first to calculate a time-gated goal.' })
      setGoalSaving(false)
      return
    }

    const result = calculateTimeGatedGoal(
      currentWeight,
      currentBF,
      parseFloat(targetBF),
      activeRace.date,
      userProfile?.onboarding?.baselineMileage || 30,
      userProfile?.profile?.heightInches || 0,
      sex
    )
    await updateUserProfile({
      goals: {
        targetBodyFatPct: parseFloat(targetBF),
        startWeight: result.startWeight,
        targetWeight: result.targetWeight,
        achievableTargetWeight: result.achievableTargetWeight,
        targetDate: activeRace.date,
        weeklyRate: result.weeklyRate,
        milestones: result.milestones,
        calculatedAt: new Date().toISOString(),
      },
    })
    setGoalResult(result)
    setGoalSaving(false)
  }

  const bfRange = sex
    ? getRecommendedBodyFatRange(sex, races.find((r) => r.isARace)?.distance || 50)
    : null

  const draftBlock = getBlockStatus(blockDraft.blockStart, blockDraft.blockEnd)
  const splitLabels = getSplitLabels(blockDraft.trainingDayIndices.length)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-semibold text-text tracking-tight">Settings</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          Done
        </Button>
      </div>

      {/* Mode — the switch the whole app pivots on. */}
      <Card>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Training Mode</h2>
            <p className="text-xs text-muted mt-0.5">
              Switching swaps the programme, targets and dashboard. Nothing is deleted either way.
            </p>
          </div>
        </div>
        <SegmentedControl
          ariaLabel="Training mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: MODES.STRENGTH, label: 'Strength', icon: Dumbbell },
            { value: MODES.RUNNING, label: 'Running', icon: Footprints },
          ]}
        />
        <p className="text-xs text-muted mt-3">
          {isStrength
            ? `Hypertrophy block — week ${draftBlock.blockWeek} of ${draftBlock.totalWeeks}.`
            : 'Endurance programme with race periodisation and mileage-scaled lifting.'}
        </p>
      </Card>

      <Section title="Profile" icon={User} defaultOpen={!userProfile?.profile?.birthday}>
        <Field label="Birthday" hint={birthday ? `Age ${calculateAge(birthday)}` : undefined}>
          {({ id, ...a11y }) => (
            <Input
              id={id}
              {...a11y}
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Height (ft)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={heightFeet}
                onChange={(e) => setHeightFeet(e.target.value)}
                placeholder="5"
              />
            )}
          </Field>
          <Field label="Height (in)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
                placeholder="10"
              />
            )}
          </Field>
        </div>

        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Biological sex</p>
          <SegmentedControl
            ariaLabel="Biological sex"
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
          <p className="text-xs text-subtle mt-1.5">
            Affects BMR and body-fat range recommendations.
          </p>
        </div>

        {!isStrength && (
          <Field label="VO₂max" hint="Optional — improves run calorie accuracy.">
            {({ id, ...a11y }) => (
              <Input
                id={id}
                {...a11y}
                type="number"
                step="0.1"
                value={vo2max}
                onChange={(e) => setVo2max(e.target.value)}
                placeholder="e.g. 52"
              />
            )}
          </Field>
        )}

        <Button variant="subtle" fullWidth onClick={saveProfile} disabled={profileSaving}>
          {profileSaving ? 'Saving…' : 'Save profile'}
        </Button>
      </Section>

      {isStrength && (
        <>
          <Section
            title="Strength Block"
            icon={CalendarRange}
            defaultOpen
            badge={<Badge tone="brand">Week {draftBlock.blockWeek}</Badge>}
          >
            <ProgressBar
              value={draftBlock.blockWeek}
              max={draftBlock.totalWeeks}
              label={`Week ${draftBlock.blockWeek} of ${draftBlock.totalWeeks}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Block starts">
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    value={blockDraft.blockStart}
                    onChange={(e) => setBlockDraft({ ...blockDraft, blockStart: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Block ends">
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    value={blockDraft.blockEnd}
                    onChange={(e) => setBlockDraft({ ...blockDraft, blockEnd: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <div>
              <p className="text-xs font-medium text-muted mb-1.5">Training days</p>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = blockDraft.trainingDayIndices.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Toggle training on day ${d.value}`}
                      onClick={() => toggleTrainingDay(d.value)}
                      className={cn(
                        'flex-1 min-h-11 rounded-xl text-sm font-medium transition-colors border',
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
              <p className="text-xs text-subtle mt-1.5">
                {splitLabels.map((s) => s.name).join(' · ')}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted mb-1.5">Equipment</p>
              <SegmentedControl
                ariaLabel="Equipment level"
                size="sm"
                value={blockDraft.equipment}
                onChange={(v) => setBlockDraft({ ...blockDraft, equipment: v })}
                options={Object.values(EQUIPMENT_LEVELS).map((e) => ({
                  value: e.id,
                  label: e.id === 'fullGym' ? 'Full gym' : e.id === 'homeGym' ? 'Home' : 'Minimal',
                }))}
              />
              <p className="text-xs text-subtle mt-1.5">
                {EQUIPMENT_LEVELS[blockDraft.equipment]?.description}
              </p>
            </div>

            <Button variant="subtle" fullWidth onClick={saveBlock} disabled={blockSaving}>
              {blockSaving ? 'Saving…' : 'Save block settings'}
            </Button>
          </Section>

          <Section
            title="Injury Guardrails"
            icon={ShieldAlert}
            badge={
              blockDraft.injuryFlags.length > 0 ? (
                <Badge tone="warning">{blockDraft.injuryFlags.length}</Badge>
              ) : null
            }
          >
            <p className="text-xs text-muted">
              These are hard filters on exercise selection, not notes. A flagged movement cannot be
              programmed.
            </p>
            {Object.values(INJURY_FLAGS).map((flag) => {
              const active = blockDraft.injuryFlags.includes(flag.id)
              return (
                <button
                  key={flag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInjury(flag.id)}
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
            <Button variant="subtle" fullWidth onClick={saveBlock} disabled={blockSaving}>
              {blockSaving ? 'Saving…' : 'Save guardrails'}
            </Button>
          </Section>

          <Section
            title="Body Composition"
            icon={Target}
            defaultOpen
            badge={<Badge tone="brand">{goal.label}</Badge>}
          >
            <div>
              <p className="text-xs font-medium text-muted mb-1.5">Goal</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(BODY_COMP_GOALS).map((g) => {
                  const active = blockDraft.bodyCompGoal === g.id
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setBlockDraft({
                          ...blockDraft,
                          bodyCompGoal: g.id,
                          calorieSurplus: g.kcalDelta,
                        })
                      }
                      className={cn(
                        'p-3 rounded-xl border text-left transition-colors min-h-14',
                        active
                          ? 'bg-brand-subtle border-brand-border'
                          : 'bg-bg border-border-default hover:bg-surface'
                      )}
                    >
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          active ? 'text-brand' : 'text-text'
                        )}
                      >
                        {g.label}
                      </span>
                      <span className="block text-xs text-muted tabular-nums mt-0.5">
                        {g.kcalDelta > 0 ? '+' : ''}
                        {g.kcalDelta} kcal
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-subtle mt-2">
                {BODY_COMP_GOALS[blockDraft.bodyCompGoal]?.description}
              </p>
            </div>

            <Field
              label="Calorie adjustment"
              hint="The rate-of-gain guardrail nudges this as your weight trend comes in."
            >
              {({ id, ...a11y }) => (
                <Input
                  id={id}
                  {...a11y}
                  type="number"
                  step="50"
                  value={blockDraft.calorieSurplus}
                  onChange={(e) =>
                    setBlockDraft({ ...blockDraft, calorieSurplus: e.target.value })
                  }
                />
              )}
            </Field>

            <Button variant="subtle" fullWidth onClick={saveBlock} disabled={blockSaving}>
              {blockSaving ? 'Saving…' : 'Save goal'}
            </Button>
          </Section>
        </>
      )}

      {!isStrength && (
        <>
          <Section title="Race Calendar" icon={Flag} defaultOpen={races.length === 0}>
            {races.length === 0 && (
              <p className="text-xs text-muted">
                No races yet. Add your A-race to unlock periodised training.
              </p>
            )}
            {races.map((race) => (
              <div
                key={race.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text truncate">{race.name}</p>
                    {race.isARace && <Badge tone="brand" size="xs">A</Badge>}
                  </div>
                  <p className="text-xs text-muted">
                    {race.distance} mi ·{' '}
                    {new Date(`${race.date}T00:00:00`).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={async () => {
                    const updated = races.filter((r) => r.id !== race.id)
                    setRaces(updated)
                    await updateUserProfile({ races: updated })
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}

            {showAddRace ? (
              <div className="space-y-2 pt-2 border-t border-border-default">
                <Input
                  aria-label="Race name"
                  value={newRace.name}
                  onChange={(e) => setNewRace({ ...newRace, name: e.target.value })}
                  placeholder="Race name"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {RACE_DISTANCES.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setNewRace({ ...newRace, distance: d.value })}
                      className={cn(
                        'py-2 min-h-11 rounded-xl border text-xs font-medium transition-colors',
                        newRace.distance === d.value
                          ? 'bg-brand-subtle border-brand-border text-brand'
                          : 'bg-bg border-border-strong text-muted hover:bg-surface'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {newRace.distance === 'custom' && (
                  <Input
                    type="number"
                    aria-label="Custom distance in miles"
                    value={newRace.distanceCustom}
                    onChange={(e) => setNewRace({ ...newRace, distanceCustom: e.target.value })}
                    placeholder="Distance (miles)"
                  />
                )}
                <Input
                  type="date"
                  aria-label="Race date"
                  value={newRace.date}
                  onChange={(e) => setNewRace({ ...newRace, date: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" fullWidth onClick={() => setShowAddRace(false)}>
                    Cancel
                  </Button>
                  <Button
                    fullWidth
                    onClick={addRace}
                    disabled={!newRace.date || !newRace.distance}
                  >
                    Add race
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" fullWidth onClick={() => setShowAddRace(true)}>
                + Add race
              </Button>
            )}
          </Section>

          <Section title="Body Composition Goals" icon={Target}>
            {bfRange && (
              <div className="p-3 rounded-xl bg-surface text-xs text-muted">
                <p className="font-medium text-text mb-0.5">
                  Recommended range ({bfRange.label})
                </p>
                <p>
                  Healthy {bfRange.min}–{bfRange.max}% · Optimal {bfRange.optimal.min}–
                  {bfRange.optimal.max}%
                </p>
              </div>
            )}
            <Field label="Target body fat (%)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="0.5"
                  value={targetBF}
                  onChange={(e) => setTargetBF(e.target.value)}
                  placeholder={bfRange ? `${bfRange.optimal.min}–${bfRange.optimal.max}` : '12'}
                />
              )}
            </Field>
            <Button
              variant="subtle"
              fullWidth
              onClick={calculateGoals}
              disabled={goalSaving || !targetBF || !sex}
            >
              {goalSaving ? 'Calculating…' : 'Calculate goal'}
            </Button>
            {goalResult?.error && (
              <p className="text-xs text-warning-strong">{goalResult.error}</p>
            )}
            {goalResult && !goalResult.error && (
              <div
                className={cn(
                  'p-3 rounded-xl text-xs',
                  goalResult.isFullyAchievable || goalResult.isAlreadyAtGoal
                    ? 'bg-success-subtle text-success-strong'
                    : 'bg-warning-subtle text-warning-strong'
                )}
              >
                {goalResult.message}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Account" icon={User}>
        <p className="text-xs text-muted">{user?.email}</p>
        <Button
          variant="dangerGhost"
          fullWidth
          icon={LogOut}
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          Sign out
        </Button>
      </Section>
    </div>
  )
}
