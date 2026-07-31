import { Check, Pencil, Dumbbell, ShieldAlert, Plus, Timer } from 'lucide-react'
import { Badge, Button } from '../ui'
import { cn } from '../ui/cn'

const CONFIDENCE = {
  high: { label: 'High confidence', tone: 'success' },
  medium: { label: 'Estimated portions', tone: 'warning' },
  low: { label: 'Rough estimate', tone: 'danger' },
}

const MACRO_TONE = {
  kcal: 'text-text',
  protein: 'text-brand',
  carbs: 'text-accent-strong',
  fat: 'text-warning-strong',
}

function CardShell({ children, className }) {
  return (
    <div className={cn('bg-bg border border-border-default rounded-2xl overflow-hidden', className)}>
      {children}
    </div>
  )
}

function CardHead({ title, subtitle, badge }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 pb-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>}
      </div>
      {badge}
    </div>
  )
}

function MacroTiles({ kcal, protein, carbs, fat }) {
  const tiles = [
    { key: 'kcal', value: Math.round(kcal), label: 'kcal' },
    { key: 'protein', value: `${Math.round(protein)}g`, label: 'Protein' },
    { key: 'carbs', value: `${Math.round(carbs)}g`, label: 'Carbs' },
    { key: 'fat', value: `${Math.round(fat)}g`, label: 'Fat' },
  ]
  return (
    <div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
      {tiles.map((t) => (
        <div key={t.key} className="bg-surface rounded-xl py-2 text-center">
          <p className={cn('text-sm font-semibold tabular-nums', MACRO_TONE[t.key])}>{t.value}</p>
          <p className="text-[10px] text-subtle mt-0.5">{t.label}</p>
        </div>
      ))}
    </div>
  )
}

/** A meal the coach logged, with the itemised breakdown behind the number. */
export function FoodLogCard({ entry, corrected, onEdit }) {
  const confidence = CONFIDENCE[entry.confidence] || CONFIDENCE.medium

  return (
    <CardShell className="w-full max-w-[300px]">
      <CardHead
        title={entry.label}
        subtitle={`${corrected ? 'Updated' : 'Logged'}${entry.mealType ? ` · ${entry.mealType}` : ''}`}
        badge={
          <Badge tone={confidence.tone} size="xs">
            {confidence.label}
          </Badge>
        }
      />

      {entry.items?.length > 0 && (
        <ul className="px-3 pb-2 space-y-1">
          {entry.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-text min-w-0 truncate">
                {item.name}
                {item.quantity && <span className="text-subtle"> {item.quantity}</span>}
              </span>
              <span className="text-xs text-muted tabular-nums shrink-0">
                {Math.round(item.kcal)} kcal
              </span>
            </li>
          ))}
        </ul>
      )}

      <MacroTiles kcal={entry.kcal} protein={entry.protein} carbs={entry.carbs} fat={entry.fat} />

      {entry.assumptions?.length > 0 && (
        <p className="px-3 pb-2 text-[11px] text-subtle">{entry.assumptions[0]}</p>
      )}

      <div className="flex gap-2 p-3 pt-1 border-t border-border-default">
        <Button variant="secondary" size="sm" icon={Pencil} className="flex-1" onClick={onEdit}>
          Edit portions
        </Button>
        <div className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-subtle text-success-strong text-sm font-medium min-h-11">
          <Check className="w-4 h-4" aria-hidden="true" />
          Logged
        </div>
      </div>
    </CardShell>
  )
}

/** Meal options sized to the remaining gap, each loggable in one tap. */
export function MealOptionsCard({ options, onLog, loggingIndex }) {
  return (
    <div className="w-full max-w-[300px] space-y-2">
      {options.map((option, i) => (
        <CardShell key={option.name}>
          <div className="p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-text min-w-0">{option.name}</p>
              <span className="text-xs font-semibold text-brand tabular-nums shrink-0">
                +{Math.round(option.protein_g)}P · {Math.round(option.carbs_g)}C
              </span>
            </div>
            <p className="text-xs text-muted mt-1">{option.description}</p>
            <div className="flex items-center justify-between gap-2 mt-2.5">
              <span className="text-xs text-subtle tabular-nums">
                {Math.round(option.kcal)} kcal · {Math.round(option.fat_g)}g fat
              </span>
              <Button
                size="xs"
                icon={Plus}
                onClick={() => onLog(option, i)}
                disabled={loggingIndex != null}
              >
                {loggingIndex === i ? 'Logging…' : 'Log this'}
              </Button>
            </div>
          </div>
        </CardShell>
      ))}
    </div>
  )
}

