# Design System — Chafed & Jacked

Light-first, minimal, built for one-handed use in a gym. Cool blue for action,
cyan for data. Every colour is a token; nothing in a component should be a raw
hex or a `gray-*` utility.

---

## Tokens

Raw values live on `:root` in [`src/index.css`](src/index.css) as `--cj-*`
custom properties, then map into Tailwind utilities via `@theme inline`. That
indirection is the whole point: a dark theme is an override of the `:root`
block, not a component refactor. `[data-theme="dark"]` is already defined and
proven to work — light is simply the default.

### Surfaces

| Token | Utility | Value | Use |
|---|---|---|---|
| `--cj-bg` | `bg-bg` | `#FFFFFF` | Page and card backgrounds |
| `--cj-surface` | `bg-surface` | `#F6F7F9` | Recessed panels, hover states |
| `--cj-surface-2` | `bg-surface-2` | `#EEF0F3` | Inputs, progress tracks, chips |
| `--cj-surface-3` | `bg-surface-3` | `#E4E7EC` | Shaded band inside a track |
| `--cj-border` | `border-border-default` | `#E5E8EC` | Default hairline |
| `--cj-border-strong` | `border-border-strong` | `#CDD3DB` | Input borders, dividers that need to read |

### Text

| Token | Utility | Value | Contrast on white |
|---|---|---|---|
| `--cj-text` | `text-text` | `#0B0B0C` | 20.1:1 |
| `--cj-text-muted` | `text-muted` | `#5B6472` | 5.98:1 ✅ AA |
| `--cj-text-subtle` | `text-subtle` | `#8A929E` | 3.996:1 — large text, labels, icons only |
| `--cj-text-inverse` | `text-inverse` | `#FFFFFF` | On brand/solid fills |

### Brand and accent

| Token | Utility | Value | Contrast | Use |
|---|---|---|---|---|
| `--cj-brand` | `bg-brand` / `text-brand` | `#2563EB` | 5.17:1 ✅ AA | Primary actions, active nav, posterior chain |
| `--cj-brand-hover` | `bg-brand-hover` | `#1D4ED8` | | Hover |
| `--cj-brand-active` | `bg-brand-active` | `#1E40AF` | | Pressed |
| `--cj-brand-subtle` | `bg-brand-subtle` | `#EFF6FF` | | Tinted card backgrounds |
| `--cj-brand-border` | `border-brand-border` | `#BFDBFE` | | Tinted card borders |
| `--cj-accent` | `bg-accent` | `#06B6D4` | **2.43:1** | Data viz, anterior chain — **never small text on white** |
| `--cj-accent-strong` | `text-accent-strong` | `#0E7490` | 5.10:1 ✅ AA | The text-safe cyan |

### Semantics — read this before using them

Each semantic colour has a **fill** token and a **`-strong` text** token. The
plain token is tuned for fills, borders and large glyphs, where it reads well
and matches the brand's saturation. It does **not** pass AA as body text on
white. The `-strong` variant does.

| Meaning | Fill (`bg-*`) | Text (`text-*-strong`) | Tint | Border |
|---|---|---|---|---|
| Success | `#16A34A` (3.25:1) | `#15803D` (4.90:1 ✅) | `bg-success-subtle` | `border-success-border` |
| Warning | `#D97706` (3.14:1) | `#B45309` (4.90:1 ✅) | `bg-warning-subtle` | `border-warning-border` |
| Danger | `#DC2626` (4.62:1 ✅) | `#B91C1C` (7.0:1 ✅) | `bg-danger-subtle` | `border-danger-border` |

**Rule:** `bg-success` on a badge is fine. `text-success` on 12px body copy is
not — use `text-success-strong`.

### Elevation

Light UI: hairline border plus a soft shadow. Never a heavy drop shadow.

`shadow-sm` (cards that lift) · `shadow-md` (sheets, sticky bars) ·
`shadow-lg` (modals).

### Type

**Inter Variable**, bundled via `@fontsource-variable/inter` — self-hosted, so
the PWA keeps working offline. No runtime CDN.

| Role | Classes |
|---|---|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section title | `text-sm font-semibold` |
| Big stat | `text-2xl font-semibold tabular-nums` |
| Body | `text-sm` |
| Secondary | `text-xs text-muted` |
| Label | `text-xs font-medium text-subtle uppercase tracking-wide` |

