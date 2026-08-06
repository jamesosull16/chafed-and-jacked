/**
 * CLOUD FUNCTIONS — Chafed & Jacked
 *
 * The only place the Anthropic and USDA API keys exist. The React client, the
 * MCP server, and the in-app Coach all call in here; none of them ever sees a
 * key.
 *
 * Deploy:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set USDA_API_KEY
 *   firebase functions:secrets:set MCP_SHARED_SECRET
 *   firebase deploy --only functions
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'
import { createHash, timingSafeEqual } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { initializeApp, getApps } from 'firebase-admin/app'
import Anthropic from '@anthropic-ai/sdk'

import { estimateMeal, EstimationError } from './src/estimator.js'
import { createStore, localDateId } from './src/store.js'
import { createMcpServer } from './src/mcp/server.js'
import { runCoachTurn, CoachError, MODEL } from './src/coach/orchestrator.js'
import { buildTurnContext } from './src/coach/context.js'
import { readHistory, readConversationTier, HISTORY_TURNS } from './src/coach/history.js'
import { ensureMemory, readMemory } from './src/coach/memory.js'
import { consumeTurn, consumeProactive, claimWorkout, RateLimitError } from './src/coach/rateLimit.js'
import { buildWorkoutTrigger } from './src/coach/trigger.js'

if (getApps().length === 0) initializeApp()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const USDA_API_KEY = defineSecret('USDA_API_KEY')
const MCP_SHARED_SECRET = defineSecret('MCP_SHARED_SECRET')

/**
 * Whose data the MCP server reads and writes.
 *
 * A uid is not a secret, but it *is* the entire authorization model here: the
 * bearer token proves the caller may act, and this says who they act as. It is
 * configuration rather than input for exactly that reason — nothing a tool call
 * can say may change it. Set in `functions/.env`.
 */
const CJ_USER_ID = defineString('CJ_USER_ID')

const RUNTIME = {
  secrets: [ANTHROPIC_API_KEY, USDA_API_KEY],
  region: 'us-central1',
  // Vision plus a USDA round-trip per item; the default 60s is too tight.
  timeoutSeconds: 120,
  memory: '512MiB',
}

function client() {
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
}

function estimator() {
  return (input) =>
    estimateMeal(input, { anthropic: client(), usdaApiKey: USDA_API_KEY.value() })
}

function toHttpsError(err) {
  if (err instanceof EstimationError || err instanceof CoachError) {
    return new HttpsError(err.code, err.message)
  }
  if (err instanceof RateLimitError) {
    return new HttpsError('resource-exhausted', err.message)
  }
  console.error('Unexpected failure:', err)
  return new HttpsError('internal', 'Something went wrong.')
}

// ── Meal estimation ──────────────────────────────────────────────────

/**
 * Used by the Nutrition screen's camera control. Returns the estimate for
 * confirmation; the client writes it under its own uid, so Firestore rules
 * remain the only authority on what may be written where.
 */
export const estimateMealCallable = onCall(RUNTIME, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to estimate meals.')

  const { description, imageBase64, mediaType } = request.data || {}
  try {
    return await estimateMeal(
      { description, imageBase64, mediaType },
      { anthropic: client(), usdaApiKey: USDA_API_KEY.value() }
    )
  } catch (err) {
    throw toHttpsError(err)
  }
})

/**
 * HTTP endpoint for the MCP server, which authenticates with a service account
 * rather than a Firebase Auth user token. Guarded by a shared secret so it is
 * not an open proxy to a paid API.
 */
export const estimateMealHttp = onRequest(
  { ...RUNTIME, secrets: [...RUNTIME.secrets, MCP_SHARED_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST.' })
      return
    }

    const expected = MCP_SHARED_SECRET.value()
    if (!expected || (req.get('x-cj-secret') || '') !== expected) {
      res.status(401).json({ error: 'Unauthorized.' })
      return
    }

    const { description, imageBase64, mediaType } = req.body || {}
    try {
      res.json(
        await estimateMeal(
          { description, imageBase64, mediaType },
          { anthropic: client(), usdaApiKey: USDA_API_KEY.value() }
        )
      )
    } catch (err) {
      if (err instanceof EstimationError) {
        res.status(err.code === 'invalid-argument' ? 400 : 502).json({ error: err.message })
        return
      }
      console.error('Unexpected estimation failure:', err)
      res.status(500).json({ error: 'Could not estimate this meal.' })
    }
  }
)

// ── MCP server ───────────────────────────────────────────────────────

/**
 * Compare two secrets without leaking their length or contents through timing.
 *
 * `timingSafeEqual` throws on a length mismatch, which is itself a signal, so
 * both sides are hashed to a fixed width first. Cheap, and it means a wrong
 * token tells an attacker nothing but "wrong".
 */
function secretMatches(presented, expected) {
  if (!presented || !expected) return false
  const hash = (s) => createHash('sha256').update(String(s)).digest()
  return timingSafeEqual(hash(presented), hash(expected))
}

