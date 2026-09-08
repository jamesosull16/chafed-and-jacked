import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Dumbbell, ChevronRight, Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppMode } from '../../hooks/useAppMode'
import { useStrengthBlock } from '../../hooks/useStrengthBlock'
import { useRunLog } from '../../hooks/useRunLog'
import { useFirestore, formatLocalDate } from '../../hooks/useFirestore'
import { calculateAge } from '../../lib/bodyMetrics'
import { trainingLoadSummary } from '../../lib/trainingLoad'
import { assessLogCoverage } from '../../lib/logCompleteness'
import { calculateBMR } from '../../lib/macroCalculator'
import { Card, CardLabel, Badge, SkeletonPage, Button } from '../ui'
import BlockProgressCard from '../strength/BlockProgressCard'
import ChainBalanceCard from '../strength/ChainBalanceCard'
import VolumeLandmarks from '../strength/VolumeLandmarks'
import WeekSchedule from '../strength/WeekSchedule'
import WeightTrendCard from '../strength/WeightTrendCard'
import RunLogCard from '../strength/RunLogCard'
import TrainingLoadCard from '../strength/TrainingLoadCard'
import { UpperBodyBalance, MobilityCard, GuardrailsCard } from '../strength/BalanceExtras'
import NutritionPanel from './NutritionPanel'

/** Today's session, or the next one when today is a rest day. */
function TodaySessionCard({ session, isTrainingDay }) {
  if (!session) return null

  const label = session.isToday ? 'Today' : session.date.toLocaleDateString('en-US', { weekday: 'long' })
  // Addressed by document id, not by split index: the reflow and the relabel
  // control both move which index a logged session answers to.
  const to = session.completed
    ? `/workout?day=${session.splitIndex}&review=1&session=${session.sessionId}`
    : `/workout?day=${session.splitIndex}`

  return (
    <Card
      to={to}
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
    getWeekSchedule,
    todaysSession,
    isTrainingDay,
    todayLiftStats,
    bodyMetrics,
    sessions,
  } = useStrengthBlock()

  // Runs are part of a strength day now, so the dashboard reads them and the
  // fuel panel below is fed both halves. Before this, a run logged through the
  // coach was invisible on every screen in strength mode.
  const {
    todayRuns,
    todayMiles,
    weekDailySum,
    weekDailyMinutes,
    allDailyMiles,
    addRun,
    deleteRun,
  } = useRunLog()

  // Lifting and running on one scale. `sessions` carries the lifts, the run log
  // the runs — the metric is worthless if it sees only half the week.
  const load = useMemo(
    () => trainingLoadSummary({ sessions, runs: allDailyMiles }),
    [sessions, allDailyMiles]
  )

  const [todayNutritionLog, setTodayNutritionLog] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [latest, setLatest] = useState({ weight: null, bodyFatPct: null })

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      try {
        const [log, metrics, week] = await Promise.all([
          getDocument(`nutritionLogs/${formatLocalDate()}`),
          getCollection('bodyMetrics', 'date', 'desc', 1),
          // The week, so the weight card can tell "the target is wrong" from
          // "the log cannot say". Without this the guardrail's logIncomplete
          // branch exists and never fires.
          getCollection('nutritionLogs', 'date', 'desc', 7),
        ])
        if (cancelled) return
        setTodayNutritionLog(log)
        setRecentLogs(week)
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

  const todayId = formatLocalDate()

  /**
   * How much of the week the food log can speak to.
   *
   * BMR is derived the same way the fuel panel derives it, from the latest
   * weigh-in, so the "below resting metabolism" line sits at the number the
   * rest of the dashboard already uses.
   */
  const logCoverage = useMemo(() => {
    if (!latest.weight) return null
    const byDate = new Map(recentLogs.map((d) => [d.id || d.date, d]))
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const dateId = formatLocalDate(d)
      return { dateId, log: dateId === todayId ? todayNutritionLog : byDate.get(dateId) || null }
    })
    // The real function, not a local copy of the formula — a second BMR in the
    // codebase is a second thing to keep in step, and this one draws a
    // threshold the guardrail acts on.
    const bmr = calculateBMR({
      weightKg: latest.weight / 2.205,
      heightCm: (userProfile?.profile?.heightInches || 70) * 2.54,
      age: calculateAge(userProfile?.profile?.birthday),
      sex: userProfile?.profile?.biologicalSex || 'male',
      bodyFatPct: latest.bodyFatPct,
    })
    return assessLogCoverage(days, { bmr, todayId })
  }, [recentLogs, todayNutritionLog, latest, todayId, userProfile])

  if (loading) return <SkeletonPage cards={4} />

  return (
    <div className="space-y-4">
      <TodaySessionCard session={todaysSession} isTrainingDay={isTrainingDay} />

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

      <WeekSchedule getWeek={getWeekSchedule} />

      <UpperBodyBalance pushPull={balance.pushPull} leftRight={balance.leftRight} />

      <MobilityCard mobility={mobility} />

      <RunLogCard
        todayRuns={todayRuns}
        weekDailySum={weekDailySum}
        weekDailyMinutes={weekDailyMinutes}
        onAddRun={addRun}
        onDeleteRun={deleteRun}
        today={formatLocalDate()}
      />

      <TrainingLoadCard load={load} />

      <WeightTrendCard
        bodyMetrics={bodyMetrics}
        goal={goal}
        currentSurplus={strength.calorieSurplus}
        onApplySurplus={(kcal) => updateStrengthSettings({ calorieSurplus: kcal })}
        logCoverage={logCoverage}
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
        dailyMiles={todayMiles || 0}
        weeklyMiles={weekDailySum}
        todayRuns={todayRuns}
        vo2max={userProfile?.profile?.vo2max || null}
        strength={{ ...strength, isTrainingDay }}
      />

      <GuardrailsCard guardrails={guardrails} />

      <Card to="/coach" interactive>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-subtle border border-brand-border flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-brand" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">Ask your coach</p>
            <p className="text-sm text-muted mt-0.5">
              Log a meal, get today&apos;s session, or ask why a number is what it is.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge tone="brand" size="xs">Week {blockStatus.blockWeek}</Badge>
              <Badge tone="neutral" size="xs">RIR {blockStatus.rirTarget}</Badge>
              {balance.chain.ratio != null && balance.chain.ratio !== Infinity && (
                <Badge tone="accent" size="xs">{balance.chain.ratio}:1 chain</Badge>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-subtle shrink-0 mt-1" aria-hidden="true" />
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
