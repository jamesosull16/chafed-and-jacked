import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Onboarding() {
  const { user, userProfile, completeOnboarding, loading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [data, setData] = useState({
    initialWeight: '',
    initialBodyFat: '',
    initialBMI: '',
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
    await completeOnboarding({
      initialWeight: parseFloat(data.initialWeight) || 0,
      initialBodyFat: parseFloat(data.initialBodyFat) || 0,
      initialBMI: parseFloat(data.initialBMI) || 0,
      baselineMileage: parseFloat(data.baselineMileage) || 0,
      trainingDays: data.trainingDays,
    })
    navigate('/')
  }

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

    // Step 1: Body metrics
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
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
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
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">BMI</label>
          <input
            type="number"
            step="0.1"
            value={data.initialBMI}
            onChange={(e) => update('initialBMI', e.target.value)}
            placeholder="24.1"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setStep(0)} className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-lg hover:bg-gray-900 transition-colors">Back</button>
        <button
          onClick={() => setStep(2)}
          disabled={!data.initialWeight}
          className="flex-1 bg-brand hover:bg-brand-light text-white py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>,

    // Step 2: Running baseline
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
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand"
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
        <button onClick={() => setStep(1)} className="flex-1 border border-gray-700 text-gray-400 py-3 rounded-lg hover:bg-gray-900 transition-colors">Back</button>
        <button
          onClick={handleComplete}
          disabled={submitting || !data.baselineMileage}
          className="flex-1 bg-brand hover:bg-brand-light text-white py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Start Training'}
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">{steps[step]}</div>
    </div>
  )
}
