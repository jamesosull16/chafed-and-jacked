/**
 * The optimistic chat bubble.
 *
 * A pure decision extracted from useCoachChat so it can be tested without a
 * DOM: the repo has no React testing library, and the bug this covers — the
 * user's message appearing twice for the whole duration of a turn — is a
 * logic error, not a rendering one.
 */
import { describe, it, expect } from 'vitest'
import { visiblePending } from '../../hooks/useCoachChat.js'

const pending = (extra = {}) => ({ role: 'user', content: '2 eggs and toast', ...extra })

describe('visiblePending', () => {
  it('shows nothing when there is no pending message', () => {
    expect(visiblePending(null, [])).toBeNull()
  })

  it('shows the bubble before the written document has arrived', () => {
    // serverTimestamp() is unresolved locally, so the subscription filters the
    // document out. Without the bubble the message is invisible entirely.
    expect(visiblePending(pending({ docId: 'abc' }), [])).toBeTruthy()
  })

  it('shows the bubble while the write is still in flight', () => {
    expect(visiblePending(pending({ docId: null }), [])).toBeTruthy()
  })

  it('retires the bubble once its own document lands', () => {
    // The bug: both rendered until the model replied, so the message showed
    // twice for the length of the turn and then "corrected itself".
    const messages = [{ id: 'abc', role: 'user', content: '2 eggs and toast' }]
    expect(visiblePending(pending({ docId: 'abc' }), messages)).toBeNull()
  })

  it('still shows the bubble when the same text was sent before', () => {
    // Matching on content rather than id would hide the second send until it
    // landed, which is the same invisibility bug in the other direction.
    const messages = [{ id: 'older', role: 'user', content: '2 eggs and toast' }]
    expect(visiblePending(pending({ docId: 'newer' }), messages)).toBeTruthy()
  })
})
