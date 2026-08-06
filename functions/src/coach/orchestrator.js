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

// ── Unbacked write claims ─────────────────────────────────────
//
// The failure this exists to stop: on 2026-08-05 three consecutive turns
// replied "Logged one serving… id 3e8a1c9f-…", "Re-fired once…", and invented
// a sync fault to explain why the Fuel page disagreed. None of them called a
// tool. Nothing was ever written, and the reply was the only thing that said
// otherwise — so the reply is where it has to be caught.
//
// Detection is deliberately shallow. It does not decide whether a claim is
// true; it decides whether the turn is allowed to make one, which is a fact
// the orchestrator already holds in `logMutated`.

/**
 * No legitimate reply contains one of these any more — handles replaced ids in
 * the context block, and no tool result carries a stored id back to the model.
 * A uuid in a reply is fabricated, every time.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Past-tense assertions that the log changed, in the three shapes they take. */
const WRITE_VERB = 'logged|added|saved|written|updated|deleted|removed|fired|sent'

/** "I've logged it", "I just re-fired that" — unambiguous, whatever follows. */
const FIRST_PERSON = new RegExp(
  String.raw`\bi(?:'ve|’ve| have)?\s+(?:just\s+)?(?:re-?)?(?:${WRITE_VERB})\b`,
  'i'
)
/** "Logged one serving…", "Re-fired once —" — the sentence opens on the claim. */
const OPENS_ON_CLAIM = new RegExp(String.raw`^(?:re-?)?(?:${WRITE_VERB})\b`, 'i')
/** "…and saved it", "updated that" — subjectless, so context decides. */
const BARE_OBJECT = new RegExp(
  String.raw`\b(?:${WRITE_VERB})\s+(?:it|that|this|one|both)\b`,
  'i'
)

/**
 * Statements *about* the log that are not claims to have changed it. "Nothing
 * logged yet today" and "I haven't added it" are both honest sentences a turn
 * with no write is entitled to, and challenging them would be a way of nagging
 * the coach into logging what it rightly declined to log.
 */
const NEGATED = /\b(?:not|never|nothing|no|none|cannot|without)\b|n['’]t\b/i

/** "You logged that this morning" — his action, not one the coach is claiming. */
const HIS_ACTION = new RegExp(
  String.raw`\byou(?:'ve|’ve| have)?\s+(?:\w+\s+){0,2}(?:${WRITE_VERB})\b`,
  'i'
)

/**
 * Does this reply assert that the food log changed?
 *
 * Sentence by sentence, so a negation elsewhere in the message can't excuse a
 * claim and a claim elsewhere can't condemn a negation. A first-person claim
 * survives the attribution exemption — "you logged that, and I've added the
 * shake" is still a claim about a write.
 */
export function claimsLogWrite(reply) {
  if (!reply?.trim()) return false
  if (UUID.test(reply)) return true
  return reply
    .split(/(?<=[.!?\n])/)
    .map((sentence) => sentence.replace(/^[\s*_>[\]-]+/, '').trim())
    .some((sentence) => {
      if (NEGATED.test(sentence)) return false
      if (FIRST_PERSON.test(sentence)) return true
      if (HIS_ACTION.test(sentence)) return false
      return OPENS_ON_CLAIM.test(sentence) || BARE_OBJECT.test(sentence)
    })
}

/**
 * Handed back as a tool-result-shaped user turn when a reply claims a write
 * that never happened. Phrased to leave both honest exits open: log it for
 * real, or say plainly that it isn't logged. It must not read as "log
 * something" — pre-logging a meal he hasn't eaten is its own failure, and the
 * coach currently declines that correctly.
 */
const UNBACKED_CLAIM_CHALLENGE = `SYSTEM CHECK — not from James.

Your draft reply reports a change to the food log, but no logging tool ran this turn, so nothing was written and the Fuel page will not show it.

Pick one and redo the reply:
  - He stated a meal he has actually eaten: call estimate_meal / log_meal now, then confirm from the tool result.
  - He did not, or you were only discussing it: rewrite the reply so it claims no write.

Do not log a meal he has not said he ate, and do not describe a sync problem, a lag, or a retry — there is none.`

/** What he sees if the model will not correct itself. Better a visible failure. */
const UNBACKED_CLAIM_FALLBACK =
  "I haven't actually logged that — nothing was written to today's log, and I'd rather say so than let you find out from the Fuel page. Tell me again and I'll retry, or add it there directly."

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

  /**
   * Drive the model until it stops asking for tools.
   *
   * Extracted so the verification pass below can re-enter it with the same
   * message list and the same handlers — a corrective round has to be able to
   * actually call `log_meal`, not just rewrite prose.
   */
  async function runToolLoop({ forceTool = false } = {}) {
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
          // A photo on a logging turn is a meal being logged — `classifyTurn`
          // says exactly that, and the low-effort tier it implies is where
          // replying instead of acting is cheapest. Making the first step a
          // tool call rather than a suggestion removes the shortcut outright.
          // Only the first iteration: once results are back the model must be
          // free to stop and answer.
          ...(forceTool && i === 0 && { tool_choice: { type: 'any' } }),
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
    return response
  }

  const textOf = (response) =>
    (response?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

  let response = await runToolLoop({ forceTool: !trigger && !!photo && tier === 'logging' })
  let reply = textOf(response)

  // ── The write claim has to match the writes ──
  //
  // `logMutated` is the ledger: it is true only if an effectful food tool
  // actually ran. A reply that claims a write while it is false is a
  // fabrication, and the one thing that must never reach the thread — it is
  // read as truth by James, and replayed as a worked example to the next turn.
  let unbackedLogClaim = false
  if (!tooling.logMutated && claimsLogWrite(reply)) {
    unbackedLogClaim = true
    messages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: [{ type: 'text', text: UNBACKED_CLAIM_CHALLENGE }] }
    )
    response = await runToolLoop()
    reply = textOf(response)
  }

  // Still claiming, still nothing written. Say so plainly rather than shipping
  // the lie — a coach that reports a failure is recoverable, one that reports
  // a success it didn't have is not.
  const unresolvedLogClaim = !tooling.logMutated && claimsLogWrite(reply)
  if (unresolvedLogClaim) reply = UNBACKED_CLAIM_FALLBACK

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
    // Both returned so the failure is countable rather than anecdotal. The
    // first says the model tried to claim a write it hadn't made; the second
    // says it wouldn't take the correction and James saw the honest fallback
    // instead. A rising first number is a prompt problem; any of the second is
    // a live one.
    unbackedLogClaim,
    unresolvedLogClaim,
    // Returned so the tier a turn ended up in is observable rather than
    // inferred from latency — the classifier is a heuristic and needs to be
    // checkable against real turns.
    tier,
    usage,
  }
}
