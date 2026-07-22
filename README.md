# Chafed & Jacked

A training app that runs in one of two modes.

**Strength** (current) — a 22-week hypertrophy block: a 4-day upper/lower split
with posterior-chain emphasis, RIR-autoregulated mesocycles, weekly volume
landmarks, chain-balance tracking, and injury guardrails that filter exercise
selection rather than just warning about it.

**Running** — the original endurance programme: race-anchored periodisation with
a taper, mileage-scaled lifting loads, and HR-based run calorie accounting.
Preserved intact and one toggle away.

React 19 · Vite 7 · Tailwind 4 · Firebase (Auth, Firestore, Functions, Hosting) ·
Recharts · installable PWA.

```bash
npm install
npm run dev      # local dev
npm test         # vitest — 282 tests
npm run build    # production build
npm run lint
```

---

## Modes

`mode` is a top-level field on the user profile, `'strength' | 'running'`,
defaulting to `strength`. Everything downstream branches on it:

| | Strength | Running |
|---|---|---|
| Programme | `lib/strength/strengthProgram.js` | `lib/program.js` |
| Calendar | 22-week block, 4+1 mesocycles | Race-anchored build/deload/taper |
| Nutrition | Lean bulk, no run calories | Endurance, Keytel run calories |
| Dashboard | Chain balance, volume landmarks, block progress | Mileage, race countdown, scaling tier |
| Data hook | `useStrengthBlock` | `useWorkout` |

Switching writes one field. Nothing is deleted in either direction, so flipping
back in January restores the endurance programme exactly — there is a regression
test pinning running-mode output to measured values to keep it that way.

Existing profiles are lazily defaulted on read (`lib/appMode.js`) and the filled
document is written back once, so no migration script is needed.

---

## Injury guardrails

The block's hardest constraint is a **proximal ("high") hamstring strain**, which
sits in direct tension with the goal of growing hamstrings. The resolution is
sequencing, not avoidance — **load progresses before range**:

| Weeks | Stage | Permitted hamstring loading |
|---|---|---|
| 1–4 | 1 | Isometric and mid-range only |
| 5–12 | 2 | Partial range introduced, to tolerance |
| 13+ | 3 | Full range, reintroduced at ~60% load |

This is why **lying** leg curl is available from week one and **seated** is not:
the seated position flexes the hip, putting the proximal tendon under stretch
*and* load simultaneously. Hip thrusts and glute bridges drive glute growth
throughout, because they load hip extension without lengthening the hamstring.

The guardrails are structural rather than advisory. Splits are declared as
ordered *slots* with ranked candidates; the generator takes the first candidate
the guardrails permit and records what it substituted and why. A blocked movement
cannot reach the athlete, because the slot simply resolves to the next acceptable
option. Tests assert that no disallowed movement is emitted at any block week.

Knee flags exclude deep-knee-flexion movements and cap ROM on the rest; ankle and
hip flags never block, they add heel elevation and front-loaded mobility.

Working pain ≤3/10 that settles by the next day is acceptable. Higher, or pain
lingering into the next day, means regress load or range.

---

## Chain balance

Objective #2 is correcting an anterior/posterior imbalance, so the app measures
it. `lib/strength/chainBalance.js` counts weekly working sets — 1.0 per primary
muscle, 0.5 per secondary, excluding anything logged above RIR 4 — and reports:

- **Posterior : anterior ratio**, target ≥1.2:1, flagged below 1.0. Neutral-chain
  work (curls, lateral raises) is excluded; including it would dilute the signal.
- **Sets per muscle** against MEV / MAV / MRV landmarks, with hamstring targets
  capped while the strain is being managed — otherwise the dashboard would
  scream "under-trained" at an athlete doing exactly the right thing.
- **Left/right symmetry** on unilateral work, flagged above 10%. Sets logged
  without a side are ignored rather than counted as balanced; guessing would
  produce false reassurance.
- **Push : pull** balance for the upper body.

Lagging muscles feed back into session generation, which adds a set to movements
training them.

---

## Nutrition

### Strength mode — lean bulk

```
TDEE   = BMR × 1.5 + strength session kcal      (no run term)
Target = TDEE + surplus                          (default +300 kcal)
```

The activity factor is 1.5 rather than the endurance model's 1.2 because there is
no separate run-calorie term to carry non-lifting activity — reusing 1.2 would
badly under-feed rest days.

| Macro | Rule |
|---|---|
| Protein | 2.0 g/kg (2.2 cutting) — ISSN 1.6–2.2 g/kg |
| Carbs | 6 g/kg training days, 4 g/kg rest days. **Not** the endurance duration ladder — a 75-minute lifting session doesn't empty glycogen the way a three-hour run does |
| Fat | Remainder, floored at 0.8 g/kg |

**Rate-of-gain guardrail:** target 0.25–0.5% bodyweight per week. Below the band,
add 150 kcal; above it, cut 150. Deliberately refuses to act on fewer than three
weeks of weigh-ins — a single reading is water, not tissue, and reacting to it
sends the surplus oscillating.

> Garthe et al., *Int J Sport Nutr Exerc Metab* 23(1):39–48, 2013 — rate of gain
> and body composition. Jäger et al., ISSN Position Stand on Protein, 2017.
> Slater & Phillips, *J Sports Sci* 29(sup1):S67–77, 2011 — carbohydrate needs of
> strength athletes.

### Running mode — endurance (unchanged)

**BMR** — Katch-McArdle when body fat % is known (`370 + 21.6 × lean kg`),
otherwise Mifflin-St Jeor.

