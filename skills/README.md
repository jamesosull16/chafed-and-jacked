# Chafed & Jacked — Claude Skills

Three Claude Skill packages that turn Claude into the coaching layer on top of the Chafed &
Jacked app: one owns lifting, one owns food, one owns running. Each is self-contained
methodology that will also read the athlete's live app data when the MCP server is connected.

| Skill | Owns | Loads when the conversation is about… |
|---|---|---|
| `strength-conditioning-coach` | Programming, exercise selection, progression, injury guardrails, mobility, aerobic maintenance, readiness | today's session, the split, sets/reps/RIR/rest, adding weight, deloads, chain balance, left/right or push/pull asymmetry, glute/hamstring/calf/quad/upper-body development, tight hips, ankle dorsiflexion, training around a high hamstring or knee issue, "should I train today", a broken or travelling week, weekly reviews |
| `sports-nutritionist` | Fuelling the lean bulk | what to eat, macro targets, remaining macros, calorie surplus, TDEE, protein and carb targets, rate of gain, meal ideas and swaps, logging meals, pre/post-workout food, supplements, dietary restrictions, travel and social eating, illness, appetite in either direction, switching goals |
| `endurance-running-coach` | The January return to running, and everything after it | the return-to-run decision, walk-run progression, weekly mileage, easy pace and Zone 2, threshold and interval sessions, long runs, strides and hills, periodisation, taper, race prep, running niggles, running-and-lifting together |

---

## What they do

### `strength-conditioning-coach`

Programs and autoregulates a 5-month strength/hypertrophy block for an athlete returning to
running in January. Generates a 4-day upper/lower split with posterior-chain emphasis (Lower
posterior-focus / Upper push / Lower quad+posterior / Upper pull), sized for a full commercial
gym and 60-75 minute sessions.

It produces concrete sessions — ordered exercises with sets, reps, RIR target, rest, and any
injury-driven modification — and it autoregulates from logged data: reading recent workouts to
decide when to add reps, load, or sets; watching the posterior:anterior set ratio and biasing
volume toward the lagging chain; keeping push/pull and left/right honest; calling deloads.

It also autoregulates at the session scale. A four-signal readiness check (sleep, soreness,
motivation, pain at rest) decides between running the session as written, capping the top set, or
running a reduced version — and the default is always to modify rather than cancel, because a
reduced session preserves the habit, the technique groove, and most of the weekly volume.

**The injury guardrails are hard constraints, not advice.** A proximal ("high") hamstring
strain sits directly against the goal of growing hamstrings, and the skill resolves that
explicitly rather than fudging it: isometrics and mid-range loading first, load progressed
before range, hip thrusts as the early glute driver, lying leg curl rather than seated (the
seated version flexes the hip and lengthens the proximal tendon under load), and a pain rule
that regresses the programme whenever working pain exceeds 3/10 or lingers into the next day.
Knee and ankle/hip mobility guardrails work the same way. Each rehab stage now has explicit
gates, and the return-to-running criteria are a shared gate with `endurance-running-coach`.

The "conditioning" half of the name is real: two easy aerobic sessions a week, chosen to avoid
eccentric damage (bike, sled, ruck, incline walk), because aerobic fitness detrains faster than
strength and January's return-to-run would otherwise start from zero.

Reference files:
- `references/program-design.md` — block architecture, session templates, time-boxing, volume accounting, progression decision table, reduced-equipment and travel substitutions, transition back to running
- `references/injury-guardrails.md` — staged proximal hamstring protocol with explicit stage gates, return-to-running criteria, knee management, mobility programming, red flags, substitution tables
- `references/exercise-library.md` — categorised movement list annotated with chain, movement pattern, hamstring-lengthened-load risk, knee flexion demand, and ankle dorsiflexion demand; aerobic modalities; minimal-equipment substitutes; the app's `exerciseId` decode table
- `references/conditioning-and-recovery.md` — aerobic maintenance protocol, the interference effect, sleep, readiness and HRV, soreness, illness rules and the return-to-training ladder, travel, recovery modalities worth the time

### `sports-nutritionist`

Fuels the lean bulk. Reads today's targets and logged intake and says what and how much to eat
to close the remaining gap, in real food with real quantities. Owns the block's macro model
(protein 1.8-2.2 g/kg default 2.0, carbs 4-6 g/kg with training days higher, fat as the
remainder floored at 0.8 g/kg, calories = TDEE + a configurable surplus defaulting to +300),
and enforces the rate-of-gain guardrail of 0.25-0.5% bodyweight per week judged on a 3-4 week
trend rather than any single weigh-in.

It logs meals when the athlete describes what they ate, and works from described intake when
the app isn't connected.

