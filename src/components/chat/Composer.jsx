import { useRef, useState } from 'react'
import { Camera, SendHorizontal, X } from 'lucide-react'
import { cn } from '../ui/cn'

/**
 * Quick chips, per mode.
 *
 * Both sets lead with a conversational opener rather than a lookup: the chips
 * are the clearest signal of what the coach is for, and four data queries make
 * it read as a dashboard with a text box. "How was that run?" invites the kind
 * of exchange the rest of this feature was built for.
 */
const CHIPS = {
  strength: [
    { label: 'What should I eat after this?', send: 'What should I eat after today\'s session?' },
    { label: 'Today’s session', send: "What's today's session?" },
    { label: 'What’s left today?', send: "What's left in my macros today?" },
    { label: 'Dinner ideas', send: 'What should I eat for dinner to finish my macros?' },
    { label: 'How am I tracking?', send: 'How is my chain balance and volume looking this week?' },
  ],
  running: [
    { label: 'How was that run?', send: 'How did that run look? Anything I should take from it?' },
    { label: 'What should I eat now?', send: 'What should I eat now, given what I just did?' },
    { label: 'Plan my week', send: 'How should the rest of this training week look?' },
    // Prefills rather than sends: only he knows the distance, and sending
    // "log a run" on its own just makes the coach ask how far.
    { label: 'Log a run', prefill: 'I ran ' },
    { label: 'What’s left today?', send: "What's left in my macros today?" },
  ],
}

/**
 * Composer: photo, text, send, plus quick chips spanning both domains.
 *
 * The textarea grows to a cap rather than scrolling from one line, because meal
 * descriptions are routinely two or three lines and a one-line field makes them
 * feel wrong to type.
 */
export default function Composer({
  onSend,
  onPickPhoto,
  photo,
  onClearPhoto,
  disabled,
  isStrength = true,
}) {
  const fileRef = useRef(null)
  const inputRef = useRef(null)
  const [text, setText] = useState('')

  const canSend = !disabled && (text.trim() || photo)
  const chips = CHIPS[isStrength ? 'strength' : 'running']

  function tapChip(chip) {
    if (!chip.prefill) return submit(chip.send)
    setText(chip.prefill)
    inputRef.current?.focus()
  }

  function submit(override) {
    const payload = override ?? text
    if (!payload.trim() && !photo) return
    onSend(payload.trim())
    setText('')
  }

  return (
    <div className="border-t border-border-default bg-bg">
      {photo && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <img
            src={photo.previewUrl}
            alt="Attached meal"
            className="w-12 h-12 rounded-xl object-cover border border-border-default"
          />
          <span className="text-xs text-muted flex-1">Photo attached</span>
          <button
            type="button"
            onClick={onClearPhoto}
            aria-label="Remove photo"
            className="p-2 rounded-lg text-subtle hover:text-text hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto no-scrollbar">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled={disabled}
            onClick={() => tapChip(chip)}
            className="shrink-0 px-3 py-1.5 rounded-full border border-border-strong text-xs font-medium text-muted hover:bg-surface hover:text-text transition-colors disabled:opacity-40"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 px-4 pb-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickPhoto(file)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Attach a photo"
          className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-brand hover:bg-surface transition-colors disabled:opacity-40"
        >
          <Camera className="w-5 h-5" />
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder="Ask your coach, or describe a meal…"
          aria-label="Message your coach"
          className="flex-1 resize-none bg-surface border border-border-default rounded-2xl px-3.5 py-3 text-sm text-text placeholder:text-subtle max-h-32 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
          style={{ minHeight: '2.75rem' }}
        />

        <button
          type="button"
          onClick={() => submit()}
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
            canSend
              ? 'bg-brand text-inverse hover:bg-brand-hover'
              : 'bg-surface-2 text-subtle cursor-not-allowed'
          )}
        >
          <SendHorizontal className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
