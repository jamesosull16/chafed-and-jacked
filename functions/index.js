/**
 * CLOUD FUNCTIONS — Chafed & Jacked
 *
 * The only place the Anthropic and USDA API keys exist. The React client and
 * the MCP server both call in here; neither ever sees a key.
 *
 * Deploy:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set USDA_API_KEY
 *   firebase functions:secrets:set MCP_SHARED_SECRET
 *   firebase deploy --only functions
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'

import { estimateMeal, EstimationError } from './src/estimator.js'

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

function toHttpsError(err) {
  if (err instanceof EstimationError) return new HttpsError(err.code, err.message)
  console.error('Unexpected estimation failure:', err)
  return new HttpsError('internal', 'Could not estimate this meal.')
}

/**
 * Callable used by the PWA. Firebase Auth verifies the caller; the estimate is
 * returned for confirmation and the client writes it under its own uid, so
 * Firestore rules stay the only authority on what may be written where.
 */
export const estimateMealCallable = onCall(RUNTIME, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to estimate meals.')
  }

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
 * rather than a Firebase Auth user token. Guarded by a shared secret so the
 * endpoint is not an open proxy to a paid API.
 */
export const estimateMealHttp = onRequest(
  { ...RUNTIME, secrets: [...RUNTIME.secrets, MCP_SHARED_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST.' })
      return
    }

    const provided = req.get('x-cj-secret') || ''
    const expected = MCP_SHARED_SECRET.value()
    if (!expected || provided !== expected) {
      res.status(401).json({ error: 'Unauthorized.' })
      return
    }

    const { description, imageBase64, mediaType } = req.body || {}

    try {
      const estimate = await estimateMeal(
        { description, imageBase64, mediaType },
        { anthropic: client(), usdaApiKey: USDA_API_KEY.value() }
      )
      res.json(estimate)
    } catch (err) {
      if (err instanceof EstimationError) {
        const status = err.code === 'invalid-argument' ? 400 : 502
        res.status(status).json({ error: err.message, code: err.code })
        return
      }
      console.error('Unexpected estimation failure:', err)
      res.status(500).json({ error: 'Could not estimate this meal.' })
    }
  }
)