/**
 * `Authorization: Bearer <token>`, per the MCP spec's token placement rules.
 *
 * Split rather than matched: `^Bearer\s+(.+)$` backtracks super-linearly on a
 * long header, which is an attacker-controlled string.
 */
function bearerFrom(req) {
  const [scheme, ...rest] = (req.get('authorization') || '').trim().split(/\s+/)
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null
  return rest.join(' ').trim() || null
}

/**
 * The MCP endpoint — Streamable HTTP, stateless.
 *
 * Stateless because a Cloud Functions instance can be recycled between two
 * calls: a transport holding session state across requests works perfectly in
 * testing and fails the first time the platform scales. Every request builds
 * its own server and transport, answers, and disposes of both.
 *
 * Auth is a bearer token, not OAuth. The MCP spec's OAuth flow is what Claude
 * Desktop's connector UI requires, and building an authorization server to
 * guard one person's training log is the wrong trade — this is reachable from
 * Claude Code (`claude mcp add --transport http --header ...`) and the Messages
 * API MCP connector, both of which take a static bearer.
 *
 * The token is the ONLY thing between the public internet and every row of
 * this athlete's health data, with full write access. It is checked before any
 * body is parsed, and rotating it is `firebase functions:secrets:set`.
 */
export const mcp = onRequest(
  { ...RUNTIME, secrets: [...RUNTIME.secrets, MCP_SHARED_SECRET], timeoutSeconds: 300 },
  async (req, res) => {
    if (!secretMatches(bearerFrom(req), MCP_SHARED_SECRET.value())) {
      // The spec requires WWW-Authenticate on a 401 so a client can discover how
      // to authenticate. There is no OAuth metadata to point at, so this states
      // the scheme and stops — a client that needs the flow will fail loudly
      // rather than retry blind.
      res.set('WWW-Authenticate', 'Bearer realm="chafed-and-jacked"')
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized.' },
        id: null,
      })
      return
    }

    const uid = CJ_USER_ID.value()
    if (!uid) {
      logger.error('mcp: CJ_USER_ID is unset — refusing to guess whose data to serve')
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Server is misconfigured.' },
        id: null,
      })
      return
    }

    // Sent by clients that know the athlete's timezone; the container runs in
    // UTC, which would otherwise roll "today" over mid-evening for him.
    const timezoneOffset = Number(req.get('x-cj-timezone-offset')) || 0

    const server = createMcpServer({
      store: createStore(uid),
      estimate: estimator(),
      timezoneOffset,
    })
    const transport = new StreamableHTTPServerTransport({
      // Stateless: no session ids to hand out and none to look up.
      sessionIdGenerator: undefined,
      // Plain JSON responses rather than SSE. Nothing here streams, and an
      // event stream held open across a serverless boundary is a liability.
      enableJsonResponse: true,
    })

    res.on('close', () => {
      transport.close().catch(() => {})
      server.close().catch(() => {})
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      logger.error('mcp request failed', { message: err?.message })
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error.' },
          id: null,
        })
      }
    }
  }
)

// ── Coach chat ───────────────────────────────────────────────────────

const MAX_MESSAGE_CHARS = 2000
const MAX_IMAGE_B64_CHARS = 7_000_000 // ~5MB decoded

/**
 * One conversational turn with the Coach.
 *
 * The uid always comes from the verified auth token — never from the payload —
 * so every read, write and rate-limit bucket is pinned to the caller.
 */
export const coachTurn = onCall({ ...RUNTIME, timeoutSeconds: 180 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to talk to your coach.')

  const uid = request.auth.uid
  // `history` is deliberately not read from the payload. The thread is the
  // record of what the Coach has already said, and it is re-read server-side
  // so a client cannot make it appear to have given advice it never gave.
  const { message, photo, context: clientContext, timezoneOffset } = request.data || {}

  if (typeof message === 'string' && message.length > MAX_MESSAGE_CHARS) {
    throw new HttpsError('invalid-argument', 'That message is too long.')
  }
  if (photo?.base64 && photo.base64.length > MAX_IMAGE_B64_CHARS) {
    throw new HttpsError('invalid-argument', 'That image is too large.')
  }
  if (!message?.trim() && !photo?.base64) {
    throw new HttpsError('invalid-argument', 'Send a message or a photo.')
  }

  const store = createStore(uid)

  try {
    await consumeTurn(store)
  } catch (err) {
    throw toHttpsError(err)
  }

  const dateId = localDateId(new Date(), Number(timezoneOffset) || 0)

  try {
    // The client writes James's message into the thread before calling in, so
    // it is already in what we read back — `pendingUserText` keeps it from
    // being replayed as history and appended as this turn at the same time.
    const [context, history, memory, previousTier] = await Promise.all([
      buildTurnContext({ store, dateId, clientContext }),
      readHistory(store, { pendingUserText: message }),
      ensureMemory(store, { anthropic: client(), model: MODEL, windowSize: HISTORY_TURNS }),
      readConversationTier(store),
    ])
    context.memory = memory

    const result = await runCoachTurn(
      {
        message,
        photo: photo?.base64 ? { base64: photo.base64, mediaType: photo.mediaType } : null,
        history,
        previousTier,
      },
      { anthropic: client(), store, estimate: estimator(), context, dateId }
    )

    // One line per turn, because everything worth checking after a live turn is
    // otherwise invisible: which effort tier the classifier picked, whether the
    // cached prefix is actually being read, and how much history got replayed.
    // No message text — this is a training-and-food diary, and the logs are not
    // the place for it.
    logger.info('coach turn', {
      tier: result.tier,
      tools: result.toolsUsed,
      historyMessages: history.length,
      rememberedFacts: memory.facts.length,
      // Only when they fire, so they stay greppable. `unbacked` means the turn
      // drafted a logging confirmation with no write behind it and was made to
      // redo it; `unresolved` means it wouldn't, and James got the failure.
      ...(result.unbackedLogClaim && { unbackedLogClaim: true }),
      ...(result.unresolvedLogClaim && { unresolvedLogClaim: true }),
      ...result.usage,
    })

    return {
      reply: result.reply,
      cards: result.cards,
      dayTotals: result.dayTotals,
      remaining: result.remaining,
      logMutated: result.logMutated,
      // Written onto the assistant message by the client so the next turn can
      // tell a follow-up from a fresh meal entry.
      tier: result.tier,
    }
  } catch (err) {
    throw toHttpsError(err)
  }
})

