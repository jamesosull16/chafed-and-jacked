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
import { defineSecret } from 'firebase-functions/params'
import { initializeApp, getApps } from 'firebase-admin/app'
import Anthropic from '@anthropic-ai/sdk'

import { estimateMeal, EstimationError } from './src/estimator.js'
import { createStore, localDateId } from './src/store.js'
import { runCoachTurn, CoachError } from './src/coach/orchestrator.js'
import { buildTurnContext } from './src/coach/context.js'
import { consumeTurn, RateLimitError } from './src/coach/rateLimit.js'

if (getApps().length === 0) initializeApp()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const USDA_API_KEY = defineSecret('USDA_API_KEY')
const MCP_SHARED_SECRET = defineSecret('MCP_SHARED_SECRET')

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
  const { message, photo, history, context: clientContext, timezoneOffset } = request.data || {}

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
    const context = await buildTurnContext({ store, dateId, clientContext })

    const result = await runCoachTurn(
      {
        message,
        photo: photo?.base64 ? { base64: photo.base64, mediaType: photo.mediaType } : null,
        history: Array.isArray(history) ? history : [],
      },
      { anthropic: client(), store, estimate: estimator(), context, dateId }
    )

    return {
      reply: result.reply,
      cards: result.cards,
      dayTotals: result.dayTotals,
      remaining: result.remaining,
      logMutated: result.logMutated,
    }
  } catch (err) {
    throw toHttpsError(err)
  }
})
