#!/usr/bin/env node
/**
 * CHAFED & JACKED — MCP SERVER
 *
 * Exposes meal logging and training analysis over MCP so the athlete can log
 * food and ask coaching questions from a Claude conversation, with the app's
 * live data behind it.
 *
 * Estimation is delegated to the deployed Cloud Function, so the Anthropic and
 * USDA keys live in exactly one place and never reach this process.
 *
 * Configuration (environment):
 *   CJ_USER_ID                 Firebase uid whose data to read/write   (required)
 *   GOOGLE_APPLICATION_CREDENTIALS | CJ_SERVICE_ACCOUNT  service account JSON path
 *   CJ_PROJECT_ID              Firebase project id
 *   CJ_ESTIMATOR_URL           deployed estimateMealHttp URL
 *   CJ_SHARED_SECRET           matches the MCP_SHARED_SECRET function secret
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { initFirestore } from './src/firestore.js'
import * as tools from './src/tools.js'

const config = {
  userId: process.env.CJ_USER_ID,
  serviceAccountPath: process.env.CJ_SERVICE_ACCOUNT || null,
  projectId: process.env.CJ_PROJECT_ID || null,
  estimatorUrl: process.env.CJ_ESTIMATOR_URL || null,
  sharedSecret: process.env.CJ_SHARED_SECRET || null,
}

const DATE_ARG = {
  type: 'string',
  description: 'Local date as YYYY-MM-DD. Defaults to today.',
}

const TOOL_DEFINITIONS = [
  {
    name: 'log_meal',
    description:
      'Estimate the macros of a meal from a text description and/or a photo, and write it to ' +
      "today's nutrition log. Call this whenever the athlete says what they ate. Returns the " +
      'logged entry plus the remaining macros for the day.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'What was eaten, in the athlete\'s words. More detail on portions means a better ' +
            'estimate — "two eggs and 100g oats" beats "breakfast".',
        },
        image: {
          type: 'string',
          description: 'Base64-encoded photo of the meal, with no data: URI prefix.',
        },
        mediaType: {
          type: 'string',
          enum: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
          description: 'Required when image is supplied.',
        },
        mealType: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack', 'preWorkout', 'postWorkout'],
        },
        when: { type: 'string', description: 'ISO timestamp. Defaults to now.' },
      },
    },
  },
  {
    name: 'get_today_macros',
    description:
      "Read today's macro targets, what has been consumed so far, what remains, and every " +
      'logged entry. Call this before advising on what to eat next.',
    inputSchema: { type: 'object', properties: { date: DATE_ARG } },
  },
  {
    name: 'get_targets',
    description:
      "Read the day's macro targets and how they were derived (BMR, TDEE, surplus or deficit, " +
      'protein and carb rationale). Use this to explain why a target is what it is.',
    inputSchema: { type: 'object', properties: { date: DATE_ARG } },
  },
  {
    name: 'list_recent_meals',
    description: 'List logged meals and daily totals over a recent window.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Lookback in days. Default 7.' } },
    },
  },
  {
    name: 'update_meal',
    description:
      'Correct a previously logged meal. Only label, kcal, protein, carbs, fat, mealType and ' +
      'description can be changed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry id from get_today_macros.' },
        date: DATE_ARG,
        label: { type: 'string' },
        kcal: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
        mealType: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_meal',
    description: 'Remove a logged meal.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, date: DATE_ARG },
      required: ['id'],
    },
  },
  {
    name: 'get_block_status',
    description:
      'Where the athlete is in the strength block: block week, mesocycle, accumulation or ' +
      'deload, the RIR target for the week, and any active injury guardrails including the ' +
      'current proximal-hamstring rehab stage. Call this before programming a session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_training_summary',
    description:
      'Recent logged sessions with per-exercise sets (weight, reps, RIR, side) and mobility ' +
      'adherence. Use this to judge progression and decide what to add next.',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'number', description: 'Lookback in weeks. Default 2.' } },
    },
  },
  {
    name: 'get_chain_balance',
    description:
      'Posterior:anterior working-set ratio, weekly sets per muscle against volume landmarks, ' +
      'left/right symmetry on unilateral work, and push:pull balance. This is the primary ' +
      'signal for whether the chain imbalance is actually closing.',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'number', description: 'Lookback in weeks. Default 1.' } },
    },
  },
  {
    name: 'get_body_metrics',
    description:
      'Bodyweight, body fat and lean mass trend, plus a rate-of-gain assessment against the ' +
      'lean-bulk target band with a suggested surplus adjustment. The assessment refuses to ' +
      'act on fewer than three weeks of weigh-ins.',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'number', description: 'Lookback in weeks. Default 8.' } },
    },
  },
]

const HANDLERS = {
  log_meal: (args) => tools.log_meal(args, config),
  get_today_macros: tools.get_today_macros,
  get_targets: tools.get_targets,
  list_recent_meals: tools.list_recent_meals,
  update_meal: tools.update_meal,
  delete_meal: tools.delete_meal,
  get_block_status: tools.get_block_status,
  get_training_summary: tools.get_training_summary,
  get_chain_balance: tools.get_chain_balance,
  get_body_metrics: tools.get_body_metrics,
}

const server = new Server(
  { name: 'chafed-and-jacked', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = HANDLERS[request.params.name]
  if (!handler) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
    }
  }

  try {
    const result = await handler(request.params.arguments || {})
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    // Returned as a tool error rather than thrown, so the model can read the
    // reason and recover (e.g. re-describe the meal) instead of the call
    // failing opaquely.
    return { isError: true, content: [{ type: 'text', text: err.message }] }
  }
})

async function main() {
  if (!config.userId) {
    console.error('CJ_USER_ID is not set. The server does not know whose data to read.')
    process.exit(1)
  }

  initFirestore(config)

  if (!config.estimatorUrl || !config.sharedSecret) {
    console.error(
      'Warning: CJ_ESTIMATOR_URL / CJ_SHARED_SECRET are not set — log_meal will fail, ' +
        'but read-only tools will work.'
    )
  }

  await server.connect(new StdioServerTransport())
  console.error('chafed-and-jacked MCP server ready on stdio.')
}

main().catch((err) => {
  console.error('Failed to start:', err)
  process.exit(1)
})
