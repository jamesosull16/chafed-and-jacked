import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppMode } from '../hooks/useAppMode'
import { useStrengthBlock } from '../hooks/useStrengthBlock'
import { useWorkout } from '../hooks/useWorkout'
import { useCoachChat } from '../hooks/useCoachChat'
import {
  buildCoachContext,
  buildSessionContext,
  buildUpcomingSessions,
} from '../lib/coachContext'
import { useFirestore, formatLocalDate } from '../hooks/useFirestore'
import { useSavedMeals } from '../hooks/useSavedMeals'
import { getNutritionAdvice } from '../lib/nutritionAdvice'
import { calculateAge } from '../lib/bodyMetrics'
import { prepareImage } from '../lib/mealEstimation'
import { entryToSavedMeal } from '../lib/savedMeals'
import { SkeletonPage } from '../components/ui'
import SaveMealSheet from '../components/nutrition/SaveMealSheet'
import MealDetailSheet from '../components/nutrition/MealDetailSheet'
import { replaceLogEntry, findEntryById } from '../lib/nutritionLog'
import { cn } from '../components/ui/cn'
import ContextStrip from '../components/chat/ContextStrip'
import Composer from '../components/chat/Composer'
import {
  FoodLogCard,
  MealOptionsCard,
  SessionCard,
  AdjustmentCard,
  FuellingCard,
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

function Cards({ cards, onLogOption, loggingIndex, onSaveMeal, onEditMeal, isSaved }) {
  if (!cards?.length) return null
  return (
    <div className="flex flex-col items-start gap-2">
      {cards.map((card, i) => {
        switch (card.type) {
          case 'food_log':
            return (
              <FoodLogCard
                key={i}
                entry={card.entry}
                corrected={card.corrected}
                onEdit={() => onEditMeal(card.entry)}
                onSave={() => onSaveMeal(card.entry)}
                saved={isSaved(card.entry.label)}
              />
            )
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
          case 'fuelling':
            return (
              <FuellingCard
                key={i}
                card={card}
                onLog={onLogOption}
                loggingIndex={loggingIndex}
              />
            )
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
  const { getCollection, getDocument, userRef } = useFirestore()
  // Both engines, selected by mode — the same shape NutritionTracker uses.
  // Hooks cannot be called conditionally, and the page needs whichever one the
  // athlete is actually training under. Previously only the strength block was
  // read, so in running mode the coach was handed a lifting block's context or
  // nothing at all.
  const block = useStrengthBlock()
  const running = useWorkout()

  const [latest, setLatest] = useState({ weight: null, bodyFatPct: null })
  const [todayLog, setTodayLog] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  const [loggingIndex, setLoggingIndex] = useState(null)
  const [savingEntry, setSavingEntry] = useState(null)
  /** The logged meal whose portions are open, and whether they can be changed. */
  const [editing, setEditing] = useState(null)
  const threadRef = useRef(null)
  const [threadMounted, setThreadMounted] = useState(false)
  const threadEndRef = useRef(null)
  const openedAtBottom = useRef(false)
  const library = useSavedMeals()

  const todayId = formatLocalDate()

  // The node in a ref, its presence in state — the scroll-to-bottom effect
  // needs to re-run on the commit where the container appears, and a ref alone
  // is invisible to the dependency array.
  const attachThread = useCallback((node) => {
    threadRef.current = node
    setThreadMounted(!!node)
  }, [])

  /**
   * Open a logged meal's portions from its card.
   *
   * The card is a record of a turn, and turns persist — a food card from
   * Tuesday is still in the thread on Thursday, by which point its entry is on
   * a log this page can't write to. So the stored entry is looked up first, and
   * only a meal still on today's log opens as editable. The rest open as what
   * they are: a receipt.
   */
  const openForEdit = useCallback(
    async (entry) => {
      try {
        const log = await getDocument(`nutritionLogs/${todayId}`)
        const stored = findEntryById(log?.entries, entry.id)
        setEditing({ entry: stored || entry, editable: !!stored })
      } catch {
        setEditing({ entry, editable: false })
      }
    },
    [getDocument, todayId]
  )

  /**
   * Write a corrected entry back over the stored one.
   *
   * The log is re-read rather than trusting the copy the card was built from:
   * `arrayRemove` matches whole objects, and a card can be minutes or hours old
   * by the time its button is tapped.
   *
   * No `targets` — this page's copy is in the coach-context shape (`protein_g`),
   * not the log's (`protein`), and writing it here would quietly corrupt the
   * numbers the day is judged against.
   */
  async function saveEntryEdit(next) {
    const log = await getDocument(`nutritionLogs/${todayId}`)
    const previous = findEntryById(log?.entries, next.id)
    if (!previous) return
    await replaceLogEntry(userRef(`nutritionLogs/${todayId}`), {
      previous,
      next,
      dateId: todayId,
    })
    await refreshTotals()
  }

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
      todayLiftStats: isStrength ? block.todayLiftStats : running.todayLiftStats,
      strength: { ...strength, isTrainingDay: block.isTrainingDay },
      // Running mode adds an explicit run-calorie term and drops the strength
      // activity factor, so these change the target rather than decorate it.
      dailyMiles: isStrength ? 0 : running.todayMiles || 0,
      weeklyMiles: isStrength ? 0 : running.currentMileage || 0,
      trainingPhase: running.weekInfo?.type || 'build',
      todayRuns: isStrength ? null : running.todayRuns,
      vo2max: userProfile?.profile?.vo2max || null,
    })
  }, [
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
  ])

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

  const sessionContext = useMemo(
    () =>
      buildSessionContext({
        isStrength,
        strengthSession: block.todaysSession,
        runningSession: isStrength ? null : running.getTodaysWorkout?.(),
      }),
    [isStrength, block.todaysSession, running]
  )

  // Recomputed only when the schedule itself changes, not per turn — this is
  // a fortnight's projection and nothing in it moves between messages.
  const upcoming = useMemo(
    () =>
      buildUpcomingSessions({
        isStrength,
        strength,
        blockStart: strength.blockStart,
        blockEnd: strength.blockEnd,
        runningTrainingDays: userProfile?.onboarding?.trainingDays,
        runningWeeklyMiles: isStrength ? null : running.currentMileage || 0,
      }),
    [isStrength, strength, userProfile, running.currentMileage]
  )

  /**
   * The advisory half of the turn context. Everything security-relevant — the
   * uid, injury flags, block week, and the meal ids the coach may correct — is
   * re-derived server-side from the stored profile and log.
   */
  const buildContext = useCallback(
    () => buildCoachContext({ isStrength, targets, advice, session: sessionContext, block, upcoming }),
    [isStrength, targets, advice, sessionContext, block, upcoming]
  )

  const { messages, pending, loading, sending, error, send } = useCoachChat({ buildContext })

  /**
   * Open on the newest message, not the oldest.
   *
   * A thread is history: the interesting end is the bottom, and every visit was
   * starting at the top of it and asking to be scrolled. This jumps before the
   * browser paints — `useLayoutEffect` and an instant `scrollTop`, not the
   * smooth scroll used while chatting — so the thread is simply *already* at the
   * bottom rather than visibly flying there on every open.
   *
   * The container mounting is itself a dependency, which is what the state flag
   * is for. The page is gated on two independent loads — the thread and the
   * block — and the scroll container only exists once both are done. Depending
   * on `[loading, messages]` alone missed the commit where the container
   * appeared whenever the block resolved last: nothing in those deps changed,
   * so the effect never re-ran and the jump silently didn't happen. Which load
   * won the race decided whether the feature worked.
   */
  useLayoutEffect(() => {
    const thread = threadRef.current
    if (openedAtBottom.current || !threadMounted || !thread || !messages.length) return

    const pin = () => {
      thread.scrollTop = thread.scrollHeight
    }
    pin()
    openedAtBottom.current = true

    // A meal photo in the history reserves no height until it decodes, so the
    // thread grows a beat after the jump and leaves the newest message just
    // off-screen. Re-pin as they land, and stop the moment he scrolls himself —
    // `load` doesn't bubble, hence the capture listener.
    const onLoad = (e) => {
      if (e.target.tagName === 'IMG') pin()
    }
    const stop = () => {
      thread.removeEventListener('load', onLoad, true)
      thread.removeEventListener('wheel', stop)
      thread.removeEventListener('touchmove', stop)
    }
    thread.addEventListener('load', onLoad, true)
    thread.addEventListener('wheel', stop)
    thread.addEventListener('touchmove', stop)
    return stop
  }, [threadMounted, messages])

  // Keep the newest message in view as the thread grows. Smooth here, because
  // this one follows a message the athlete just watched appear.
  useEffect(() => {
    if (!openedAtBottom.current) return
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

  // Only the active engine gates the page. Waiting on both would hold the
  // thread behind a load the athlete's mode doesn't depend on.
  if (loading || (isStrength ? block.loading : running.loading)) return <SkeletonPage cards={3} />

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
              {isStrength ? 'Strength & nutrition' : 'Endurance & nutrition'}
            </p>
          </div>
        </div>

        <ContextStrip
          targets={targets}
          remaining={remaining}
          session={sessionContext}
          isStrength={isStrength}
          running={
            isStrength
              ? null
              : {
                  todayMiles: running.todayMiles || 0,
                  weeklyMiles: running.currentMileage || 0,
                  raceName: running.activeRace?.name || null,
                  raceDaysLeft: running.raceDaysLeft,
                  weekType: running.weekInfo?.type || null,
                }
          }
          onSessionTap={() => handleSend("What's today's session?")}
          onRunTap={() => handleSend('How is my mileage tracking this week?')}
        />
      </header>

      <div
        ref={attachThread}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-surface/40"
      >
        {isEmpty && (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-brand-subtle flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-brand" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-text">
              Morning, {(user?.displayName || 'there').split(' ')[0]}
            </p>
            {/* An invitation to talk, not an instruction to photograph food —
                logging is one thing the coach does, not the point of it. */}
            <p className="text-sm text-muted mt-1 max-w-xs mx-auto">
              {isStrength
                ? "Ask me about your session, how you're recovering, or what to eat. Tell me what you ate and I'll log it."
                : "Ask me about your build, a session, or fuelling a long one. Tell me what you ran or ate and I'll log it."}
            </p>
            {remaining && (
              <p className="text-xs text-subtle mt-2">
                {Math.round(remaining.kcal).toLocaleString()} kcal and{' '}
                {Math.round(remaining.protein_g)}g protein left today
              </p>
            )}
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
              onSaveMeal={setSavingEntry}
              onEditMeal={openForEdit}
              isSaved={(name) => !!library.findByName(name)}
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

      {/* Saving from a chat card writes to the same library the Fuel page
          reads — a meal the coach logged is savable without leaving the
          thread. */}
      {/* Opens straight into the amounts — the button says "Edit portions",
          so landing on a read-only breakdown would be a wasted tap. */}
      <MealDetailSheet
        open={!!editing}
        entry={editing?.entry}
        startInEdit
        onClose={() => setEditing(null)}
        onSave={editing?.editable ? saveEntryEdit : undefined}
        note={
          editing && !editing.editable
            ? 'This meal is no longer on today’s log, so its portions can be read but not changed.'
            : undefined
        }
      />

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

      <div className="shrink-0">
        <Composer
          onSend={handleSend}
          onPickPhoto={handlePickPhoto}
          photo={photo}
          onClearPhoto={() => setPhoto(null)}
          disabled={sending}
          isStrength={isStrength}
        />
      </div>
      </div>
    </div>
  )
}
