/**
 * POST-WORKOUT TRIGGER — Chafed & Jacked
 *
 * Turns "a workout was just logged" into the turn the coach actually sees.
 *
 * The trigger is deliberately thin. Everything the coach needs to decide
 * whether to speak — what the session was, how long ago, today's intake,
 * remaining macros, the next session — is already in the context block that
 * every turn carries. Restating it here would give the model two sources for
 * the same fact and a chance to prefer the stale one.
 *
 * What it does carry is the framing: that this is an automatic trigger rather
 * than a question, and that saying nothing is a permitted answer. Without the
 * second half the model treats an empty reply as a failure and pads.
 */

/**
 * @param kind    'strength' | 'run'
 * @param summary short human description of what was logged, from server-read data
 */
export function buildWorkoutTrigger({ kind, summary } = {}) {
  const what = summary || (kind === 'run' ? 'a run' : 'a training session')
  return [
    `[Automatic trigger — James just logged ${what}. He has not asked you anything.]`,
    '',
    'Decide whether this session warrants a message at all, using the post-workout rules and the live context below.',
    'If it does, send the window and a propose_fuelling card.',
    'If it does not — an easy or short session, a session whose window has already closed, or too little data to be specific — reply with nothing at all. An empty reply is correct and expected here; it is not a failure.',
  ].join('\n')
}
