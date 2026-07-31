/**
 * COACH ORCHESTRATOR — Chafed & Jacked
 *
 * Runs one conversational turn: build the request, let the model call tools
 * until it is done, and return the reply plus any cards the tools produced.
 *
 * A manual loop rather than the SDK tool runner, for two reasons: cards are
 * accumulated as a side effect of tool execution and need to come back in
 * order alongside the final text, and the loop is trivially testable against a
 * mocked client — which matters, because the routing behaviour (does a training
 * question reach the training tools?) is the thing most worth testing.
 *
 * The Anthropic client is injected. This module makes no network calls itself.
 */

import { buildSystemPrompt, buildContextBlock } from './prompt.js'
import { TOOL_DEFINITIONS, createHandlers, ToolError } from './tools.js'
import { HISTORY_TURNS } from './history.js'

export const MODEL = 'claude-opus-4-8'

/** Enough for a log-then-explain turn plus a correction; well short of a loop. */
export const MAX_ITERATIONS = 8

export { HISTORY_TURNS }

// ── Reasoning effort ──────────────────────────────────────────
//
// A blanket `effort: 'low'` was right when the Coach only logged food: those
// turns are a transcription and a lookup, and latency is the whole experience.
// It is wrong for a coaching turn, where the answer is a judgement across
// training, fuelling and injury state, and 2048 tokens doesn't hold one.
//
// Two tiers rather than five, because the interesting distinction is binary —
// "transcribe this" versus "decide something" — and a middle tier would only
// invite arguing about which side a turn falls on.

export const TURN_TIERS = Object.freeze({
  logging: { effort: 'low', maxTokens: 2048 },
  coaching: { effort: 'high', maxTokens: 4096 },
})

/**
 * Tools whose use means the turn is a coaching turn, whatever it looked like
 * on the way in. Reading training history or authoring a plan card is not
 * something a meal log does — so the model reaching for one of these is
 * evidence the classifier was wrong, and better evidence than the shape of
 * the text, because the model has read the turn and the classifier hasn't.
 */
const COACHING_TOOLS = new Set([
  'get_workout',
  'get_training_history',
  'get_exercise_progress',
  'get_body_metrics',
  'estimate_session_cost',
  'propose_fuelling',
  'propose_adjustment',
  'show_session',
])

/**
 * Longest message still treated as a bare log entry. "2 eggs, toast and a
 * flat white" is nine words; anything materially longer is a person talking,
 * not itemising. Deliberately a shape heuristic and not a keyword match —
 * matching on words like "should" or "why" is the brittle routing this
 * design already rejected once, and it fails on the turns that matter most.
 */
const LOG_ENTRY_WORDS = 12

/**
 * Which tier a turn starts in.
 *
 * Wrong in the cheap direction on purpose: a misjudged coaching turn is
 * caught mid-loop by the tool escalation above, whereas a misjudged logging
 * turn only costs latency on the app's most frequent interaction.
 *
 * `previousTier` is the tier of the last coach reply while the conversation is
 * still warm. It exists because shape alone cannot separate a short follow-up
 * from a short meal entry — they are the same shape, and only the exchange
 * around them differs. It is also what keeps the tier stable across a
 * conversation, which matters beyond correctness: `effort` is part of the
 * prompt-cache key, so every flip rewrites the 6384-token prefix instead of
 * reading it.
 */
export function classifyTurn({ message, photo, trigger, previousTier }) {
  // The post-workout message is the hardest call the Coach makes — it decides
  // whether to speak at all, and the restraint rules are the thing most likely
  // to be reasoned away at low effort.
  if (trigger) return 'coaching'

  const text = message?.trim() || ''

  // A photo is a meal being logged, whatever was being discussed before it —
  // so it beats the sticky tier rather than inheriting it. Unless he attached
  // a question to it, in which case he is asking rather than logging.
  if (photo) return text.includes('?') ? 'coaching' : 'logging'

  if (text.includes('?')) return 'coaching'
  if (text.split(/\s+/).length > LOG_ENTRY_WORDS) return 'coaching'

  // Short, unpunctuated, no photo: ambiguous on its own. Mid-conversation it
  // is a follow-up; on its own it is a meal.
  return previousTier === 'coaching' ? 'coaching' : 'logging'
}

export class CoachError extends Error {
  constructor(message, code = 'internal') {
    super(message)
    this.name = 'CoachError'
    this.code = code
  }
}

function historyToMessages(history) {
  return history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }))
}

function buildUserContent({ text, photo }) {
  const content = []
  if (photo?.base64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: photo.mediaType || 'image/jpeg',
        data: photo.base64.replace(/\s/g, ''),
      },
    })
  }
  content.push({ type: 'text', text: text || 'Log the meal in this photo.' })
  return content
}