**Run calories** — Keytel HR-based, with a VO₂max-extended form and a
distance-only fallback (`miles × lbs × 0.63`).

```
Male:   kcal/min = (−55.0969 + 0.6309·HR + 0.1988·kg + 0.2017·age) / 4.184
Female: kcal/min = (−20.4022 + 0.4472·HR − 0.1263·kg + 0.074·age)  / 4.184
```

**TDEE** = `BMR × 1.2 + run kcal + strength kcal`. Carbs ladder by run duration
(5→10 g/kg); deficit is phase-scaled (build 400, deload 300, taper 250, race 0).

> Mifflin et al., *Am J Clin Nutr* 51(2):241–7, 1990. Keytel et al.,
> *J Sports Sci* 23(3):289–97, 2005. IOC Consensus on Sports Nutrition, 2011.
> IOC RED-S Consensus, 2018. Helms et al., 2014.

---

## Food logging

Describe a meal or photograph it; macros are estimated and logged. Two front
doors, one estimation service:

```
in-app camera ─┐
               ├─▶ estimateMeal Cloud Function ─▶ Claude vision ─▶ USDA FDC ─▶ Firestore
MCP server ────┘
```

The model identifies foods and estimates **portion mass**; USDA FoodData Central
supplies **macro density**. Vision models judge "how much food is on this plate"
far better than they recall "how many grams of protein are in 100g of this", so
each half does what it's good at. A database match that disagrees with the model
by more than 3× is discarded as a bad search rather than trusted.

Estimates are always shown for confirmation before saving, with the itemised
breakdown and the assumptions the model made. Portion estimation is genuinely
uncertain, and silently writing a guess into the day's totals would corrupt the
data the whole block is steered by.

API keys live only in the Cloud Function. Setup: [`mcp/README.md`](mcp/README.md).

---

## The Coach

An in-app chat tab (`/coach`) that is one coach with two areas of expertise —
strength and nutrition — not two bots behind a switch. It routes each turn
itself and blends both when a question spans them ("what do I eat after leg
day?"). One thread, persisted per user, so logging, corrections, fuelling and
training talk all live in the same conversation.

It can log a meal from text or a photo, correct one conversationally, propose
dinners sized to the remaining macro gap, show today's session, and propose
guardrail-respecting adjustments.

**Context injection over tool round-trips.** Targets, intake, today's session
and chain balance are injected into the prompt rather than exposed as read
tools. They're needed on nearly every turn, and a tool call per message would
double latency for no gain. Tools are reserved for *actions* (log, update,
delete) and for *rendering* cards the model authored.

**Two trust levels.** The uid comes from the verified auth token, never the
payload. Injury flags, the block week, the hamstring rehab stage and the meal
ids the coach may correct are all re-derived server-side from stored data — a
client claiming "stage 3, full range" cannot unlock a movement the athlete's
actual block week forbids. Macro targets and session details are client-computed
and advisory: they only ever inform advice returned to the same person who sent
them.

Because Cloud Functions deploy `functions/` standalone, the guardrail constants
are duplicated there rather than imported. `functions/__tests__/guardrailParity.test.js`
compares the two copies directly, so drift fails the build instead of quietly
weakening a guardrail.

Rate-limited to 60 turns/hour per user, counted in a top-level `coachUsage/{uid}`
document. That's deliberately outside the user's own subtree: Firestore rules
are a permissive union, so a `deny` nested under the user's recursive wildcard
would be overridden by it and the client could reset its own limit.

## Coaching skills

Two installable Claude skills in [`skills/`](skills/) — a Strength &
Conditioning Coach and a Sports Nutritionist. Both are hybrid: self-contained
methodology that reads live app data over the MCP server when it's connected,
and falls back to a short intake when it isn't. The in-app Coach is the same
methodology condensed into a chat voice.

---

## Project layout

```
src/
  lib/
    appMode.js              mode, goals, injury flags, profile migration
    macroCalculator.js      both nutrition models (pure)
    strength/               exercises · injuryGuardrails · strengthProgram
                            strengthPeriodization · chainBalance · mobility
    program.js periodization.js progression.js loadScaling.js   running engine
  hooks/     useStrengthBlock · useWorkout · useAppMode · useFirestore
  components/
    ui/                     design system primitives
    strength/  dashboard/  workout/  chat/  common/
  pages/
functions/                  Cloud Functions — meal estimation + coach (holds the API keys)
  src/coach/                orchestration, tools, prompt, guardrail parity
mcp/                        MCP server — log meals from a Claude conversation
skills/                     S&C Coach + Sports Nutritionist
```

Design system: [`DESIGN.md`](DESIGN.md).

---

## Data model

Everything is scoped to `users/{uid}`; Firestore rules allow a user only their
own subtree.

| Collection | Doc ID | Contents |
|---|---|---|
| `workoutSessions` | auto | Per-set `weight`, `reps`, `rir`, `side`; block week, phase, mobility completed |
| `exerciseProgress` | exerciseId | Current weight, last reps/RIR, capped history |
| `bodyMetrics` | auto | Weight, body fat %, fat/lean mass |
| `nutritionLogs` | `YYYY-MM-DD` | Target snapshot + entries with itemised breakdowns |
| `coachChat` | auto | Chat thread — role, content, card payloads, photo thumbnail |
| `mileageLogs` / `dailyMileage` | week / date | Running mode only |

Sets carry RIR and side because chain balance needs both and neither can be
recovered retroactively from untagged data.
