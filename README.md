# Chafed & Jacked

A training app that runs in one of two modes.

**Strength** (current) — a 25-week hypertrophy block: a 4-day upper/lower split
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
npm test         # vitest — 861 tests
npm run build    # production build
npm run lint
```

---

## Modes

`mode` is a top-level field on the user profile, `'strength' | 'running'`,
defaulting to `strength`. It selects **which programme plans the sessions** —
and nothing else:

| | Strength | Running |
|---|---|---|
| Programme | `lib/strength/strengthProgram.js` | `lib/program.js` |
| Calendar | 25-week block, 4+1 mesocycles | Race-anchored build/deload/taper |
| Dashboard | Chain balance, volume landmarks, block progress | Mileage, race countdown, scaling tier |
| Data hook | `useStrengthBlock` | `useWorkout` |
| Nutrition | **the same engine, both modes** | |
| Run logging | **`useRunLog`, both modes** | |

**Fuelling deliberately does not branch on mode.** It used to, and that was the
bug rather than the feature it was written as — see *Nutrition* below.

Switching writes one field. Nothing is deleted in either direction, so flipping
back restores the endurance programme exactly.

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

One model, whatever programme planned the day:

```
TDEE   = BMR × neatFactor + lift kcal + net run kcal
Target = TDEE + the body-composition goal's kcal delta
```

### Why it stopped being two

There were two, selected by `mode`, and they disagreed in both directions.

The strength model had **no run term at all**. A 90-minute run changed nothing —
same calories, same carbs — and because "training day" was read off the *lifting*
calendar, a Saturday long run was labelled **"Rest day"** and fed like one. On a
cut that is a second deficit stacked on the first, which is the classic setup for
low energy availability.

Meanwhile the two models differed by **~800 kcal on a day with no run in it**:
`0.3 × BMR` from the activity factor (1.5 with no run term vs 1.2 with one) plus
300, because running mode had no concept of a surplus at all — only a deficit
when cutting. Both factors were *calibrated*, not derived, so no arithmetic
reconciles them. One had to win.

**1.5 won**, and that is a calibration pending revalidation rather than a
finding. It was kept precisely so days without a run keep the numbers they
already had, making the change provably about runs and nothing else.

### The pieces

| | Rule |
|---|---|
| NEAT factor | 1.5. Carries everything that isn't a logged session |
| Run kcal | Keytel (VO₂-extended when a VO₂max is on file), **net of the resting metabolism those minutes already carried** — ~103 kcal on a 90-min run |
| Protein | 2.0 g/kg, 2.2 cutting. The endurance ladder's 1.7 baseline is gone: it sat below the concurrent-training range on days that included lifting |
| Carbs | The **higher** of the hypertrophy split (6 g/kg lifting, 4 rest) and the endurance duration ladder, +1 g/kg for doing both, capped at 10 |
| Fat | Remainder, floored at 0.8 g/kg |
| Deficit cap | Taper/peak 250, race 0. The surviving half of the old phase table — a cap on the goal, not a replacement for it |

The carb ladder is consulted **only when the day contains a run**, and its short
rungs return nothing. Those rungs were never "what a run needs" — they were what
an endurance athlete eats on an ordinary day, and the old model had no other
baseline. Left in, a 28-minute jog on a cut asked for **409 g** of carbohydrate
against a full lifting day's **368 g**.

`dayType` is `lift | run | both | rest`, derived from what actually happened.

### Log completeness, and why it gates the guardrail

`lib/logCompleteness.js` reports how much of the last seven days the food log
can actually speak to. It exists because of a specific failure: four weeks into
a cut the athlete had gained 5.7 lb while the log reported 2101 kcal/day against
a maintenance of ~2615. Both numbers were true and the conclusion drawn from
them would have been wrong — two days had no document and seven more sat under
1500 kcal, every one a Saturday or a Sunday.

"Complete" is not knowable, so it is never claimed. Only three things are:

| | |
|---|---|
| `missing` | No document, or one with no entries. Certain. |
| `implausible` | Logged intake below **resting metabolism**. Not a claim about appetite — BMR is what the body spends doing nothing, so a full day below it is a gap. Deliberately not a fraction of the calorie *target*, which would flag hard days and excuse rest days. |
| `logged` | Everything else. **Not** a claim of completeness. |
| `inProgress` | Today, held out of the arithmetic entirely. At 9am nobody has eaten a day's food. |

The consequence is the point: **the rate-of-gain guardrail will not move a
target the athlete is demonstrably not eating to.** Its whole prescription
assumes the target is being hit and is simply set wrong; when the gap is worth
more per day than the 150 kcal it would adjust by, it returns `logIncomplete`,
leaves the target alone, and says what is missing. With a complete log and the
same weight trend, it adjusts as before.

The coach gets the same figure, so it stops reasoning about a deficit the log
cannot account for.

### Rate-of-gain guardrail

Target 0.25–0.5% bodyweight per week for a lean bulk. Below the band, add 150
kcal; above it, cut 150. Refuses to act on fewer than three weeks of weigh-ins —
a single reading is water, not tissue.

Moving the **wrong way entirely** is not a rate problem, and describing it as one
produced nonsense ("gaining 0.85 lb/week — slower than the 0.9-1.8 lb target",
tagged `tooSlow`). That is now `wrongDirection`, and it says to check the food
log is complete before changing calories: an untracked day or two a week is the
usual cause, and no calorie adjustment fixes it.

> Mifflin et al., *Am J Clin Nutr* 51(2):241–7, 1990. Katch-McArdle. Keytel et
> al., *J Sports Sci* 23(3):289–97, 2005. Jäger et al., ISSN Position Stand on
> Protein, 2017. Garthe et al., *Int J Sport Nutr Exerc Metab* 23(1):39–48, 2013.
> Slater & Phillips, *J Sports Sci* 29(sup1):S67–77, 2011. IOC Consensus on
> Sports Nutrition, 2011. IOC RED-S Consensus, 2018. Helms et al., 2014.

---

## Training load

`lib/trainingLoad.js` — session RPE × duration, in AU, lifting and running on
one scale.

```
Session load (AU) = sRPE (1-10) × duration (min)
```

Miles cannot tell twenty-five slow returning miles from twenty-five seasoned
ones, and cannot price a lifting session at all — which is why the mileage-based
tiers in `loadScaling.js` read "Full Send" through an entire return-to-run
build. This is the metric `skills/endurance-running-coach/references/return-to-run.md`
§6 actually prescribes, and lifting counts toward it: two sessions at RPE 7 ×
60 min is 840 AU, not a rounding error against a 600-900 AU run week.

**sRPE is collected after the session, not during it.** The methodology is
specific — rate it twenty to thirty minutes later, once it has settled, and rate
the whole session rather than its hardest interval. So the control lives on the
summary after saving and on a reopened session, never mid-workout. An unrated
session is *unknown* load rather than zero, which is why every total ships with
its coverage.

The ACWR is reported with its caveats attached and is **not interpretable**
until all four weeks of the chronic window carry load — a 28-day average
including near-empty weeks produces ratios of 1.3-1.4 that mean nothing.

**No load-scaling multiplier is derived from any of this yet, deliberately.**
The first rated week is the first data point the metric has ever had, and
banding it today would be the same mistake as inventing an activity factor.
`loadScaling.js` stays on mileage until there is a baseline to replace it with.

---

## Running inside a strength block

Runs are logged from either mode through `hooks/useRunLog.js`, extracted out of
`useWorkout` so the strength dashboard doesn't have to import the entire
endurance engine — race periodisation, mileage-scaled lifting loads — to record
four miles. `useWorkout` consumes it, so running mode reads the same code path
it always did. The append itself lives in `lib/runLog.js`, shared with the
coach's `log_run` tool and pinned by a parity test.

`components/strength/RunLogCard.jsx` is the entry point in the block.
Deliberately not `MileageBadge`: that card carries a weekly-target editor and a
load-scaling tier badge, and the scaling tiers start at 40 miles a week, so a
return-to-run build sits permanently in "Full Send" and the badge would be
decoration that looks like information.

Duration and average HR are optional but not decorative — without both, the
calorie estimate falls back to distance × bodyweight, which reads ~970 kcal on a
ten-miler against Keytel's ~1300. A 25–30% swing in the day's target depending on
whether two boxes got filled in.

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

**Correcting the day.** A meal that looks like it failed to log gets logged
again, and the second attempt lands on today — so the correction is a move
between two days rather than an edit within one. The detail sheet carries a
"Day eaten" control that re-dates an entry, keeping the time of day, because a
meal eaten at 7pm on the 4th was still eaten at 7pm.

Three things make that safe. It is one Firestore **batch**, so the meal cannot
end up on both days or neither — unlike an in-place correction, where a
half-completed write duplicating is the acceptable failure. `loggedAt` moves
with it, because `logDateIdFor` derives an entry's day from that field and a
meal left behind by it would sit on one day while every lookup went to another.
And the destination is checked first: the scenario that produces a move is the
same scenario that produces a duplicate, so if that day already holds the same
meal the sheet says to delete rather than move.

The control is hidden while portions are being edited — editing is staged behind
a save button, moving writes immediately, and a date changed in a staged form
that then silently doesn't save is worse than one extra tap.

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
    macroCalculator.js      the nutrition model (pure) — one, not per-mode
    nutritionAdvice.js      display shape, hydration, tip rotation
    runLog.js               run append, shared with the coach's log_run
    trainingLoad.js         sRPE x duration, ACWR — lifting and running on one scale
    logCompleteness.js      what the food log can and cannot speak to
    strength/               exercises · injuryGuardrails · strengthProgram
                            strengthPeriodization · chainBalance · mobility
    program.js periodization.js progression.js loadScaling.js   running engine
  hooks/     useStrengthBlock · useWorkout · useRunLog · useAppMode · useFirestore
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
| `savedMeals` | auto | The meal library — one serving each, name-keyed, logged in a tap |
| `coachChat` | auto | Chat thread — role, content, card payloads, photo thumbnail |
| `mileageLogs` / `dailyMileage` | week / date | Running mode only |

Sets carry RIR and side because chain balance needs both and neither can be
recovered retroactively from untagged data.