/**
 * Run a turn.
 *
 * @param input.message   the athlete's text
 * @param input.photo     { base64, mediaType }, optional
 * @param input.history   prior messages, oldest first
 * @param deps.anthropic  Anthropic SDK client
 * @param deps.store      uid-bound Firestore accessor
 * @param deps.estimate   shared meal estimation service
 * @param deps.context    live app context for this turn
 * @param deps.dateId     local YYYY-MM-DD
 *
 * @returns {{ reply, cards, toolsUsed, dayTotals, remaining, logMutated, tier }}
 */
export async function runCoachTurn(
  { message, photo, history = [], trigger = null, previousTier = null },
  { anthropic, store, estimate, context, dateId }
) {
  if (!message?.trim() && !photo && !trigger) {
    throw new CoachError('Send a message or a photo.', 'invalid-argument')
  }
  if (!anthropic) throw new CoachError('No model client configured.', 'internal')

  const tooling = createHandlers({ store, estimate, photo, dateId, context })
  const toolsUsed = []

  // Summed across iterations rather than read off the last response, because a
  // turn that called three tools paid for four requests and the last one is the
  // cheapest of them. `cacheRead` is the number worth watching: it is 0 on a
  // cold prefix and should be most of the input on every turn after, so a
  // persistent 0 means something volatile has crept in ahead of the breakpoint.
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

  // A trigger turn is server-authored — nothing James typed. It rides as a
  // user-role message rather than a `role: "system"` one because the model
  // supports mid-conversation system messages only in positions this turn
  // cannot guarantee: they may not be messages[0], which is exactly where this
  // lands on a fresh thread. The content is generated here, never from client
  // input, so there is no injection surface either way.
  const messages = [
    ...historyToMessages(history),
    trigger
      ? { role: 'user', content: [{ type: 'text', text: trigger }] }
      : { role: 'user', content: buildUserContent({ text: message, photo }) },
  ]

  const system = [
    {
      type: 'text',
      text: buildSystemPrompt(context?.mode),
      // The persona is identical on every turn *within a mode* — cache it and
      // pay full price only for the volatile context that follows. Switching
      // modes is a deliberate settings change, so eating one cache miss there
      // is the right trade for not carrying both disciplines on every turn.
      cache_control: { type: 'ephemeral' },
    },
    { type: 'text', text: `Live app data for this turn:\n\n${buildContextBlock(context)}` },
  ]

  let tier = classifyTurn({ message, photo, trigger, previousTier })

  let response
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: TURN_TIERS[tier].maxTokens,
        system,
        thinking: { type: 'adaptive' },
        output_config: { effort: TURN_TIERS[tier].effort },
        tools: TOOL_DEFINITIONS,
        messages,
      })
    } catch (err) {
      throw new CoachError(`Coach request failed: ${err.message}`, 'unavailable')
    }

    usage.input += response.usage?.input_tokens || 0
    usage.output += response.usage?.output_tokens || 0
    usage.cacheRead += response.usage?.cache_read_input_tokens || 0
    usage.cacheWrite += response.usage?.cache_creation_input_tokens || 0

    if (response.stop_reason === 'refusal') {
      throw new CoachError(
        'I can\'t help with that one. Try rephrasing?',
        'failed-precondition'
      )
    }

    if (response.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter((b) => b.type === 'tool_use')

    // Escalate for the rest of the loop, never de-escalate. The iteration that
    // matters is the one after the tool results come back — that is where the
    // answer is actually composed — so catching it here is in time.
    if (toolUses.some((b) => COACHING_TOOLS.has(b.name))) tier = 'coaching'

    const results = await Promise.all(
      toolUses.map(async (block) => {
        toolsUsed.push(block.name)
        const handler = tooling.handlers[block.name]
        if (!handler) {
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          }
        }
        try {
          const result = await handler(block.input || {})
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
        } catch (err) {
          // Tool failures come back to the model as results, not exceptions, so
          // it can recover — ask a clarifying question, retry with a valid id —
          // rather than the turn dying opaquely.
          const readable = err instanceof ToolError ? err.message : 'That step failed.'
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: readable,
            is_error: true,
          }
        }
      })
    )

    // All results go back in a single user message; splitting them trains the
    // model out of parallel tool calls.
    messages.push({ role: 'user', content: results })
  }

  const reply = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  const entries = await tooling.readLog()

  return {
    // On a trigger turn an empty reply is the model choosing silence, which is
    // a valid and often correct answer — substituting a filler line would turn
    // "this session didn't warrant a message" into noise, which is precisely
    // what the restraint rules exist to prevent. Only a real user turn gets a
    // fallback, because there a silent reply would look like a failure.
    reply: reply || (trigger ? '' : 'Logged. Anything else?'),
    cards: tooling.cards,
    toolsUsed,
    logMutated: tooling.logMutated,
    dayTotals: tooling.dayTotals(entries),
    remaining: tooling.remainingFrom(entries),
    hitIterationCap: response?.stop_reason === 'tool_use',
    // Returned so the tier a turn ended up in is observable rather than
    // inferred from latency — the classifier is a heuristic and needs to be
    // checkable against real turns.
    tier,
    usage,
  }
}
