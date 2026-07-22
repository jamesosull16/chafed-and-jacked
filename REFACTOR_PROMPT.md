# Refactor Prompt — Chafed & Jacked: "Strength Block" Pivot

> Hand this document to a coding agent (Claude Code / Cowork) working inside the
> `chafed-and-jacked` repository. It is a complete brief: read it top to bottom,
> then work through the phases in order. Do not start editing before you have
> read the "Current State" and "Non-Negotiable Constraints" sections.

---

## 1. Mission

Chafed & Jacked is currently a running/endurance app that happens to include a
strength program. For the next **5 months** the owner (James) is stepping away
from running to focus on **strength and hypertrophy**, then returning to running
in the new year. Refactor the app so it serves this strength block **without
throwing away the running capability**, and add the new features described below.

The five training objectives for this block, in priority order:

1. **Build strength and drive hypertrophy** (muscle growth is the headline goal).
2. **Correct the anterior/posterior chain imbalance** — measure it, then close it.
3. **Grow and strengthen the posterior chain**, glutes first, then hamstrings and
   calves.
4. **Grow and define the upper body**, kept in left/right and push/pull balance.
5. **Mobility** — treated as a first-class training target, not an afterthought.

Plus two product features:

- **Frictionless food logging**: describe a meal in text *or* drop in a photo, and
  the macros are estimated and recorded automatically — delivered **both** as an
  MCP server (log from a Claude/Cowork chat) **and** as an in-app upload button.
- **Two coaching skills**: a Strength & Conditioning Coach and a Sports
  Nutritionist, built as **hybrid** skills (self-contained methodology that pulls
  the athlete's live app data when it's available).
- **A full visual redesign**: retire the current dark, burnt-orange theme for a
  **clean, light, minimal** design system built on a **cool blue/cyan** accent, with
  a real component library and icon set — modern, sleek, professional, easy to use
  (see Phase 7).

---

## 2. Athlete Profile (bake these into defaults, not hard-codes)

Store these as editable settings, but seed the Strength Block with them:

| Field | Value |
|---|---|
| Focus (this block) | Hypertrophy + strength, 5 months, return to running in Jan |
| Body-composition goal | **Lean bulk** — modest surplus (default **+300 kcal**, configurable ±) |
| Training days | **4 days/week**, **60–75 min** per session |
| Environment | **Full commercial gym** (rack, barbells, dumbbells, cables, full machine selection — leg press, hack squat, hamstring curl, hip thrust, etc.) |
| Priority muscles | Glutes → hamstrings → calves (posterior chain), then balanced upper body |
| Mobility focus | **Tight hips, limited ankle dorsiflexion** (typical runner's restrictions) |
| Injury / caution flags | **Proximal ("high") hamstring strain**, **knee issues**, **tight hips / limited ankle mobility** |

### Injury handling — read carefully, this shapes the whole program

- **High hamstring strain (proximal hamstring tendinopathy risk).** This is the
  single most important constraint, and it directly tensions against objective #3
  (grow hamstrings/glutes). The coach logic **must**:
  - Start hamstring work with **isometrics and mid-range loading**, not
    lengthened-position loading.
  - **Avoid deep-hip-flexion loaded hamstring stretch** early (deep-deficit RDLs,
    good mornings, seated/stiff-leg positions that put the proximal tendon under
    stretch + load). Progress **load before range**, then add range as tolerated.
  - Prefer **hip thrusts and glute bridges** (glute growth with minimal proximal
    hamstring lengthening) as the early glute driver.
  - Use a **pain-monitoring rule**: working pain ≤ 3/10 that settles by next day is
    acceptable; anything higher or lingering means regress load/range.
  - Favor **single-leg / staggered variants** at tolerable ranges over heavy
    bilateral stretched loading in the early weeks.
- **Knee issues.** Manage **deep-knee-flexion volume**; use tempo and tendon-friendly
  progressions (tolerable-ROM leg extensions, Spanish squats, slow eccentrics,
  heel-elevated squats). Grow quads via **leg press / hack squat in a pain-free
  ROM** rather than forcing depth.
- **Tight hips + limited ankle dorsiflexion.** **Front-load mobility** every session;
  program a dedicated mobility block (ankle dorsiflexion drills, hip flexor /
  adductor / 90-90, deep-squat prep). Ankle restriction limits squat depth — default
  to **heel elevation** and depth-to-tolerance.

---

## 3. Current State (what you're refactoring)

**Stack:** React 19, Vite 7, Tailwind 4, `react-router-dom` 7, Recharts 3,
Firebase 12 (Auth + Firestore), `vite-plugin-pwa` (installable PWA), Vitest.

**Routes (`src/App.jsx`):** `/login`, `/onboarding`, `/` (Dashboard), `/workout`,
`/metrics`, `/progress`, `/history`, `/nutrition`, `/settings`.

**Key library modules (`src/lib/`) — all endurance-biased today:**

- `program.js` — Exercise database + split. Its own header says *"NOT a hypertrophy
  program. Higher rep ranges, short rest"*; priorities are muscular endurance and
  injury prevention for **ultramarathon runners**. Exposes `EXERCISES`,
  `ROTATION_PAIRS`, `resolveExerciseForMesocycle`, `getExercisesForDay`,
  `DAY_LABELS`, `TRAINING_SCHEDULES` (`mon-wed-fri` / `tue-thu-sat`),
  `DAY_TYPE_ORDER = ['A','B','C']`. **3 days/week**, days A/B/C
  (Posterior Chain & Hip Stability / Upper Pull & Core / Single-Leg & Full Body),
  rep ranges skewed high (15–25) with 45–90s rest.
- `periodization.js` — **Race-anchored.** 4-week build + 1-week deload mesocycles,
  a 3-week taper counted back from `raceDate`, plus a "perpetual" build/deload cycle
  when no race is set. Exposes `getCurrentWeek`, `getPerpetualWeek`,
  `getWeekModifiers`, `getDeloadModifiers`, `getTaperModifiers`, `daysUntilRace`,
  `getActiveRace`, `calculateProgramStart`, `getNextSession`, `getDayTypeForDate`.
- `macroCalculator.js` — **Endurance nutrition engine.** BMR (Katch-McArdle /
  Mifflin), **run kcal via Keytel HR formula**, TDEE = `BMR×1.2 + runKcal +
  strengthKcal`, **carbs by run duration/mileage** (5–10 g/kg), protein
  1.6–2.2 g/kg, fat = remainder, and a **phase-based deficit** keyed to
  build/deload/taper/peak/race. Pure functions, no data reads — keep that property.
- `progression.js`, `loadScaling.js` — set/load progression and scaling.
- `nutritionAdvice.js`, `bodyCompGoals.js`, `bodyMetrics.js` — advice + body-comp math.
- `firebase.js` — Firestore/Auth init.

**Hooks:** `useWorkout.js` (session generation/logging), `useFirestore.js`.

**Components:** dashboard (`MileageBadge`, `NutritionPanel`, `RaceCountdown`,
`VolumeChart`, `WeekOverview`, `MetricsSummary`), common (`Layout`, `MacroRings`,
`NotificationPrompt`, `ProtectedRoute`), plus `charts/`, `metrics/`, `onboarding/`,
`workout/`, `auth/`.

**Tests:** `src/lib/__tests__/macroCalculator.test.js` (Vitest). Nutrition formula
citations live in `README.md`.

> **Before writing code, inspect the files you'll touch** — especially the exact
> Firestore document shapes read/written by `useWorkout.js`, `useFirestore.js`,
> `NutritionTracker.jsx`, `Settings.jsx`, and `Onboarding.jsx`. The schema notes in
> this brief are a guide; the code is the source of truth. Match existing field
> names and collection paths.

---

## 4. Non-Negotiable Constraints

1. **Preserve running mode.** Do not delete running logic. Everything endurance
   goes behind a mode branch (see Phase 1). James returns to running in January and
   must be able to flip back with **zero rebuild**.
2. **Keep pure-function modules pure.** `macroCalculator.js` and the new training
   math take inputs and return outputs — no Firestore reads inside them.
3. **Both modes must stay green.** Add tests proving Strength mode *and* Running
   mode both produce correct output. Never ship with failing Vitest.
4. **Migrate existing data safely.** Existing user/workout/nutrition documents must
   keep working; add new fields with sensible defaults and a one-time migration or
   lazy defaulting.
5. **Preserve the PWA + offline behavior.** Don't break `vite-plugin-pwa` or the
   installable app.
6. **No secrets in the client bundle.** Any vision/LLM API key lives server-side
   (Cloud Function / MCP server), never in the React app.
7. **Match existing conventions.** File layout, naming, Tailwind usage, and the
   `lib/` pure-function pattern already in the repo.

---

## 5. Workstreams

### Phase 1 — App Mode System (foundation for everything else)

Introduce a first-class **training mode**: `'strength'` | `'running'`.

- Persist `mode` on the user profile document in Firestore (default **`'strength'`**
  now; existing docs lazily default). Expose it through context (extend
  `AuthContext` or add a `useAppMode` hook) so any component/engine can branch.
- Add a **mode switch in Settings** (and a compact toggle somewhere on the
  Dashboard). Switching mode swaps program, periodization, nutrition targets,
  dashboard widgets, and copy — without data loss in either direction.
- All downstream engines (`program`, `periodization`, `macroCalculator`, dashboard)
  branch on `mode`. Running paths keep today's behavior **exactly**.
- Acceptance: toggling to Running restores current app behavior byte-for-byte in the
  relevant views; toggling to Strength shows the new block.

### Phase 2 — Training Engine (Strength Block)

Build a hypertrophy/strength engine parallel to the endurance one. Prefer adding a
`src/lib/strength/` module set (e.g. `strengthProgram.js`, `strengthPeriodization.js`,
`chainBalance.js`) over mutating the running modules, so both coexist cleanly.

**Split & structure (4 days/week, 60–75 min, full gym):**

- Default to a **4-day Upper/Lower split** with a posterior-chain emphasis, e.g.
  **Lower (posterior-focus)**, **Upper (push-emphasis)**, **Lower (quad + posterior)**,
  **Upper (pull-emphasis)** — but structure the data so the S&C Coach skill (Phase 5)
  can regenerate/adjust the split. Do **not** hard-code A/B/C for 3 days; generalize
  `DAY_TYPE_ORDER`, `TRAINING_SCHEDULES`, and `getExercisesForDay` to an N-day model.
- **Rep/rest for hypertrophy:** primary compounds ~5–10 reps, accessories ~8–15,
  isolation ~12–20; rest **90–180s** on compounds. Replace the endurance
  15–25-rep / short-rest defaults for this mode.
- Expand `EXERCISES` with a full-gym hypertrophy catalogue tagged by
  **muscle group** and **chain** (`anterior` / `posterior` / `neutral`) and by
  **movement pattern** (hinge/squat/lunge/horizontal-push/vertical-push/
  horizontal-pull/vertical-pull/isolation/carry/calf/core). Include glute-focused
  (hip thrust, cable kickback, abduction), hamstring (leg curl variants — introduced
  per the injury rules), calf (standing + seated), quad (leg press, hack, extension),
  back/chest/shoulders/arms, and the injury-safe substitutes named in §2.

**Chain-balance tracking (objective #2 + #3):** add `chainBalance.js` computing, from
logged sets/volume, a **posterior : anterior weekly volume ratio** per muscle group
and overall, plus **weekly set counts per muscle** (a hypertrophy volume landmark
model, ~10–20 sets/muscle/week). Surface an imbalance flag when anterior outpaces
posterior, and bias the recommended volume toward the lagging (posterior) side.
Track **left/right balance** for unilateral upper-body work too (objective #4).

**Periodization (replace race-taper with a block plan):** a **5-month hypertrophy
block** = stacked mesocycles (e.g. 4–5 weeks accumulation with **progressive volume**,
then a **deload**), autoregulated by **RIR/RPE** and **progressive overload** (add
reps → add load → add sets). No taper unless a target date is set. Anchor the block
to a **start date (now)** and an **end date (~January return-to-running)** and show
block progress. Keep `progression.js` / `loadScaling.js` working for both modes.

**Mobility as a tracked target (objective #5):** program a **mobility block** (warm-up
+ standalone) focused on ankle dorsiflexion and hips, and **track adherence** like any
other session component so it shows up in Progress and the dashboard.

### Phase 3 — Nutrition Engine (Lean Bulk)

Refactor `macroCalculator.js` to branch on mode while keeping its pure-function,
tested shape.

- **Strength mode calorie model:** `TDEE = BMR × activityFactor + strengthKcal`
  (no run kcal). Use a lifting-appropriate activity factor (default ~1.45–1.55,
  configurable) and **do not** collapse to near-BMR on rest days.
- **Lean-bulk surplus:** apply a **configurable surplus (default +300 kcal)** on top
  of TDEE instead of the endurance phase-deficit table. Support the other goals the
  UI may set (recomp = maintenance, aggressive bulk = larger surplus, cut = deficit)
  via a single `bodyCompGoal` parameter.
- **Macros for hypertrophy:** protein **1.8–2.2 g/kg** (default ~2.0), carbs
  **~4–6 g/kg** (higher on training days to fuel/recover — **not** the run-duration
  ladder), fat = remainder floored at 0.8 g/kg. Remove endurance carb-loading from the
  strength path (keep it in the running path).
- **Rate-of-gain guardrail:** expose target weekly weight gain (~0.25–0.5% BW/wk for a
  lean bulk) so the Sports Nutritionist skill and dashboard can nudge the surplus up or
  down based on the actual weight trend.
- Update `README.md`'s nutrition section to document the strength-mode formulas and
  citations alongside the existing endurance ones. Update/extend
  `macroCalculator.test.js` to cover both modes.

### Phase 4 — Frictionless Food Logging (MCP **and** in-app)

One shared estimation backend, two front doors.

**Shared estimation service:** a server-side function that accepts a **text
description and/or an image** and returns estimated `{ kcal, protein_g, carbs_g,
fat_g }` plus a **confidence** and an itemized breakdown. Use a vision-capable LLM for
photos/parsing and a food-nutrition database (e.g. **USDA FoodData Central**, or a
provider like Nutritionix) to ground quantities. **Keys stay server-side** (Firebase
Cloud Function or the MCP server process). Write results to the **existing nutrition
collection** — inspect `NutritionTracker.jsx` for the current meal/log schema and
extend it minimally: `{ description, photoUrl?, kcal, protein_g, carbs_g, fat_g,
items[], confidence, source: 'photo'|'text'|'manual', loggedAt }`.

**Front door A — MCP server** (new top-level `mcp/` package): expose tools so James can
log from a Claude/Cowork chat:
- `log_meal({ description | image, mealType?, when? })` → estimate + write to Firestore.
- `get_today_macros()` / `get_targets()` → read today's totals and the day's targets.
- `list_recent_meals()`, `delete_meal(id)`, `update_meal(id, ...)`.
Authenticate to Firestore for James's uid (service account or scoped token). Document
setup in the MCP package README so it can be added as a Cowork/Claude connector.

**Front door B — in-app**: add a **camera/upload + describe** control in
`NutritionTracker.jsx` (mobile-friendly, works from the PWA). It calls the same
estimation service, shows the estimate with the itemized breakdown for a **one-tap
confirm/edit before saving**, then writes the same schema. Reuse `MacroRings` /
`NutritionPanel` to reflect new totals immediately.

Both paths must reconcile with the day's targets from Phase 3 and never bypass
Firestore rules.

### Phase 5 — Coaching Skills (hybrid)

Deliver two skills as `SKILL.md` packages (plus any reference files). "Hybrid" =
self-contained methodology that **pulls live app data via the Phase 4 MCP / Firestore
when available**, and still functions from user-described inputs when not.

**Skill 1 — Strength & Conditioning Coach.** Owns programming for this block:
- Generates and adjusts the **4-day hypertrophy split** for a full commercial gym,
  targeting the five objectives, with the **injury rules in §2 as hard guardrails**
  (especially the high-hamstring-strain progression and knee/ankle cautions).
- Reads logged workouts, chain-balance metrics, and body metrics to **autoregulate**:
  progressive overload, when to add volume, when to deload, how to bias volume toward
  the lagging posterior chain, and how to keep upper-body push/pull and L/R balanced.
- Programs the **mobility work** (ankle/hip) and produces **"today's session"** on
  demand.
- Falls back to sensible programming from a short intake when live data is absent.

**Skill 2 — Sports Nutritionist.** Owns fueling for the lean bulk:
- Reads today's targets and logged intake (via MCP) and tells James **what/how much to
  eat** to hit remaining macros, high-protein and lean-bulk-appropriate.
- Adjusts the **surplus based on the actual weight-gain rate** (guardrail from Phase 3).
- Gives **meal ideas and swaps** that fit the macro gap, and integrates with the
  Phase 4 logging (e.g. "log what I just described").
- Works from described intake when the app isn't connected.

> Skills are delivered as files for James to install (this session can't save them to
> his account directly). Keep each skill's `description` trigger-friendly and its body
> focused on method + how to read the live data.

### Phase 6 — UI / Dashboard / Metrics / Settings

Make the Strength Block legible at a glance (running mode keeps its current views):

- **Dashboard (strength mode):** swap `MileageBadge` / `RaceCountdown` for
  strength-relevant widgets — **weekly sets-per-muscle vs landmark**, **posterior:anterior
  balance ratio**, **upper-body push/pull & L/R balance**, **mobility adherence**,
  **weight trend vs lean-bulk target**, and macro rings against the new targets. Reuse
  `VolumeChart` / `WeekOverview` with strength data.
- **Progress:** per-muscle-group volume over time, estimated 1RM / load progression on
  key lifts, the chain-balance ratio trend, and body-composition trend.
- **Onboarding / Metrics / Settings:** capture the new inputs — mode, `bodyCompGoal` +
  surplus, 4 training days, equipment = full gym, and the injury flags — and drive the
  engines from them.
- Keep copy honest to the block ("Strength Block — Week X of ~22", not race language).

### Phase 7 — Visual Design System & UI Overhaul

The owner wants to move off the current look entirely: **dark background, burnt-orange
(`#C2410C`) accent, emoji icons, system font.** Replace it with a **clean, light,
minimal, professional** design system — think Apple Health / Linear clarity — built
around a **cool blue/cyan** accent, with **ease of use** as the guiding principle.
This is a **full design system**, not a recolor: establish it early (tokens + core
components first, alongside Phase 1) so every new Strength-mode screen is born into it,
then re-skin the existing screens to match.

**Theme & tokens (Tailwind 4 `@theme` in `src/index.css`):**

- Flip the app to **light-first.** Remove `class="dark"` and the `bg-gray-950`/
  `text-gray-100` defaults in `index.html`; update `<meta name="theme-color">` to the
  new light chrome color. Sweep hard-coded dark grays (e.g. `bg-gray-950`,
  `text-brand`, `bg-gray-900` in `Layout.jsx` and elsewhere) onto semantic tokens.
- Redefine the `@theme` token set. Suggested light palette (tune for AA contrast):
  - Base `--color-bg: #FFFFFF`, `--color-surface: #F6F7F9`,
    `--color-surface-2: #EEF0F3`, hairline `--color-border: #E5E8EC`.
  - Text `--color-text: #0B0B0C`, `--color-text-muted: #5B6472`.
  - Accent **cool blue** `--color-brand: #2563EB` (primary actions), with a
    **cyan** data/secondary `--color-accent: #06B6D4`; hover/active variants.
  - Semantics retuned for light: `--color-success #16A34A`, `--color-warning #D97706`,
    `--color-danger #DC2626`.
- **Structure tokens so a dark theme can be added later without rework** — one token
  set, themeable — even though **light is the default** now.

**Typography:** adopt a modern geometric/neo-grotesque sans (e.g. **Inter** or Geist),
**self-hosted/bundled** (via `@fontsource` — no runtime CDN, so the PWA stays offline-
capable). Define a clear type scale and weights; keep `.tabular-nums` for all stats,
timers, and macro numbers.

**Icons:** replace every emoji (bottom nav `⌂ 🏋 ⚖ 📊 📋`, inline glyphs) with a
tree-shakeable icon set — **`lucide-react`**. Consistent stroke width and sizing.

**Component library (`src/components/ui/`):** build reusable, tokenized primitives and
refactor screens onto them: `Card`, `StatTile`/`Metric`, `Button`
(primary/secondary/ghost/danger), `Badge`/`Pill`, `SegmentedControl` (use for the
mode toggle), `Tabs`, `Sheet`/`Modal`, `Input`/`Field`, `ProgressRing` (restyle
`MacroRings`), `EmptyState`, and `Skeleton` loaders. Standardize **radius**
(`rounded-2xl` cards), a **spacing scale**, and **soft, subtle elevation** appropriate
to a light UI (light shadows + hairline borders, not heavy drop shadows).

**Charts (Recharts):** restyle every chart to the token system — light grid/axes,
readable tooltips, and an **accessible categorical series palette** derived from the
brand blue/cyan (follow the `dataviz` skill's palette + contrast guidance if
available). Ensure legibility on white; no reliance on color alone for meaning.

**Layout & ease of use:** keep it **mobile-first PWA** (`max-w-lg`, safe-area insets).
Refine the bottom nav with real icons and a clean active state in the accent; add a
light top bar where it aids orientation. **Touch targets ≥ 44px**, generous spacing,
strong visual hierarchy, one clear primary action per screen, and fast paths to the
things done daily (log a lift, log a meal, see today's targets).

**Accessibility & polish:** WCAG **AA** contrast throughout, visible focus states,
`prefers-reduced-motion` respected, subtle transitions/micro-interactions, and proper
empty/loading/error states. 

**Deliverable for this phase:** a short **design-tokens + components reference**
(`DESIGN.md` or a Storybook-lite page) documenting the palette, type scale, spacing,
and each component, plus before/after screenshots of Dashboard, Workout, and Nutrition
in the PR.

> Sequencing note: land **tokens, typography, icons, and the core `ui/` primitives
> first**, then build Phase 6's Strength dashboards directly in the new system and
> re-skin the remaining screens. Running-mode screens get re-skinned too — the visual
> system is shared across both modes.

---

## 6. Data Model & Migration

- **User/profile doc:** add `mode`, `bodyCompGoal`, `calorieSurplus`, `trainingDaysPerWeek`,
  `equipment`, `injuryFlags[]`, `blockStart`, `blockEnd`. Lazy-default on read for
  existing docs.
- **Workout/session docs:** ensure logged sets carry enough tags (muscle group, chain,
  pattern, per-side load) for `chainBalance.js`. Backfill/derive where possible.
- **Nutrition docs:** extend the meal schema per Phase 4; keep old entries valid.
- **Firestore rules & indexes:** update `firestore.rules` / `firestore.indexes.json`
  for any new collections/queries; keep per-user access scoping.

---

## 7. Testing & Acceptance

- **Vitest** for all new pure modules: strength macro targets (lean bulk math),
  chain-balance ratios and volume landmarks, strength periodization (meso/deload
  cycling, block start/end), and mode branching in `macroCalculator`.
- **Regression:** a test asserting Running mode output is unchanged from current
  behavior.
- **Injury guardrails:** unit tests that the S&C programming logic never emits a
  disallowed early-block hamstring movement given the high-hamstring-strain flag, and
  respects knee/ankle cautions.
- **Food logging:** test the estimation-service contract (input → macro shape +
  confidence) and that both front doors write the identical schema; mock the LLM.
- **Manual QA checklist** in the PR: toggle both modes; log a meal by text and by
  photo (MCP + in-app); generate "today's session" from the S&C skill; confirm
  dashboard widgets and Firestore writes.

## 8. Suggested Execution Order

1. Phase 1 (mode system) + the **foundation of Phase 7** (design tokens, typography,
   icons, core `ui/` primitives) — both unblock everything else and should land first.
2. Phase 2 (training engine) + Phase 3 (nutrition engine) — parallelizable.
3. Phase 4 (food logging) — shared service, then MCP, then in-app.
4. Phase 5 (skills) — depends on Phase 4's MCP for the live-data path.
5. Phase 6 (UI screens) — built **in the new design system** as each engine lands;
   re-skin remaining screens (both modes) to Phase 7.
6. Docs (`README.md`, `DESIGN.md`), tests green, migration verified, PR with the QA
   checklist and before/after screenshots.

Work in small, reviewable commits per phase. When a decision isn't specified here,
pick the option that best serves the five objectives and the injury guardrails, and
note it in the PR description.

---

## 9. Defaults Chosen (change if you disagree, but state it)

- Mode defaults to `strength` now; running preserved and one toggle away.
- Split: 4-day Upper/Lower, posterior-emphasis; generalized to N-day data model.
- Lean bulk at **+300 kcal**, protein ~2.0 g/kg, carbs ~4–6 g/kg (training-day higher).
- Block length ~22 weeks (now → January), deload every 4–5 weeks, RIR/RPE autoregulation.
- Food logging: USDA FoodData Central for grounding + vision LLM for photos; keys
  server-side.
- Skills shipped as installable files (hybrid data path via the new MCP).
- Visual system: **light-first**, minimal, cool **blue (`#2563EB`) + cyan (`#06B6D4`)**
  accent, Inter (bundled), `lucide-react` icons, a tokenized `ui/` component library,
  restyled Recharts, WCAG AA — dark theme left as a future add via the same tokens.