/**
 * Proactive post-workout message.
 *
 * Called fire-and-forget by the client after a session or run is saved. Every
 * failure path here is deliberately silent to the caller: a coach message that
 * doesn't arrive is a missing nicety, and it must never surface as an error on
 * the screen where James just finished training.
 *
 * The workout id is claimed before the model runs, so a retry, a double-tap or
 * a remount cannot produce two unprompted messages about the same session. The
 * reply is written straight into the thread by this function rather than
 * returned for the client to write — the client has already navigated away.
 */
export const coachWorkoutLogged = onCall({ ...RUNTIME, timeoutSeconds: 180 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const uid = request.auth.uid
  const { workoutId, kind, timezoneOffset } = request.data || {}
  if (!workoutId || typeof workoutId !== 'string') {
    throw new HttpsError('invalid-argument', 'workoutId is required.')
  }

  const store = createStore(uid)

  // Claim first. Everything after this is best-effort.
  if (!(await claimWorkout(store, workoutId))) return { posted: false, reason: 'already-posted' }

  try {
    await consumeProactive(store)
  } catch {
    return { posted: false, reason: 'rate-limited' }
  }

  const dateId = localDateId(new Date(), Number(timezoneOffset) || 0)

  try {
    // History matters more here than on a typed turn, not less: this message
    // is unprompted, and "never send the same message twice about the same
    // session" is only enforceable if the model can see what it already sent.
    // Reads memory but never refreshes it. This path is unprompted and
    // fire-and-forget; making James's workout save wait on a summarisation he
    // didn't ask for would be paying latency at the worst possible moment.
    const [context, history, memory] = await Promise.all([
      buildTurnContext({ store, dateId }),
      readHistory(store),
      readMemory(store),
    ])
    context.memory = memory

    // The summary is built from server-read context, never from the payload —
    // the client says only *that* something was logged, not what.
    const summary =
      kind === 'run'
        ? summariseRunsForTrigger(context.todayRuns)
        : summariseSessionForTrigger(context.lastSession)

    const result = await runCoachTurn(
      { trigger: buildWorkoutTrigger({ kind, summary }), history },
      { anthropic: client(), store, estimate: estimator(), context, dateId }
    )

    // An empty reply is the model exercising restraint. Respect it — writing a
    // filler message here is exactly the noise the rules exist to prevent.
    if (!result.reply?.trim() && !result.cards?.length) {
      return { posted: false, reason: 'nothing-worth-saying' }
    }

    await store.addDoc('coachChat', {
      role: 'assistant',
      content: result.reply,
      tier: result.tier,
      ...(result.cards?.length && { cards: result.cards }),
      proactive: true,
      workoutId,
      createdAt: new Date(),
    })

    return { posted: true }
  } catch (err) {
    // Logged for us, invisible to him.
    console.error('Proactive coach message failed:', err)
    return { posted: false, reason: 'failed' }
  }
})

function summariseSessionForTrigger(session) {
  if (!session) return null
  const bits = [session.dayType || 'a session']
  if (session.duration) bits.push(`${session.duration} min`)
  if (session.totalVolume) bits.push(`${session.totalVolume} volume`)
  return bits.join(', ')
}

function summariseRunsForTrigger(runs) {
  if (!runs?.length) return null
  const miles = runs.reduce((s, r) => s + (Number(r.miles) || 0), 0)
  const minutes = runs.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0)
  const duration = minutes ? `, ${minutes} min` : ''
  return `${Math.round(miles * 10) / 10} mi${duration}`
}
