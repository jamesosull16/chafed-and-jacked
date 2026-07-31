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

export const MODEL = 'claude-opus-4-8'

/** Enough for a log-then-explain turn plus a correction; well short of a loop. */
export const MAX_ITERATIONS = 8

/** How many prior messages of history to replay. */
export const HISTORY_TURNS = 20

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
 * @returns {{ reply, cards, toolsUsed, dayTotals, remaining, logMutated }}
 */
export async function runCoachTurn(
  { message, photo, history = [], trigger = null },
  { anthropic, store, estimate, context, dateId }
) {
  if (!message?.trim() && !photo && !trigger) {
    throw new CoachError('Send a message or a photo.', 'invalid-argument')
  }
  if (!anthropic) throw new CoachError('No model client configured.', 'internal')

  const tooling = createHandlers({ store, estimate, photo, dateId, context })
  const toolsUsed = []

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

  let response
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system,
        thinking: { type: 'adaptive' },
        // Chat latency matters more than depth here; the hard reasoning lives
        // in the guardrails, which are enforced structurally rather than by
        // the model thinking harder about them.
        output_config: { effort: 'low' },
        tools: TOOL_DEFINITIONS,
        messages,
      })
    } catch (err) {
      throw new CoachError(`Coach request failed: ${err.message}`, 'unavailable')
    }

    if (response.stop_reason === 'refusal') {
      throw new CoachError(
        'I can\'t help with that one. Try rephrasing?',
        'failed-precondition'
      )
    }

    if (response.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter((b) => b.type === 'tool_use')
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
  }
}
