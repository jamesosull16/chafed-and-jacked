import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { calculateProgramStart } from '../lib/periodization'
import { calculateBMI } from '../lib/bodyMetrics'

const RACE_DISTANCES = [
  { value: '26.2', label: 'Marathon (26.2 mi)' },
  { value: '31', label: '50K (31 mi)' },
  { value: '50', label: '50 Mile' },
  { value: '62', label: '100K (62 mi)' },
  { value: '100', label: '100 Mile' },
  { value: 'custom', label: 'Custom Distance' },
]

export default function Onboarding() {
  const { user, userProfile, completeOnboarding, loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState({
    // Personal info
    birthday: '',
    biologicalSex: '',
    heightFeet: '',
    heightInches: '',
    // Body metrics
    initialWeight: '',
    initialBodyFat: '',
    // Race
    raceName: '',
    raceDistance: '',
    raceDistanceCustom: '',
    raceDate: '',
    // Running baseline
    baselineMileage: '',
    trainingDays: 'mon-wed-fri',
  })

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (userProfile?.onboarding?.completed) return <Navigate to="/" replace />

  function update(field, value) {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  async function handleComplete() {
    setSubmitting(true)

    const distance = parseFloat(data.raceDistance === 'custom' ? data.raceDistanceCustom : data.raceDistance) || 0
    const raceDate = data.raceDate ? new Date(data.raceDate + 'T00:00:00') : null
    const programStart = raceDate ? calculateProgramStart(raceDate) : null

    const race = raceDate ? {
      id: crypto.randomUUID(),
      name: data.raceName || 'A Race',
      distance,
      distanceUnit: 'miles',
      date: data.raceDate,
      isARace: true,
      programStart: programStart.toISOString().slice(0, 10),
    } : null

    const heightTotalInches = ((parseInt(data.heightFeet) || 0) * 12) + (parseInt(data.heightInches) || 0)
    const weight = parseFloat(data.initialWeight) || 0
    const bmi = calculateBMI(weight, heightTotalInches)

    await completeOnboarding({
      initialWeight: weight,
      initialBodyFat: parseFloat(data.initialBodyFat) || 0,
      initialBMI: bmi,
      baselineMileage: parseFloat(data.baselineMileage) || 0,
      trainingDays: data.trainingDays,
      profile: {
        birthday: data.birthday || '',
        biologicalSex: data.biologicalSex || '',
        heightInches: heightTotalInches || 0,
      },
      races: race ? [race] : [],
    })
    navigate('/')
  }

  const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand'
  const backBtnClass = 'flex-1 border border-gray-700 text-gray-400 py-3 rounded-lg hover:bg-gray-900 transition-colors'
  const nextBtnClass = 'flex-1 bg-brand hover:bg-brand-light text-white py-3 rounded-lg transition-colors disabled:opacity-50'

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center space-y-4">
      <img src="/favicon.svg" alt="" className="w-16 h-16 mx-auto" />
      <h2 className="text-2xl font-bold text-brand">Welcome to Chafed & Jacked</h2>
      <p className="text-gray-400">
        Let's set up your strength program. We need a few baseline numbers from you —
        think of it as the "before" photo your knees will use in their lawsuit.
      </p>
      <button
        onClick={() => setStep(1)}
        className="bg-brand hover:bg-brand-light text-white font-medium py-3 px-8 rounded-lg transition-colors"
      >
        Let's Go
      </button>
    </div>,

    // Step 1: Personal Info (NEW)
    <div key="personal" className="space-y-4">
      <h2 className="text-xl font-bold">About You</h2>
      <p className="text-gray-400 text-sm">Used for body composition recommendations and safe rate-of-change calculations.</p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Birthday</label>
          <input
            type="date"
            value={data.birthday}
            onChange={(e) => update('birthday', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Height</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={data.heightFeet}
                onChange={(e) => update('heightFeet', e.target.value)}
                placeholder="5"
                className={inputClass}
              />
              <span className="text-xs text-gray-600 mt-0.5 block">ft</span>
            </div>
            <div className="flex-1">
              <input
                type="number"
                value={data.heightInches}
                onChange={(e) => update('heightInches', e.target.value)}
                placeholder="10"
                className={inputClass}
              />
              <span className="text-xs text-gray-600 mt-0.5 block">in</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Biological Sex</label>
          <p className="text-xs text-gray-600 mb-2">Affects body fat range recommendations only.</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['male', 'Male'],
              ['female', 'Female'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => update('biologicalSex', val)}
                className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                  data.biologicalSex === val
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-gray-700 text-gray-400 hover:bg-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setStep(0)} className={backBtnClass}>Back</button>
        <button
          onClick={() => setStep(2)}
          disabled={!data.birthday || !data.biologicalSex || !data.heightFeet}
          className={nextBtnClass}
        >
          Next
        </button>
      </div>
    </div>,

    // Step 2: Body metrics
    <div key="body" className="space-y-4">
      <h2 className="text-xl font-bold">Body Metrics</h2>
      <p className="text-gray-400 text-sm">From your Garmin Index scale, or best estimate.</p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Bodyweight (lbs)</label>
          <input
            type="number"
            step="0.1"
            value={data.initialWeight}
            onChange={(e) => update('initialWeight', e.target.value)}
            placeholder="175"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Body Fat (%)</label>
          <input
            type="number"
            step="0.1"
            value={data.initialBodyFat}
            onChange={(e) => update('initialBodyFat', e.target.value)}
            placeholder="18.5"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setStep(1)} className={backBtnClass}>Back</button>
        <button
          onClick={() => setStep(3)}
          disabled={!data.initialWeight}
          className={nextBtnClass}
        >
          Next
        </button>
      </div>
    </div>,

    // Step 3: A-Race (NEW)
    <div key="race" className="space-y-4">
      <h2 className="text-xl font-bold">Your A Race</h2>
      <p className="text-gray-400 text-sm">This drives your taper timing, periodization, and body comp goals. You can add more races later.</p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Race Name</label>
          <input
            type="text"
            value={data.raceName}
            onChange={(e) => update('raceName', e.target.value)}
            placeholder="e.g. Leadville 100"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Distance</label>
          <div className="grid grid-cols-2 gap-2">
            {RACE_DISTANCES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => update('raceDistance', value)}
                className={`py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  data.raceDistance === value
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-gray-700 text-gray-400 hover:bg-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {data.raceDistance === 'custom' && (
            <input
              type="number"
              step="0.1"
              value={data.raceDistanceCustom}
              onChange={(e) => update('raceDistanceCustom', e.target.value)}
              placeholder="Distance in miles"
              className={`${inputClass} mt-2`}
            />
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Race Date</label>
          <input
            type="date"
            value={data.raceDate}
            onChange={(e) => update('raceDate', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-gray-600">You can skip this and add races later in Settings.</p>
      <div className="flex gap-3">
        <button onClick={() => setStep(2)} className={backBtnClass}>Back</button>
        <button
          onClick={() => setStep(4)}
          className={nextBtnClass}
        >
          {data.raceDate ? 'Next' : 'Skip for Now'}
        </button>
      </div>
    </div>,

    // Step 4: Running baseline + training days
    <div key="running" className="space-y-4">
      <h2 className="text-xl font-bold">Running Baseline</h2>
      <p className="text-gray-400 text-sm">What's your current weekly mileage?</p>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Weekly Mileage (miles)</label>
        <input
          type="number"
          step="1"
          value={data.baselineMileage}
          onChange={(e) => update('baselineMileage', e.target.value)}
          placeholder="40"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Preferred Training Days</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['mon-wed-fri', 'Mon / Wed / Fri'],
            ['tue-thu-sat', 'Tue / Thu / Sat'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => update('trainingDays', val)}
              className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                data.trainingDays === val
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-gray-700 text-gray-400 hover:bg-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setStep(3)} className={backBtnClass}>Back</button>
        <button
          onClick={handleComplete}
          disabled={submitting || !data.baselineMileage}
          className={nextBtnClass}
        >
          {submitting ? 'Saving...' : 'Start Training'}
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? 'w-6 bg-brand' : i < step ? 'w-3 bg-brand/50' : 'w-3 bg-gray-700'
              }`}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  )
}