/**
 * A post-session fuelling window.
 *
 * Distinct from MealOptionsCard on purpose: that one closes a macro gap
 * whenever it's asked for, this one is time-bound and arrives unprompted. The
 * window label is the whole point — it's why this is a card rather than a
 * sentence — so it leads, and each option is loggable in one tap through the
 * same path as any other meal.
 */
export function FuellingCard({ card, onLog, loggingIndex }) {
  return (
    <div className="w-full max-w-[300px] space-y-2">
      <CardShell>
        <CardHead
          title={`Fuel — ${card.window}`}
          subtitle={card.rationale}
          badge={
            <Badge tone="accent" size="xs" icon={Timer}>
              Window
            </Badge>
          }
        />
        <ul className="px-3 pb-3 space-y-2">
          {card.options.map((option, i) => (
            <li key={option.name} className="border-t border-border-default pt-2 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-text min-w-0">{option.name}</p>
                <span className="text-xs font-semibold text-brand tabular-nums shrink-0">
                  {Math.round(option.carbs_g)}C · {Math.round(option.protein_g)}P
                </span>
              </div>
              <p className="text-xs text-muted mt-1">{option.description}</p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-subtle tabular-nums">
                  {Math.round(option.kcal)} kcal · {Math.round(option.fat_g)}g fat
                </span>
                <Button
                  size="xs"
                  icon={Plus}
                  onClick={() => onLog(option, i)}
                  disabled={loggingIndex != null}
                >
                  {loggingIndex === i ? 'Logging…' : 'Log this'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardShell>
    </div>
  )
}

/** Today's prescribed session. */
export function SessionCard({ session }) {
  return (
    <CardShell className="w-full max-w-[300px]">
      <CardHead
        title={session.name}
        subtitle={session.focus}
        badge={
          <Badge tone="brand" size="xs" icon={Dumbbell}>
            RIR {session.rirTarget}
          </Badge>
        }
      />
      <ul className="px-3 pb-3 space-y-1.5">
        {session.exercises.map((ex) => (
          <li key={ex.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-text min-w-0 truncate">{ex.name}</span>
              <span className="text-xs text-muted tabular-nums shrink-0">
                {ex.sets} × {ex.repRange[0]}–{ex.repRange[1]}
              </span>
            </div>
            {ex.modification && (
              <p className="text-[11px] text-warning-strong mt-0.5">{ex.modification}</p>
            )}
          </li>
        ))}
      </ul>
      {session.substitutions?.length > 0 && (
        <p className="px-3 pb-3 text-[11px] text-subtle">
          Guardrail swaps:{' '}
          {session.substitutions.map((s) => `${s.with} for ${s.replaced}`).join('; ')}
        </p>
      )}
    </CardShell>
  )
}

/**
 * A proposed change to an upcoming session.
 *
 * "Apply" is intentionally not wired to a write yet — see the note in
 * CoachChat. Showing a button that silently does nothing would be worse than
 * showing one that says what it is.
 */
export function AdjustmentCard({ card, onDismiss }) {
  return (
    <CardShell className="w-full max-w-[300px]">
      <CardHead
        title={card.title}
        subtitle={card.subtitle}
        badge={
          <Badge tone="warning" size="xs" icon={ShieldAlert}>
            Guardrail
          </Badge>
        }
      />
      <ul className="px-3 pb-3 space-y-2">
        {card.changes.map((change) => (
          <li key={change.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-text min-w-0">
              {change.label}
              {change.detail && <span className="text-subtle"> — {change.detail}</span>}
            </span>
            {change.value && (
              <span className="text-xs text-muted tabular-nums shrink-0">{change.value}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="p-3 pt-0">
        <Button variant="secondary" size="sm" fullWidth onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </CardShell>
  )
}
