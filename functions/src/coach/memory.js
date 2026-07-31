/**
 * COACH MEMORY — Chafed & Jacked
 *
 * What the Coach still knows about James once a conversation has scrolled out
 * of the replay window.
 *
 * `history.js` replays the last 40 messages verbatim. Everything older is
 * truncated, and truncation is what makes the Coach feel like it meets him for
 * the first time every fortnight — the gut that can't take gels, the Tuesday
 * evening he can never train, the substitution that finally settled his knee.
 * Those are worth carrying at week 12; the transcript they arrived in is not.
 *
 * So this stores **facts, not a précis**. "Doesn't tolerate whey" is worth a
 * line forever. "Asked about whey on the 14th" is worth nothing.
 *
 * Stored in a top-level document keyed by uid, like `coachUsage`, and for the
 * same reason `firestore.rules` already spells out: rules are a permissive
 * union, so a deny nested under the user's own recursive wildcard would be
 * overridden by it. That matters more here than for a counter — this text is
 * injected into the system context every turn, so a client that can write it
 * can put words in the Coach's mouth. James can read it; only the function
 * writes it.
 */

/** How many aged-out messages accumulate before a summarisation run. */
export const SUMMARISE_BATCH = 20

/**
 * Cap on remembered facts. A memory that only grows stops being a summary and
 * starts being the transcript again, and it is rendered on every turn.
 */
export const MAX_FACTS = 40

const MEMORY_COLLECTION = 'coachMemory'

const SUMMARY_PROMPT = `You maintain the long-term memory of an athlete's coach.

You will be given the facts already remembered and a stretch of conversation about to be forgotten. Return the merged set of facts worth carrying forward.

Keep only things that stay true after this conversation ends:

- Food preferences, dislikes, allergies, and what his gut tolerates — especially during training.
- Schedule constraints: days he can't train, work patterns, travel.
- Injury history and what actually helped or aggravated it.
- Goals, races, and what he has said he's aiming at.
- Approaches that worked and approaches that didn't, and why.
- Equipment, gym access, and anything that limits what he can be prescribed.

Discard anything that was only true that day: what he ate, what he lifted, how a single session felt, questions asked and answered. Those live in the training log, not here — and repeating them here would put a stale copy beside the real one.

Rules:

- One fact per line, no bullets, no numbering, no headers.
- Short and plain: "Doesn't tolerate whey — cramps on it" beats a sentence explaining when he mentioned it.
- Merge duplicates. If a new fact contradicts an old one, keep the new one and drop the old — people change.
- Never invent. Only what the conversation actually establishes.
- If nothing durable came up, return nothing at all. An empty memory is correct far more often than a padded one.`

function parseFacts(text) {
  return (text || '')
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_FACTS)
}

/** What is remembered right now, without touching the model. */
export async function readMemory(store) {
  const doc = await store.getSystemDoc(MEMORY_COLLECTION)
  return { facts: doc?.facts || [], summarisedThrough: doc?.summarisedThrough || null }
}

/**
 * Messages that have scrolled past the replay window and have not been folded
 * into memory yet.
 *
 * Looks one batch past the window and no further. A thread that outruns that —
 * because summarisation kept failing — loses the overflow rather than growing
 * an unbounded backlog to chew through. Memory is an improvement on
 * forgetting, not a guarantee against it.
 */
async function agedOut(store, { windowSize, summarisedThrough }) {
  const docs = await store.query('coachChat', {
    orderField: 'createdAt',
    direction: 'desc',
    limit: windowSize + SUMMARISE_BATCH,
  })

  return [...docs]
    .reverse()
    .slice(0, Math.max(0, docs.length - windowSize))
    .filter((d) => d.role === 'user' || d.role === 'assistant')
    .filter((d) => typeof d.content === 'string' && d.content.trim())
    .filter((d) => !summarisedThrough || String(d.createdAt) > summarisedThrough)
}

/**
 * Return current memory, refreshing it first if enough conversation has aged
 * out to be worth a model call.
 *
 * Runs at most once per `SUMMARISE_BATCH` messages rather than every turn: it
 * is a second model call, and paying for one on every message to re-derive
 * facts that have not changed is exactly the cost the design was warned about.
 *
 * Failures are swallowed and the existing memory returned. A summarisation
 * that didn't happen costs some continuity next fortnight; one that throws
 * would cost James the answer he actually asked for.
 */
export async function ensureMemory(store, { anthropic, model, windowSize } = {}) {
  const current = await readMemory(store)
  if (!anthropic) return current

  let pending
  try {
    pending = await agedOut(store, { windowSize, summarisedThrough: current.summarisedThrough })
  } catch {
    return current
  }
  if (pending.length < SUMMARISE_BATCH) return current

  const transcript = pending.map((d) => `${d.role}: ${d.content.trim()}`).join('\n')
  const known = current.facts.length ? current.facts.join('\n') : '(nothing remembered yet)'

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: SUMMARY_PROMPT,
      // No tools and low effort on purpose. This is an extraction, not a
      // judgement, and it must never be able to write to the food log.
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: `Already remembered:\n${known}\n\nConversation being forgotten:\n${transcript}`,
        },
      ],
    })

    const facts = parseFacts(
      (response.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
    )

    const next = {
      facts,
      // Advanced even when nothing durable came out, so a stretch of small talk
      // isn't re-summarised every turn forever.
      summarisedThrough: String(pending[pending.length - 1].createdAt),
    }
    await store.setSystemDoc(MEMORY_COLLECTION, next)
    return next
  } catch {
    return current
  }
}
