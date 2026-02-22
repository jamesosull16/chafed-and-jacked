import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFirestore } from '../hooks/useFirestore'
import { calculateProgramStart } from '../lib/periodization'
import { getRecommendedBodyFatRange, calculateTimeGatedGoal, getSafeWeightLossRate } from '../lib/bodyCompGoals'
import { calculateAge } from '../lib/bodyMetrics'

const RACE_DISTANCES = [
  { value: '26.2', label: 'Marathon' },
  { value: '31', label: '50K' },
  { value: '50', label: '50 Mile' },
  { value: '62', label: '100K' },
  { value: '100', label: '100 Mile' },
  { value: 'custom', label: 'Custom' },
]

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <span className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

export default function Settings() {
  const { user, userProfile, updateUserProfile, logout } = useAuth()
  const { getCollection } = useFirestore()
  const navigate = useNavigate()

  // Profile fields
  const [birthday, setBirthday] = useState(userProfile?.profile?.birthday || '')
  const [sex, setSex] = useState(userProfile?.profile?.biologicalSex || '')
  const heightTotal = userProfile?.profile?.heightInches || 0
  const [heightFeet, setHeightFeet] = useState(heightTotal ? Math.floor(heightTotal / 12) : '')
  const [heightInches, setHeightInches] = useState(heightTotal ? heightTotal % 12 : '')
  const [profileSaving, setProfileSaving] = useState(false)

  // Race fields
  const [races, setRaces] = useState(userProfile?.races || [])
  const [showAddRace, setShowAddRace] = useState(false)
  const [newRace, setNewRace] = useState({ name: '', distance: '', distanceCustom: '', date: '', isARace: false })
  const [raceSaving, setRaceSaving] = useState(false)

  // Goals fields
  const [targetBF, setTargetBF] = useState(userProfile?.goals?.targetBodyFatPct || '')
  const [goalResult, setGoalResult] = useState(null)
  const [goalSaving, setGoalSaving] = useState(false)

  // Training preferences
  const [trainingDays, setTrainingDays] = useState(userProfile?.onboarding?.trainingDays || 'mon-wed-fri')
  const [prefSaving, setPrefSaving] = useState(false)

  const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-brand'

  // Sync state when userProfile changes
  useEffect(() => {
    if (userProfile) {
      setBirthday(userProfile.profile?.birthday || '')
      setSex(userProfile.profile?.biologicalSex || '')
      const ht = userProfile.profile?.heightInches || 0
      setHeightFeet(ht ? Math.floor(ht / 12) : '')
      setHeightInches(ht ? ht % 12 : '')
      setRaces(userProfile.races || [])
      setTrainingDays(userProfile.onboarding?.trainingDays || 'mon-wed-fri')
      setTargetBF(userProfile.goals?.targetBodyFatPct || '')
    }
  }, [userProfile])

  // --- Profile handlers ---
  async function saveProfile() {
    setProfileSaving(true)
    const totalInches = ((parseInt(heightFeet) || 0) * 12) + (parseInt(heightInches) || 0)
    await updateUserProfile({
      profile: { birthday, biologicalSex: sex, heightInches: totalInches },
    })
    setProfileSaving(false)
  }

  // --- Race handlers ---
  async function addRace() {
    setRaceSaving(true)
    const distance = parseFloat(newRace.distance === 'custom' ? newRace.distanceCustom : newRace.distance) || 0
    const raceDate = new Date(newRace.date + 'T00:00:00')
    const programStart = calculateProgramStart(raceDate)

    const race = {
      id: crypto.randomUUID(),
      name: newRace.name || 'Untitled Race',
      distance,
      distanceUnit: 'miles',
      date: newRace.date,
      isARace: newRace.isARace || races.length === 0,
      programStart: programStart.toISOString().slice(0, 10),
    }

    const updated = [...races, race]
    setRaces(updated)
    await updateUserProfile({ races: updated })
    setNewRace({ name: '', distance: '', distanceCustom: '', date: '', isARace: false })
    setShowAddRace(false)
    setRaceSaving(false)
  }

  async function removeRace(raceId) {
    const updated = races.filter((r) => r.id !== raceId)
    setRaces(updated)
    await updateUserProfile({ races: updated })
  }

  async function toggleARace(raceId) {
    const updated = races.map((r) => ({
      ...r,
      isARace: r.id === raceId ? !r.isARace : r.isARace,
    }))
    setRaces(updated)
    await updateUserProfile({ races: updated })
  }

  // --- Goals handlers ---
  async function calculateGoals() {
    if (!targetBF || !sex) return
    setGoalSaving(true)

    // Get latest body metrics
    let currentWeight = userProfile?.onboarding?.initialWeight || 0
    let currentBF = userProfile?.onboarding?.initialBodyFat || 0
    let mileage = userProfile?.onboarding?.baselineMileage || 30

    try {
      const latestMetrics = await getCollection('bodyMetrics', 'date', 'desc', 1)
      if (latestMetrics.length > 0) {
        currentWeight = latestMetrics[0].weight || currentWeight
        currentBF = latestMetrics[0].bodyFatPct || currentBF
      }
    } catch { /* use onboarding values */ }

    const activeRace = races.find((r) => r.isARace && new Date(r.date) > new Date())
      || races.find((r) => new Date(r.date) > new Date())

    if (!activeRace) {
      setGoalResult({ error: 'Add an upcoming race first to calculate time-gated goals.' })
      setGoalSaving(false)
      return
    }

    const profileHeightInches = userProfile?.profile?.heightInches || 0
    const result = calculateTimeGatedGoal(currentWeight, currentBF, parseFloat(targetBF), activeRace.date, mileage, profileHeightInches, sex)

    const goals = {
      targetBodyFatPct: parseFloat(targetBF),
      targetWeight: result.targetWeight,
      achievableTargetWeight: result.achievableTargetWeight,
      targetDate: activeRace.date,
      weeklyRate: result.weeklyRate,
      milestones: result.milestones,
      isFullyAchievable: result.isFullyAchievable,
      ffmi: result.ffmi,
      ffmiLabel: result.ffmiLabel,
      projectedLeanMass: result.projectedLeanMass,
      projectedBFPct: result.projectedBFPct,
      floorApplied: result.floorApplied,
      minWeight: result.minWeight,
      calculatedAt: new Date().toISOString(),
    }

    await updateUserProfile({ goals })
    setGoalResult(result)
    setGoalSaving(false)
  }

  // --- Preferences handlers ---
  async function savePreferences() {
    setPrefSaving(true)
    await updateUserProfile({
      onboarding: { ...userProfile?.onboarding, trainingDays },
    })
    setPrefSaving(false)
  }

  // Body fat range recommendation
  const bfRange = sex
    ? getRecommendedBodyFatRange(sex, races.find((r) => r.isARace)?.distance || 50)
    : null

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-100">Settings</h1>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          Done
        </button>
      </div>

      {/* Profile */}
      <Section title="Profile" defaultOpen={!userProfile?.profile?.birthday}>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Birthday</label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className={inputClass}
          />
          {birthday && (
            <p className="text-xs text-gray-500 mt-1">Age: {calculateAge(birthday)}</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Height</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={heightFeet}
                onChange={(e) => setHeightFeet(e.target.value)}
                placeholder="5"
                className={inputClass}
              />
              <span className="text-xs text-gray-600 mt-0.5 block">ft</span>
            </div>
            <div className="flex-1">
              <input
                type="number"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
                placeholder="10"
                className={inputClass}
              />
              <span className="text-xs text-gray-600 mt-0.5 block">in</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Biological Sex</label>
          <div className="grid grid-cols-2 gap-2">
            {['male', 'female'].map((val) => (
              <button
                key={val}
                onClick={() => setSex(val)}
                className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                  sex === val ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-900'
                }`}
              >
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={saveProfile}
          disabled={profileSaving}
          className="w-full bg-brand/20 text-brand py-2 rounded-lg text-xs font-medium hover:bg-brand/30 disabled:opacity-50 transition-colors"
        >
          {profileSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </Section>

      {/* Race Calendar */}
      <Section title="Race Calendar" defaultOpen={races.length === 0}>
        {races.length === 0 && (
          <p className="text-xs text-gray-500">No races added yet. Add your A-race to unlock periodized training.</p>
        )}
        {races.map((race) => (
          <div key={race.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-800/50">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-200">{race.name}</p>
                {race.isARace && <span className="text-xs bg-brand/20 text-brand px-1.5 py-0.5 rounded">A</span>}
              </div>
              <p className="text-xs text-gray-500">
                {race.distance} mi · {new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleARace(race.id)}
                className="text-xs text-gray-500 hover:text-brand"
                title={race.isARace ? 'Remove A-race' : 'Set as A-race'}
              >
                {race.isARace ? 'A' : 'Set A'}
              </button>
              <button
                onClick={() => removeRace(race.id)}
                className="text-xs text-gray-500 hover:text-danger"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {showAddRace ? (
          <div className="space-y-2 pt-2 border-t border-gray-800">
            <input
              type="text"
              value={newRace.name}
              onChange={(e) => setNewRace({ ...newRace, name: e.target.value })}
              placeholder="Race name"
              className={inputClass}
            />
            <div className="grid grid-cols-3 gap-1.5">
              {RACE_DISTANCES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setNewRace({ ...newRace, distance: value })}
                  className={`py-1.5 rounded-lg border text-xs transition-colors ${
                    newRace.distance === value ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-500 hover:bg-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {newRace.distance === 'custom' && (
              <input
                type="number"
                step="0.1"
                value={newRace.distanceCustom}
                onChange={(e) => setNewRace({ ...newRace, distanceCustom: e.target.value })}
                placeholder="Distance (miles)"
                className={inputClass}
              />
            )}
            <input
              type="date"
              value={newRace.date}
              onChange={(e) => setNewRace({ ...newRace, date: e.target.value })}
              className={inputClass}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddRace(false)}
                className="flex-1 border border-gray-700 text-gray-400 py-2 rounded-lg text-xs hover:bg-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={addRace}
                disabled={raceSaving || !newRace.date || !newRace.distance}
                className="flex-1 bg-brand/20 text-brand py-2 rounded-lg text-xs font-medium hover:bg-brand/30 disabled:opacity-50"
              >
                {raceSaving ? 'Adding...' : 'Add Race'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddRace(true)}
            className="w-full border border-dashed border-gray-700 text-gray-500 py-2 rounded-lg text-xs hover:border-brand hover:text-brand transition-colors"
          >
            + Add Race
          </button>
        )}
      </Section>

      {/* Body Comp Goals */}
      <Section title="Body Composition Goals">
        {bfRange && (
          <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1">Recommended BF% Range ({bfRange.label})</p>
            <p>Healthy: {bfRange.min}–{bfRange.max}% · Optimal: {bfRange.optimal.min}–{bfRange.optimal.max}%</p>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Target Body Fat (%)</label>
          <input
            type="number"
            step="0.5"
            value={targetBF}
            onChange={(e) => setTargetBF(e.target.value)}
            placeholder={bfRange ? `${bfRange.optimal.min}–${bfRange.optimal.max}` : '12'}
            className={inputClass}
          />
        </div>
        <button
          onClick={calculateGoals}
          disabled={goalSaving || !targetBF || !sex}
          className="w-full bg-brand/20 text-brand py-2 rounded-lg text-xs font-medium hover:bg-brand/30 disabled:opacity-50 transition-colors"
        >
          {goalSaving ? 'Calculating...' : 'Calculate Goal'}
        </button>

        {goalResult?.error && (
          <p className="text-xs text-warning">{goalResult.error}</p>
        )}

        {goalResult && !goalResult.error && (
          <div className="space-y-2">
            <div className={`text-xs px-3 py-2 rounded-lg ${goalResult.isAlreadyAtGoal ? 'bg-green-900/20 text-green-400' : goalResult.isFullyAchievable ? 'bg-green-900/20 text-green-400' : 'bg-yellow-900/20 text-yellow-400'}`}>
              {goalResult.message}
            </div>

            {!goalResult.isAlreadyAtGoal && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Target Weight</p>
                  <p className="text-gray-200 font-medium">{goalResult.achievableTargetWeight} lbs</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Weekly Rate</p>
                  <p className="text-gray-200 font-medium">{goalResult.weeklyRate} lbs/wk</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Cutting Weeks</p>
                  <p className="text-gray-200 font-medium">{goalResult.cuttingWeeks} weeks</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Total Loss</p>
                  <p className="text-gray-200 font-medium">{Math.min(goalResult.totalLossNeeded, goalResult.maxAchievableLoss)} lbs</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Projected Body Fat</p>
                  <p className="text-gray-200 font-medium">{goalResult.projectedBFPct}%</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-gray-500">Projected Lean Mass</p>
                  <p className="text-gray-200 font-medium">{goalResult.projectedLeanMass} lbs</p>
                </div>
              </div>
            )}

            {/* FFMI assessment */}
            {goalResult.ffmi > 0 && !goalResult.isAlreadyAtGoal && (
              <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">FFMI at Target</span>
                  <span className="text-gray-200 font-medium">{goalResult.ffmi}</span>
                </div>
                <p className="text-gray-500 mt-0.5">{goalResult.ffmiLabel}</p>
              </div>
            )}

            {/* Floor warning */}
            {goalResult.floorApplied && (
              <div className="text-xs px-3 py-2 rounded-lg bg-yellow-900/20 text-yellow-400">
                Height-based minimum weight ({goalResult.minWeight} lbs) applied. Target BF% was adjusted to {goalResult.projectedBFPct}% to stay above the safe weight floor.
              </div>
            )}

            {goalResult.milestones?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium">Milestones</p>
                {goalResult.milestones.map((m) => (
                  <div key={m.pctComplete} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-800/30">
                    <span className="text-gray-400">{m.pctComplete}% — {m.targetWeight} lbs</span>
                    <span className="text-gray-600">{new Date(m.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!sex && (
          <p className="text-xs text-gray-600">Set your biological sex in Profile above to get personalized recommendations.</p>
        )}
      </Section>

      {/* Training Preferences */}
      <Section title="Training Preferences">
        <div>
          <label className="block text-xs text-gray-500 mb-2">Training Days</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['mon-wed-fri', 'Mon / Wed / Fri'],
              ['tue-thu-sat', 'Tue / Thu / Sat'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTrainingDays(val)}
                className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                  trainingDays === val ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={savePreferences}
          disabled={prefSaving}
          className="w-full bg-brand/20 text-brand py-2 rounded-lg text-xs font-medium hover:bg-brand/30 disabled:opacity-50 transition-colors"
        >
          {prefSaving ? 'Saving...' : 'Save Preferences'}
        </button>
      </Section>

      {/* Account */}
      <Section title="Account">
        <p className="text-xs text-gray-500">{user?.email}</p>
        <button
          onClick={async () => { await logout(); navigate('/login') }}
          className="w-full border border-danger/30 text-danger py-2 rounded-lg text-xs font-medium hover:bg-danger/10 transition-colors"
        >
          Sign Out
        </button>
      </Section>
    </div>
  )
}
