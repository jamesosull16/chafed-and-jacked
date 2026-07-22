import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Dumbbell, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppMode } from '../../hooks/useAppMode'
import { useStrengthBlock } from '../../hooks/useStrengthBlock'
import { useFirestore, formatLocalDate } from '../../hooks/useFirestore'
import { calculateAge } from '../../lib/bodyMetrics'
import { Card, CardLabel, Badge, SkeletonPage, Button } from '../ui'
import BlockProgressCard from '../strength/BlockProgressCard'
import ChainBalanceCard from '../strength/ChainBalanceCard'
import VolumeLandmarks from '../strength/VolumeLandmarks'
import WeekSchedule from '../strength/WeekSchedule'
import WeightTrendCard from '../strength/WeightTrendCard'
import { UpperBodyBalance, MobilityCard, GuardrailsCard } from '../strength/BalanceExtras'
import NutritionPanel from './NutritionPanel'

/** Today's session, or the next one when today is a rest day. */
function TodaySessionCard({ session, isTrainingDay, completed }) {
  if (!session) return null

  const label = session.isToday ? 'Today' : session.date.toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <Card
      to={`/workout?day=${session.splitIndex}${completed ? '&review=1' : ''}`}
      elevated
      className="!bg-brand !border-brand"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-inverse/15 flex items-center justify-center shrink-0">
          <Dumbbell className="w-5 h-5 text-inverse" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-inverse/70 uppercase tracking-wide">
            {isTrainingDay ? label : `Next · ${label}`}
          </p>
          <p className="text-base font-semibold text-inverse truncate">{session.name}</p>
          <p className="text-xs text-inverse/70 truncate">
            {session.exercises.length} exercises · ~{session.estimatedMinutes} min · RIR{' '}
            {session.rirTarget}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-inverse/70 shrink-0" aria-hidden="true" />
      </div>
    </Card>
  )
}

export default function StrengthDashboard() {
  const { user, userProfile, updateStrengthSettings } = useAuth()
  const { strength, goal } = useAppMode()
  const { getDocument, getCollection } = useFirestore()
  const {
    loading,
    blockStatus,
    blockProgress,
    guardrails,
    balance,
    mobility,
    weekSchedule,
    todaysSession,
    isTrainingDay,
    todayLiftStats,
    bodyMetrics,
  } = useStrengthBlock()

  const [todayNutritionLog, setTodayNutritionLog] = useState(null)
  const [latest, setLatest] = useState({ weight: null, bodyFatPct: null })

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      try {
        const [log, metrics] = await Promise.all([
          getDocument(`nutritionLogs/${formatLocalDate()}`),
          getCollection('bodyMetrics', 'date', 'desc', 1),
        ])
        if (cancelled) return
        setTodayNutritionLog(log)
        setLatest({
          weight: metrics[0]?.weight ?? userProfile?.onboarding?.initialWeight ?? null,
          bodyFatPct: metrics[0]?.bodyFatPct ?? userProfile?.onboarding?.initialBodyFat ?? null,
        })
      } catch {
        // Non-fatal — the panels below degrade to their empty states.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user, getDocument, getCollection, userProfile])

  if (loading) return <SkeletonPage cards={4} />

  const todayCompleted = weekSchedule.some((d) => d.isToday && d.completed)

  return (
    <div className="space-y-4">
      <TodaySessionCard
        session={todaysSession}
        isTrainingDay={isTrainingDay}
        completed={todayCompleted}
      />

      {blockStatus.isComplete && (
        <Card className="bg-success-subtle border-success-border">
          <p className="text-sm font-medium text-success-strong">Block complete</p>
          <p className="text-xs text-muted mt-1">
            Twenty-two weeks done. Time to switch back to running mode in Settings, or set a new
            block.
          </p>
        </Card>
      )}

      <BlockProgressCard blockStatus={blockStatus} blockProgress={blockProgress} />

      <ChainBalanceCard chain={balance.chain} />

      <VolumeLandmarks volume={balance.volume} />

      <WeekSchedule schedule={weekSchedule} />

      <UpperBodyBalance pushPull={balance.pushPull} leftRight={balance.leftRight} />

      <MobilityCard mobility={mobility} />

      <WeightTrendCard
        bodyMetrics={bodyMetrics}
        goal={goal}
        currentSurplus={strength.calorieSurplus}
        onApplySurplus={(kcal) => updateStrengthSettings({ calorieSurplus: kcal })}
      />

      <NutritionPanel
        mode="strength"
        weightLbs={latest.weight}
        heightInches={userProfile?.profile?.heightInches || 0}
        ageYears={calculateAge(userProfile?.profile?.birthday)}
        sex={userProfile?.profile?.biologicalSex || 'male'}
        currentBodyFatPct={latest.bodyFatPct}
        todayLiftStats={todayLiftStats}
        todayNutritionLog={todayNutritionLog}
        strength={{ ...strength, isTrainingDay }}
      />

      <GuardrailsCard guardrails={guardrails} />

      <Card>
        <CardLabel>Coaching</CardLabel>
        <p className="text-sm text-muted mt-2">
          The S&amp;C Coach and Sports Nutritionist skills read this data live over MCP — ask them
          for today&apos;s session or what to eat next.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Badge tone="brand">Week {blockStatus.blockWeek}</Badge>
          <Badge tone="neutral">RIR {blockStatus.rirTarget}</Badge>
          {balance.chain.ratio != null && balance.chain.ratio !== Infinity && (
            <Badge tone="accent">{balance.chain.ratio}:1 chain</Badge>
          )}
        </div>
      </Card>

      <Link to="/history" className="block">
        <Button variant="secondary" fullWidth>
          Session history
        </Button>
      </Link>
    </div>
  )
}
