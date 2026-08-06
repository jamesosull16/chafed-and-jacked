#!/usr/bin/env node
/**
 * CHAFED & JACKED — MCP SERVER (stdio)
 *
 * A transport, not an implementation.
 *
 * Every CRUD tool comes from `functions/src/mcp/`, the same module the hosted
 * Cloud Function serves. That is the whole design: this repo has already paid
 * three times for the same fix landing in one of two parallel implementations
 * and not the other, and thirty-odd tools duplicated across two servers would
 * be that mistake at scale. One implementation, two transports.
 *
 * Two things this process supplies that the hosted one cannot:
 *
 *   Live analysis. A local process can import `src/lib`, so it computes the
 *   app's macro targets, chain balance and volume landmarks against current
 *   data. The Functions bundle cannot — only `functions/` is uploaded on
 *   deploy — so it reads the stored figures instead. See `src/analysis.js`.
 *
 *   Nothing exposed. There is no endpoint, no bearer token, and no public
 *   surface. The process is trusted because only someone with the machine can
 *   start it, which is the security model stdio was designed around.
 *
 * Configuration (environment):
 *   CJ_USER_ID                 Firebase uid whose data to read/write   (required)
 *   GOOGLE_APPLICATION_CREDENTIALS | CJ_SERVICE_ACCOUNT  service account JSON path
 *   CJ_PROJECT_ID              Firebase project id
 *   CJ_ESTIMATOR_URL           deployed estimateMealHttp URL   (for log_meal)
 *   CJ_SHARED_SECRET           matches the MCP_SHARED_SECRET function secret
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createStore, ensureApp } from '../functions/src/store.js'
import { createMcpServer } from '../functions/src/mcp/server.js'
import { ANALYSIS_DEFINITIONS, createAnalysisHandlers } from './src/analysis.js'

const config = {
  userId: process.env.CJ_USER_ID,
  serviceAccountPath: process.env.CJ_SERVICE_ACCOUNT || null,
  projectId: process.env.CJ_PROJECT_ID || null,
  estimatorUrl: process.env.CJ_ESTIMATOR_URL || null,
  sharedSecret: process.env.CJ_SHARED_SECRET || null,
}

/**
 * Estimation, delegated to the deployed Cloud Function.
 *
 * The hosted server calls `estimateMeal` in-process because it holds the
 * Anthropic and USDA keys. This one deliberately does not: no API key ever
 * reaches a process running on a laptop. Same signature either way, so the
 * shared tools cannot tell the difference.
 */
function httpEstimator({ estimatorUrl, sharedSecret }) {
  return async ({ description, imageBase64, mediaType }) => {
    if (!estimatorUrl || !sharedSecret) {
      throw new Error(
        'Meal estimation is not configured. Set CJ_ESTIMATOR_URL and CJ_SHARED_SECRET, or use ' +
          'add_meal_manually if you already know the macros.'
      )
    }
    const res = await fetch(estimatorUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cj-secret': sharedSecret },
      body: JSON.stringify({ description, imageBase64, mediaType }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error || `Estimator returned ${res.status}`)
    return payload
  }
}

async function main() {
  if (!config.userId) {
    console.error('CJ_USER_ID is not set. The server does not know whose data to read.')
    process.exit(1)
  }

  // Initialised through the functions copy of firebase-admin, which is the one
  // createStore reads from. Doing it here with mcp/'s own copy would register
  // an app the store cannot see.
  ensureApp({ serviceAccountPath: config.serviceAccountPath, projectId: config.projectId })

  if (!config.estimatorUrl || !config.sharedSecret) {
    console.error(
      'Warning: CJ_ESTIMATOR_URL / CJ_SHARED_SECRET are not set — log_meal will fail. ' +
        'Everything else, including add_meal_manually, works.'
    )
  }

  // The store is bound to one uid here, before any tool exists. No tool takes a
  // uid, so nothing derived from conversation text can reach another user.
  const store = createStore(config.userId)

  const server = createMcpServer({
    store,
    estimate: httpEstimator(config),
    // A local process knows the athlete's timezone; the hosted one has to be
    // told, because its container runs in UTC.
    timezoneOffset: new Date().getTimezoneOffset(),
    extraTools: {
      definitions: ANALYSIS_DEFINITIONS,
      handlers: createAnalysisHandlers({ store }),
    },
  })

  await server.connect(new StdioServerTransport())
  console.error('chafed-and-jacked MCP server ready on stdio.')
}

main().catch((err) => {
  console.error('Failed to start:', err)
  process.exit(1)
})
