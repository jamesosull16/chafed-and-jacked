# Chafed & Jacked — Claude Skills

Two Claude Skill packages that turn Claude into the coaching layer on top of the Chafed &
Jacked app: one owns training, one owns food. Both are self-contained methodology that will
also read the athlete's live app data when the MCP server is connected.

| Skill | Owns | Loads when the conversation is about… |
|---|---|---|
| `strength-conditioning-coach` | Programming, exercise selection, progression, injury guardrails, mobility | today's session, the split, sets/reps/RIR/rest, adding weight, deloads, chain balance, left/right or push/pull asymmetry, glute/hamstring/calf/quad/upper-body development, tight hips, ankle dorsiflexion, training around a high hamstring or knee issue |
| `sports-nutritionist` | Fuelling the lean bulk | what to eat, macro targets, remaining macros, calorie surplus, TDEE, protein and carb targets, rate of gain, meal ideas and swaps, logging meals, pre/post-workout food, supplements |

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

**The injury guardrails are hard constraints, not advice.** A proximal ("high") hamstring
strain sits directly against the goal of growing hamstrings, and the skill resolves that
explicitly rather than fudging it: isometrics and mid-range loading first, load progressed
before range, hip thrusts as the early glute driver, lying leg curl rather than seated (the
seated version flexes the hip and lengthens the proximal tendon under load), and a pain rule
that regresses the programme whenever working pain exceeds 3/10 or lingers into the next day.
Knee and ankle/hip mobility guardrails work the same way.

Reference files:
- `references/program-design.md` — block architecture, session templates, time-boxing, volume accounting, progression decision table, transition back to running
- `references/injury-guardrails.md` — staged proximal hamstring protocol, knee management, mobility programming, red flags, substitution tables
- `references/exercise-library.md` — categorised movement list annotated with chain, movement pattern, hamstring-lengthened-load risk, knee flexion demand, and ankle dorsiflexion demand

### `sports-nutritionist`

Fuels the lean bulk. Reads today's targets and logged intake and says what and how much to eat
to close the remaining gap, in real food with real quantities. Owns the block's macro model
(protein 1.8-2.2 g/kg default 2.0, carbs 4-6 g/kg with training days higher, fat as the
remainder floored at 0.8 g/kg, calories = TDEE + a configurable surplus defaulting to +300),
and enforces the rate-of-gain guardrail of 0.25-0.5% bodyweight per week judged on a 3-4 week
trend rather than any single weigh-in.

It logs meals when the athlete describes what they ate, and works from described intake when
the app isn't connected.

Reference files:
- `references/lean-bulk-protocol.md` — BMR/TDEE derivation, macro maths, worked examples, rate-of-gain adjustment protocol, nutrient timing, supplements, hydration
- `references/meal-strategies.md` — meals and snacks matched to macro-gap shape, high-protein swaps, protein reference tables, prep and eating-out patterns

---

## Installing

Skills are directories containing a `SKILL.md`. Copy the whole directory — reference files come
with it.

**For every project (personal, all conversations):**

```bash
mkdir -p ~/.claude/skills
cp -R skills/strength-conditioning-coach ~/.claude/skills/
cp -R skills/sports-nutritionist        ~/.claude/skills/
```

**For one project only (checked in, shared with anyone who clones it):**

```bash
mkdir -p .claude/skills
cp -R skills/strength-conditioning-coach .claude/skills/
cp -R skills/sports-nutritionist        .claude/skills/
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
```

Claude discovers skills by their `name` and `description` frontmatter and loads a skill's body
only when the conversation matches. Reference files load on demand from there, so a large
library costs nothing until it's needed.

Verify with `/skills` (or ask "what skills do you have?") in a new session.

To use them in Claude Desktop or claude.ai rather than Claude Code, upload each skill directory
as a zip in **Settings → Capabilities → Skills**.

---

## Live data (optional but recommended)

Both skills work standalone — they fall back to a short intake conversation and coach from your
answers. The live-data path additionally requires the **`chafed-and-jacked` MCP server** to be
configured as a connector.

With it connected, the skills read:

**Training** — `get_block_status()`, `get_training_summary({weeks})`,
`get_chain_balance({weeks})`, `get_body_metrics({weeks})`

**Nutrition** — `get_today_macros()`, `get_targets({date})`, `list_recent_meals({days})`,
`log_meal({description, image, mealType, when})`, `update_meal(id, patch)`, `delete_meal(id)`

Add it in Claude Code with `claude mcp add`, or in Claude Desktop / claude.ai via
**Settings → Connectors**. Check it's live with `/mcp`.

Both skills are instructed to **state explicitly whether a given answer came from live app data
or from the fallback intake**, so you always know what a recommendation is standing on. Neither
skill will invent logged numbers.

---

## Customising

The athlete profile is baked in as defaults, and every one of them is overridable in
conversation — say what's different and the skill adapts:

| Default | Override by saying |
|---|---|
| 4 days/week, 60-75 min | "I've only got 3 days this week" / "45 minutes today" |
| Full commercial gym | "I'm in a hotel gym with dumbbells only" |
| +300 kcal lean bulk | "Bump the surplus to 500" / "switch me to recomp" |
| Injury flags: high hamstring, knee, tight hips, ankle mobility | "the hamstring is clear now" / "add a shoulder flag" |
| Posterior-chain priority | "I want to prioritise upper body this mesocycle" |

The app's own defaults live in `src/lib/appMode.js` (`BODY_COMP_GOALS`, `INJURY_FLAGS`,
`defaultStrengthSettings`) and the skills are written to agree with them. If you change the
defaults there, skim the skills for the same numbers.