Two things it does that a macro calculator doesn't. It asks about **constraints before
recommendations** — restrictions, who cooks, how many meals fit the day, and whether appetite is
the problem or the solution — and treats the answers as hard constraints, because a plan built on
food the athlete won't eat doesn't survive week three. And it handles the **weeks that aren't
normal**: travel, weddings, food poisoning, a fortnight where appetite disappears, and the weight
readings that look like gain but are water.

It also owns the January model switch. Strength mode and running mode are two different TDEE
accounting systems, and mixing them double-counts the same activity by several hundred kcal a day.

Reference files:
- `references/lean-bulk-protocol.md` — BMR/TDEE derivation, macro maths, worked examples, rate-of-gain adjustment protocol including sparse and messy weigh-in data, goal switching and the strength-to-running mode change, nutrient timing, supplements, hydration
- `references/meal-strategies.md` — meals and snacks matched to macro-gap shape, high-protein swaps, protein reference tables, prep and eating-out patterns
- `references/situations.md` — dietary restrictions and plant-protein tables, travel, social eating, alcohol, illness, appetite in both directions, weight-trend anomalies

### `endurance-running-coach`

Owns the running, starting with the January return and continuing through every phase after it.

Its governing insight is a mismatch: after 22 weeks of lifting with maintenance cardio,
cardiovascular fitness returns in weeks but tendon, bone, and fascia tolerance takes months. The
athlete will feel capable of far more running than their tissues can absorb — and they come back
*stronger*, which masks the gap. Almost every call in the skill follows from that, and it holds
the build back deliberately while explaining why rather than just saying no.

The return-to-run gate is explicit and shared with the lifting skill:
`strength-conditioning-coach` owns and reports the hamstring loading criteria,
`endurance-running-coach` owns the decision. It runs a week-by-week walk-run build for weeks 1-4
and a continuous-running build for weeks 5-12, with a fixed order for reintroducing stressors —
easy volume, then frequency, then the long run, then strides (uphill before flat), then
threshold, then uphill hills, with downhill running and true speed work last, because those two
are the highest-risk combination for a proximal hamstring. The order is set by risk; the calendar
puts threshold slightly before hills because threshold is sub-maximal and can safely come early.

Beyond the return it works as a full endurance coach: zone setting from a time trial or a race
result, intensity distribution and the moderate-intensity rut, volume progression that doesn't
lean on the poorly-evidenced 10% rule, periodisation shapes, session design, load monitoring,
race preparation and taper, and the concurrent-training rules that let two lifting sessions
survive a running build.

Reference files:
- `references/return-to-run.md` — clearance criteria, the week-by-week walk-run and continuous builds, the reintroduction order, load monitoring, warning signs, setback ladders, what week 12 realistically looks like
- `references/aerobic-development.md` — the four determinants of running performance, intensity zones and how to anchor them, distribution models, the long run, volume progression, periodisation, concurrent training, detraining and retraining, what to measure
- `references/workout-library.md` — the session catalogue annotated by zone, hamstring risk, impact, and earliest appropriate week; cross-training substitutes; drills, plyometric and calf progressions; selection and substitution tables; sample weeks
- `references/running-injury-guardrails.md` — load management, the proximal hamstring in running, bone stress injuries, Achilles and calf, patellofemoral, the common presentations, niggle management, energy availability, red flags

---

## How the three fit together

Each skill has a **handoff contract** — a table of situations that belong to a sibling, and what
to hand over. The rule is that a skill says plainly when a question isn't its own and names what
it wants the other one to change, rather than either declining or quietly answering anyway.

The handoffs that matter most:

| Signal | From | To | Why |
|---|---|---|---|
| Loads stalling and weight flat 3+ weeks | S&C | Nutrition | Fix fuelling before adding volume. The S&C skill explicitly holds off on adding sets |
| Weight on target but loads stalling | Nutrition | S&C | Fuelling isn't the constraint — it's programming, recovery, or RIR drift |
| Deload week starting | S&C | Nutrition | Carbs come down ~150-200 kcal |
| Hamstring loading criteria met | S&C | Running | S&C reports the stage-4 criteria and symmetry; the running skill makes the return decision |
| Running has become regular | Running | Nutrition | Triggers the strength-mode → running-mode TDEE switch |
| Mileage rising while weight falls | Running | Nutrition | Energy availability, flagged before it becomes a bone stress injury |
| Red flags | Any | A clinician | Stated plainly, with no modified plan offered as an alternative to being assessed |

The pain rule (≤3/10 during, settled by the next morning) is deliberately identical across the
lifting and running skills, so the two can't give conflicting numbers about the same tissue. The
hamstring's four rehab stages are defined once, in the lifting skill, and the running skill
defers to them rather than restating them — it runs its own separate phase model for reintroducing
running intensity, on a different clock.

### …and how they relate to the in-app Coach

