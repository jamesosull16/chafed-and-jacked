import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useStrengthBlock } from '../hooks/useStrengthBlock'
import { useCoachChat } from '../hooks/useCoachChat'
import { useFirestore, formatLocalDate } from '../hooks/useFirestore'
import { getNutritionAdvice } from '../lib/nutritionAdvice'
import { calculateAge } from '../lib/bodyMetrics'
import { prepareImage } from '../lib/mealEstimation'
import { SkeletonPage } from '../components/ui'
import { cn } from '../components/ui/cn'
import ContextStrip from '../components/chat/ContextStrip'
import Composer from '../components/chat/Composer'
import {
  FoodLogCard,
  MealOptionsCard,
  SessionCard,
  AdjustmentCard,
} from '../components/chat/cards'

function Bubble({ role, children, isError }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-brand text-inverse rounded-br-md'
            : isError
              ? 'bg-danger-subtle text-danger-strong border border-danger-border rounded-bl-md'
              : 'bg-bg text-text border border-border-default rounded-bl-md'
        )}
      >
        {children}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-bg border border-border-default rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1" aria-label="Coach is typing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-subtle"
              style={{ animation: `cj-pulse 1.2s ease-in-out ${i * 0.18}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Cards({ cards, onLogOption, loggingIndex }) {
  if (!cards?.length) return null
  return (
    <div className="flex flex-col items-start gap-2">
      {cards.map((card, i) => {
        switch (card.type) {
          case 'food_log':
            return <FoodLogCard key={i} entry={card.entry} corrected={card.corrected} />
          case 'meal_options':
            return (
              <MealOptionsCard
                key={i}
                options={card.options}
                onLog={onLogOption}
                loggingIndex={loggingIndex}
              />
            )
          case 'session':
            return <SessionCard key={i} session={card.session} />
          case 'adjustment':
            return <AdjustmentCard key={i} card={card} />
          default:
            return null
        }
      })}
    </div>
  )
}

export default function CoachChat() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const { isStrength, strength } = useAppMode()
  const { getCollection, getDocument } = useFirestore()
  const block = useStrengthBlock()

  const [latest, setLatest] = useState({ weight: null, bodyFatPct: null })
  const [todayLog, setTodayLog] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  const [loggingIndex, setLoggingIndex] = useState(null)
  const threadEndRef = useRef(null)

  const todayId = formatLocalDate()

  const refreshTotals = useCallback(async () => {
    try {
      setTodayLog(await getDocument(`nutritionLogs/${todayId}`))
    } catch {
      // Totals just stay stale until the next turn.
    }
  }, [getDocument, todayId])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      try {
        const [metrics, log] = await Promise.all([
          getCollection('bodyMetrics', 'date', 'desc', 1),
          getDocument(`nutritionLogs/${todayId}`),
        ])
        if (cancelled) return
        setLatest({
          weight: metrics[0]?.weight ?? userProfile?.onboarding?.initialWeight ?? null,
          bodyFatPct: metrics[0]?.bodyFatPct ?? userProfile?.onboarding?.initialBodyFat ?? null,
        })
        setTodayLog(log)
      } catch {
        // Context strip falls back to its empty state.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user, getCollection, getDocument, todayId, userProfile])

  const advice = useMemo(() => {
    if (!latest.weight) return null
    return getNutritionAdvice({
      mode: isStrength ? 'strength' : 'running',
      weightLbs: latest.weight,
      heightInches: userProfile?.profile?.heightInches || 0,
      ageYears: calculateAge(userProfile?.profile?.birthday),
      sex: userProfile?.profile?.biologicalSex || 'male',
      currentBodyFatPct: latest.bodyFatPct,
      todayLiftStats: block.todayLiftStats,
      strength: { ...strength, isTrainingDay: block.isTrainingDay },
    })
  }, [latest, isStrength, userProfile, strength, block.todayLiftStats, block.isTrainingDay])

  const targets = useMemo(() => {
    if (!advice) return null
    return {
      kcal: advice.calories.target,
      protein_g: advice.protein.grams,
      carbs_g: Math.round((advice.carbs.lowGrams + advice.carbs.highGrams) / 2),
      fat_g: advice.fat.grams,
    }
  }, [advice])

  const consumed = useMemo(() => {
    const entries = todayLog?.entries || []
    return entries.reduce(
      (acc, e) => ({
        kcal: acc.kcal + (e.kcal || 0),
        protein_g: acc.protein_g + (e.protein || 0),
        carbs_g: acc.carbs_g + (e.carbs || 0),
        fat_g: acc.fat_g + (e.fat || 0),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    )
  }, [todayLog])

  const remaining = useMemo(() => {
    if (!targets) return null
    return {
      kcal: targets.kcal - consumed.kcal,
      protein_g: targets.protein_g - consumed.protein_g,
      carbs_g: targets.carbs_g - consumed.carbs_g,
      fat_g: targets.fat_g - consumed.fat_g,
    }
  }, [targets, consumed])

  /**
   * The advisory half of the turn context. Everything security-relevant — the
   * uid, injury flags, block week, and the meal ids the coach may correct — is
   * re-derived server-side from the stored profile and log.
   */
  const buildContext = useCallback(
    () => ({
      targets,
      derivation: advice ? { basis: advice.calories.breakdown } : null,
      session: block.todaysSession
        ? {
            name: block.todaysSession.name,
            focus: block.todaysSession.focus,
            isToday: block.todaysSession.isToday,
            dayLabel: block.todaysSession.date?.toLocaleDateString('en-US', { weekday: 'long' }),
            rirTarget: block.todaysSession.rirTarget,
            estimatedMinutes: block.todaysSession.estimatedMinutes,
            exercises: block.todaysSession.exercises.map((e) => ({
              id: e.id,
              name: e.name,
              sets: e.sets,
              repRange: e.repRange,
              restSeconds: e.restSeconds,
              modification: e.modification || null,
            })),
            substitutions: block.todaysSession.substitutions,
          }
        : null,
      block: {
        totalWeeks: block.blockStatus.totalWeeks,
        mesocycle: block.blockStatus.mesocycle,
        weekInMesocycle: block.blockStatus.weekInMesocycle,
        phase: block.blockStatus.phase,
        rirTarget: block.blockStatus.rirTarget,
      },
      balance: {
        ratio: block.balance.chain.ratio,
        posteriorSets: block.balance.chain.posteriorSets,
        anteriorSets: block.balance.chain.anteriorSets,
        status: block.balance.chain.status,
        perMuscle: Object.fromEntries(
          block.balance.volume.map((v) => [
            v.muscle,
            { sets: v.sets, status: v.status, capped: v.capped },
          ])
        ),
      },
    }),
    [targets, advice, block.todaysSession, block.blockStatus, block.balance]
  )

  const { messages, pending, loading, sending, error, send } = useCoachChat({ buildContext })

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending, sending])

  async function handlePickPhoto(file) {
    setPhotoError(null)
    try {
      setPhoto(await prepareImage(file))
    } catch (err) {
      setPhotoError(err.message)
    }
  }

  async function handleSend(text) {
    const attached = photo
    setPhoto(null)
    const result = await send({ text, photo: attached })
    if (result?.logMutated) await refreshTotals()
  }

  async function handleLogOption(option, index) {
    setLoggingIndex(index)
    const result = await send({
      text: `Log option ${index + 1}: ${option.name} — ${option.description}`,
    })
    if (result?.logMutated) await refreshTotals()
    setLoggingIndex(null)
  }

  if (loading || block.loading) return <SkeletonPage cards={3} />

  const isEmpty = messages.length === 0 && !pending

  return (
    // Pinned to the viewport above the bottom nav, so the thread scrolls
    // internally and the composer stays reachable. Letting the page scroll
    // instead would push the composer off-screen the moment the thread grows.
    <div className="fixed inset-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] flex flex-col bg-bg">
      <div className="w-full max-w-lg mx-auto flex flex-col flex-1 min-h-0">
      <header className="shrink-0 bg-bg border-b border-border-default">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to dashboard"
            className="p-2 -ml-2 rounded-xl text-muted hover:text-text hover:bg-surface"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-brand-subtle border border-brand-border flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-brand" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-text">Coach</h1>
            <p className="text-xs text-muted truncate">
              <span className="text-success" aria-hidden="true">
                ●
              </span>{' '}
              Strength &amp; nutrition
            </p>
          </div>
        </div>

        <ContextStrip
          targets={targets}
          remaining={remaining}
          session={block.todaysSession}
          onSessionTap={() => handleSend("What's today's session?")}
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-surface/40">
        {isEmpty && (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-brand-subtle flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-brand" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-text">
              Morning, {(user?.displayName || 'there').split(' ')[0]}
            </p>
            <p className="text-sm text-muted mt-1 max-w-xs mx-auto">
              {remaining
                ? `You've got ${Math.round(remaining.kcal).toLocaleString()} kcal and ${Math.round(remaining.protein_g)}g protein left today. Snap a photo or tell me what you ate.`
                : 'Ask me about training or food — or tell me what you ate and I\'ll log it.'}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.photoPreview && (
              <div className="flex justify-end">
                <img
                  src={message.photoPreview}
                  alt="Meal you sent"
                  className="max-w-[200px] rounded-2xl border border-border-default"
                />
              </div>
            )}
            {message.content && (
              <Bubble role={message.role} isError={message.isError}>
                {message.content}
              </Bubble>
            )}
            <Cards
              cards={message.cards}
              onLogOption={handleLogOption}
              loggingIndex={loggingIndex}
            />
          </div>
        ))}

        {pending && (
          <div className="space-y-2">
            {pending.photoPreview && (
              <div className="flex justify-end">
                <img
                  src={pending.photoPreview}
                  alt="Meal you sent"
                  className="max-w-[200px] rounded-2xl border border-border-default opacity-70"
                />
              </div>
            )}
            {pending.content && (
              <Bubble role="user">
                <span className="opacity-80">{pending.content}</span>
              </Bubble>
            )}
          </div>
        )}

        {sending && <TypingIndicator />}

        {photoError && (
          <p className="text-xs text-danger-strong text-center">{photoError}</p>
        )}
        {error && !sending && (
          <p className="text-xs text-danger-strong text-center">{error}</p>
        )}

        <div ref={threadEndRef} />
      </div>

      <div className="shrink-0">
        <Composer
          onSend={handleSend}
          onPickPhoto={handlePickPhoto}
          photo={photo}
          onClearPhoto={() => setPhoto(null)}
          disabled={sending}
        />
      </div>
      </div>
    </div>
  )
}