Every number that can change — timers, macros, set counts, weights — carries
`tabular-nums`, so digits don't jitter as they update.

### Radius and spacing

Cards `rounded-2xl` · controls and inputs `rounded-xl` · chips and pills
`rounded-full`. Spacing runs on the Tailwind 4-point scale; card padding is
`p-4`, stacks are `space-y-4` at page level and `space-y-2` inside a card.

---

## Components — `src/components/ui/`

| Component | Notes |
|---|---|
| `Card` | The base surface. `to` renders it as a `Link`; `padded={false}` for cards with their own internal layout; `elevated` adds `shadow-sm`. |
| `CardHeader` / `CardLabel` | Title-with-icon-and-action row; uppercase micro-label. |
| `Button` | `primary \| secondary \| ghost \| subtle \| danger \| dangerGhost` × `xs \| sm \| md \| lg`. Takes `icon` / `iconRight` as lucide components. |
| `StatTile` | One number plus context. `direction` is the arrow; `tone` is whether that direction is *good* — the two are separate so "weight down" can be positive during a cut and negative during a bulk. |
| `Badge` | `neutral \| brand \| accent \| success \| warning \| danger \| solid`. |
| `SegmentedControl` | Mutually exclusive choice. Used for the mode toggle. |
| `Tabs` | Underline tabs for in-page view switching. |
| `Field` / `Input` / `Textarea` | `Field` owns the label, hint and error, and wires `htmlFor` / `aria-describedby`. Accepts a render-prop child to pass the generated id down. |
| `ProgressRing` | Concentric rings for macro tracking; over-target rings switch to the warning token **and** fill completely, so state doesn't rest on colour alone. |
| `ProgressBar` | Linear variant with a proper `role="progressbar"`. |
| `Sheet` | Bottom sheet on mobile, centred dialog above `sm`. Handles Escape, scroll lock, backdrop dismiss and focus return. |
| `EmptyState` | Icon, title, message, optional action. |
| `Skeleton` / `SkeletonPage` | Card silhouettes rather than a spinner, so the layout doesn't jump on load. |

### A note on overriding primitives

`cn()` is a plain join, not `tailwind-merge`. When you pass `className` to a
primitive, your class sits *alongside* the component's own, and the winner is
CSS emission order rather than the order you wrote them. The semantic tokens
happen to be emitted after the base ones, so tone overrides do win — but if you
need to override a *structural* class like padding, use the component's prop
(`padded={false}`) rather than fighting it with `p-3`.

---

## Charts

Recharts, styled through [`src/components/ui/chart.js`](src/components/ui/chart.js).
Never hard-code a hex in a chart.

```jsx
import { CHART_COLORS, chartAxis, chartGrid, chartTooltip } from '../components/ui'

<CartesianGrid {...chartGrid} />
<XAxis dataKey="date" {...chartAxis} />
<Tooltip {...chartTooltip} />
<Line stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
```

Series order: blue → cyan → violet → amber → green → pink. The first three also
differ in lightness, so they survive greyscale and the common colour-vision
deficiencies. Grid lines are horizontal only.

Where a colour carries meaning (fat mass red, lean mass green), use the semantic
token directly rather than a series slot.

---

## Accessibility

- **AA contrast** for all body text. The measured ratios are in the tables above;
  the `-strong` variants exist precisely because the fill colours don't clear it.
- **44px minimum touch targets.** `Button` at `sm`/`md`/`lg` and every nav item
  clear it. A raw `<button>` needs `min-h-11`.
- **Never colour alone.** Over-target macro rings also fill completely; trend
  arrows accompany every coloured delta; the chain-balance bar has a labelled
  target marker.
- **Visible focus.** A global `:focus-visible` ring in the brand colour, at
  2px with 2px offset.
- **`prefers-reduced-motion`** collapses every animation and transition to
  0.01ms.
- Icon-only buttons carry `aria-label`; progress bars carry `role="progressbar"`
  with real `aria-valuenow`/`max`.

---

## Adding a dark theme later

1. Nothing in components changes.
2. `[data-theme="dark"]` in `index.css` already carries a full token set.
3. Add a toggle that sets `document.documentElement.dataset.theme`.
4. Re-verify contrast for the dark values — they were chosen to be plausible,
   not measured, since dark isn't shipping yet.
