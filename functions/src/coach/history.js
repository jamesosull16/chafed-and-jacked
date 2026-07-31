/**
 * COACH HISTORY — Chafed & Jacked
 *
 * Assembles the conversation the model replays each turn.
 *
 * Read server-side rather than taken from the client, for the same reason
 * `context.js` server-reads training: the thread is the record of what the
 * Coach has already said, and a client that can rewrite it can make the Coach
 * appear to have given advice it never gave. It also puts the whole thread in
 * one place, which is what lets the older half be summarised rather than
 * truncated.
 *
 * Cards are replayed, not dropped. A thread where the model can see it offered
 * three dinners but not what they were cannot resolve "log option 1" or "that
 * dinner you suggested" — it either asks again or invents one, and both read as
 * amnesia to someone who is looking at the card on screen. They are rendered as
 * one short line rather than replayed as JSON: the model needs to know what it
 * showed, not to reconstruct the payload.
 */

/**
 * How many prior messages to replay in full.
 *
 * Raised from 20 because a training week is the unit of conversation here —
 * Monday's session, Wednesday's soreness and Saturday's long run are one
 * thread, and 20 messages does not span them. Anything older is summarised
 * into `coachMemory` rather than replayed.
 */
export const HISTORY_TURNS = 40

const macros = (o) =>
  `${Math.round(o.kcal)} kcal, ${Math.round(o.protein_g)}P/${Math.round(o.carbs_g)}C/${Math.round(o.fat_g)}F`

/** Numbered because "option 1" is the phrase this exists to make resolvable. */
const numbered = (options) =>
  options.map((o, i) => `${i + 1}. ${o.name} (${macros(o)})`).join('; ')

const CARD_SUMMARIES = {
  food_log: (c) =>
    c.entry ? `logged ${c.entry.description} — ${Math.round(c.entry.kcal)} kcal, id ${c.entry.id}` : null,
  meal_options: (c) => (c.options?.length ? `offered meals — ${numbered(c.options)}` : null),
  fuelling: (c) =>
    c.options?.length ? `offered fuelling for ${c.window} — ${numbered(c.options)}` : null,
  session: (c) => (c.session ? `showed the session ${c.session.name}` : null),
  adjustment: (c) => (c.title ? `proposed ${c.title}` : null),
}

function summariseCards(cards) {
  if (!Array.isArray(cards)) return []
  return cards
    .map((c) => CARD_SUMMARIES[c?.type]?.(c))
    .filter(Boolean)
    .map((line) => `[${line}]`)
}

/**
 * One stored chat document to one replayable message, or null if there is
 * nothing in it worth replaying.
 */
function toMessage(doc) {
  const parts = []
  const text = typeof doc.content === 'string' ? doc.content.trim() : ''
  if (text) parts.push(text)

  // A dropped photo reads as a message about nothing — "is this ok?" with no
  // image. The bytes are long gone by now, so replay the fact of it and let
  // the model say it can't re-examine the photo rather than guess.
  if (doc.photoPreview) parts.push('[photo attached]')

  parts.push(...summariseCards(doc.cards))

  if (!parts.length) return null
  return { role: doc.role, content: parts.join('\n') }
}

/**
 * The thread, oldest first, ready to hand to the model.
 *
 * `pendingUserText` is the message the client has already optimistically
 * written to the thread before calling in. Without it the same text would be
 * replayed as history *and* appended as this turn's message, and the model
 * would answer a question it had apparently already been asked.
 */
export async function readHistory(store, { pendingUserText } = {}) {
  const docs = await store.query('coachChat', {
    orderField: 'createdAt',
    direction: 'desc',
    // One extra so dropping the optimistic message still leaves a full window.
    limit: HISTORY_TURNS + 1,
  })

  const thread = [...docs].reverse().filter((d) => d.role === 'user' || d.role === 'assistant')

  const pending = pendingUserText?.trim()
  const last = thread[thread.length - 1]
  if (pending && last?.role === 'user' && last.content?.trim() === pending) thread.pop()

  return thread.map(toMessage).filter(Boolean).slice(-HISTORY_TURNS)
}