These three skills are the canonical long-form methodology. The Coach tab in the app
(`/coach`) is a condensed version of the same material, held in
`functions/src/coach/prompt.js` as four constants — a mode-independent core, one section per
mode, and the injury guardrails — composed per `profile.mode` by `buildSystemPrompt()`.
`COACH_STRENGTH` is the short form of `strength-conditioning-coach`, `COACH_ENDURANCE` of
`endurance-running-coach`, and the nutrition model is split across both because the app's TDEE
accounting differs by mode.

**When a skill and the prompt disagree, the skill is right and the prompt is stale.** The
athlete can have both surfaces open at once, so the two must not contradict each other; the
skills are where a methodology change gets made first. The prompt also inherits the handoff
contracts above — notably that run-specific fuelling belongs to `endurance-running-coach` rather
than `sports-nutritionist`, and that the return-to-run gate is a formal assessment the in-app
coach will not clear in conversation.

Numbers asserted in both places are covered by tests in
`functions/__tests__/coach.test.js` (`buildSystemPrompt`), which pin the figures where the
skills deliberately depart from the textbook answer — pyramidal rather than polarised
distribution, 5-10% volume steps on a 3-week average rather than the 10% rule, and 30-60 g/h of
in-run carbohydrate rather than 60-90. Those are the ones most likely to drift back.

---

## Installing

Skills are directories containing a `SKILL.md`. Copy the whole directory — reference files come
with it.

**For every project (personal, all conversations):**

```bash
mkdir -p ~/.claude/skills
cp -R skills/strength-conditioning-coach ~/.claude/skills/
cp -R skills/sports-nutritionist         ~/.claude/skills/
cp -R skills/endurance-running-coach     ~/.claude/skills/
```

**For one project only (checked in, shared with anyone who clones it):**

```bash
mkdir -p .claude/skills
cp -R skills/strength-conditioning-coach .claude/skills/
cp -R skills/sports-nutritionist         .claude/skills/
cp -R skills/endurance-running-coach     .claude/skills/
```

Either way the result should look like:

```
~/.claude/skills/
  strength-conditioning-coach/
    SKILL.md
    references/…
  sports-nutritionist/
    SKILL.md
    references/…
  endurance-running-coach/
    SKILL.md
    references/…
```

Claude discovers skills by their `name` and `description` frontmatter and loads a skill's body
only when the conversation matches. Reference files load on demand from there, so a large
library costs nothing until it's needed.

Verify with `/skills` (or ask "what skills do you have?") in a new session.

To use them in Claude Desktop, Cowork, or claude.ai rather than Claude Code, upload each skill
directory as a zip (or a packaged `.skill` file) in **Settings → Capabilities → Skills**.

---

## Live data (optional but recommended)

All three skills work standalone — they fall back to a short intake conversation and coach from
your answers. The live-data path additionally requires the **`chafed-and-jacked` MCP server** to
be configured as a connector.

With it connected, the skills read:

**Training** — `get_block_status()`, `get_training_summary({weeks})`,
`get_chain_balance({weeks})`, `get_body_metrics({weeks})`

**Nutrition** — `get_today_macros()`, `get_targets({date})`, `list_recent_meals({days})`,
`log_meal({description, image, mealType, when})`, `update_meal(id, patch)`, `delete_meal(id)`

**Running** — the app is in strength mode and exposes no run-specific tools yet, so
`endurance-running-coach` reads run data from a connected Strava, Garmin, or TrainingPeaks
connector if one is available, and otherwise works from pasted or described runs. It never
invents a run, a pace, or a weekly total.

Add the MCP server in Claude Code with `claude mcp add`, or in Claude Desktop / claude.ai via
**Settings → Connectors**. Check it's live with `/mcp`.

All three skills are instructed to **state explicitly whether a given answer came from live app
data or from the fallback intake**, so you always know what a recommendation is standing on. No
skill will invent logged numbers.

---

## Customising

The athlete profile is baked in as defaults, and every one of them is overridable in
conversation — say what's different and the skill adapts:

| Default | Override by saying |
|---|---|
| 4 days/week lifting, 60-75 min | "I've only got 3 days this week" / "45 minutes today" |
| Full commercial gym | "I'm in a hotel gym with dumbbells only" |
| +300 kcal lean bulk | "Bump the surplus to 500" / "switch me to recomp" |
| Injury flags: high hamstring, knee, tight hips, ankle mobility | "the hamstring is clear now" / "add a shoulder flag" |
| Posterior-chain priority | "I want to prioritise upper body this mesocycle" |
| 2 conditioning sessions/week | "I'm keeping the bike at 4 a week" |
| No dietary restrictions | "I'm vegetarian" / "no dairy this month" |
| Return to running in January | "I'm starting the run build in March" |

The app's own defaults live in `src/lib/appMode.js` (`BODY_COMP_GOALS`, `INJURY_FLAGS`,
`defaultStrengthSettings`) and the skills are written to agree with them. If you change the
defaults there, skim the skills for the same numbers.
