/**
 * MCP SERVER — Chafed & Jacked
 *
 * Wires the tool definitions to their handlers over the low-level Server class.
 * Deliberately not the `McpServer` convenience wrapper: that wants zod schemas,
 * and these tools already carry hand-written JSON Schema whose descriptions are
 * the thing doing the work. Converting them would buy nothing and lose the
 * wording.
 *
 * Built fresh per request. The transport runs stateless (see the handler in
 * index.js), because a Cloud Functions instance can vanish between two calls
 * and a server holding session state across them is a bug waiting for traffic.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { TOOL_DEFINITIONS } from './definitions.js'
import { createHandlers } from './tools.js'

export const SERVER_INFO = { name: 'chafed-and-jacked', version: '2.0.0' }

/**
 * @param deps.store           uid-bound Firestore accessor
 * @param deps.estimate        the shared meal estimation service
 * @param deps.timezoneOffset  the athlete's Date#getTimezoneOffset value
 */
export function createMcpServer({ store, estimate, timezoneOffset }) {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } })
  const handlers = createHandlers({ store, estimate, timezoneOffset })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const handler = handlers[name]
    if (!handler) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      }
    }
    try {
      const result = await handler(args || {})
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      // Tool failures come back as results rather than protocol errors, so the
      // model can recover — ask a clarifying question, retry with a valid id —
      // instead of the turn dying opaquely.
      return {
        isError: true,
        content: [{ type: 'text', text: err?.message || 'That step failed.' }],
      }
    }
  })

  return server
}
