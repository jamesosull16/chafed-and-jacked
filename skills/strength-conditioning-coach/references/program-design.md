# Program Design — 5-Month Strength & Hypertrophy Block

Deep reference for building and restructuring the block. `SKILL.md` holds the decision
procedure; this file holds the templates and the reasoning behind them.

---

## 1. Block architecture

Five months ≈ 22 weeks, ending when running resumes in January.

| Phase | Weeks | Purpose |
|---|---|---|
| Foundation | 1-5 | Rebuild loading tolerance, establish technique on machines, isometric hamstring base, mobility habit |
| Accumulation A | 6-10 | First real volume push. Glute and back volume climbs |
| Accumulation B | 11-15 | Peak volume. Hamstring range begins opening if pain rules are clear |
| Accumulation C | 16-20 | Highest loads, volume trimmed slightly, intensity up |
| Transition | 21-22 | Taper lifting volume, reintroduce running-specific tissue prep |

Each accumulation phase is a 4-week progressive mesocycle + 1 deload week. `get_block_status()`
returns `blockWeek`, `mesocycle`, `weekInMesocycle`, `phase`, `rirTarget`, `volumeMultiplier` —
the app owns the calendar, so trust it over this table when live data is present.

### Mesocycle progression shape

| Week | Sets vs. baseline | RIR | Intent |
|---|---|---|---|
| 1 | 100% | 3 | Re-groove, establish loads |
| 2 | ~110% | 2-3 | First set addition to priority muscles |
| 3 | ~120% | 2 | Second set addition |
| 4 | ~125% | 1 | Peak stimulus, loads at highest |
| 5 | ~50% | 4-5 | Deload — same loads, half the sets |

Volume climbs, load climbs modestly, RIR falls. That's the standard accumulation shape: fatigue
accumulates faster than it dissipates, so the deload exists to convert accumulated stimulus into
realised adaptation rather than to rest for its own sake.

**Deload construction.** Keep the loads. Halve the working sets. Take everything to RIR 4-5.
Keep the mobility block at full dose — that's the one thing that shouldn't deload, because
range is being actively rebuilt. Drop any movement that has been provoking symptoms and use the
week to test whether the symptoms settle.

---

## 2. The 4-day split

Mon / Tue / Thu / Fri (`DEFAULT_TRAINING_DAY_INDICES = [1,2,4,5]`). Two days between lower
sessions in both directions is the point — glutes and hamstrings under a rebuild need the gap.

### Day 1 — Lower, posterior focus

| # | Slot | Sets × reps | RIR | Rest |
|---|---|---|---|---|
| 0 | Mobility block | 6-8 min | — | — |
| 1 | Barbell hip thrust | 4 × 6-8 | meso RIR | 180s |
| 2 | Lying leg curl | 3 × 10-12 | meso RIR | 120s |
| 3 | Heel-elevated hack squat *or* leg press | 3 × 8-10 | meso RIR | 150s |
| 4 | Cable pull-through *or* 45° back extension (mid-range) | 3 × 12-15 | 1-2 | 90s |
| 5 | Standing calf raise | 4 × 10-15 | 1 | 75s |
| 6 | Copenhagen plank / adductor work | 2 × 20-30s/side | — | 45s |

### Day 2 — Upper, push emphasis

| # | Slot | Sets × reps | RIR | Rest |
|---|---|---|---|---|
| 0 | Mobility block (thoracic + hips) | 5-6 min | — | — |
| 1 | Incline dumbbell press *or* barbell bench | 4 × 6-10 | meso RIR | 150s |
| 2 | Chest-supported row (balance set, kept in) | 3 × 8-12 | meso RIR | 120s |
| 3 | Machine shoulder press *or* seated DB press | 3 × 8-12 | meso RIR | 120s |
| 4 | Cable fly / pec deck | 3 × 12-15 | 1 | 75s |
| 5 | Cable lateral raise | 3 × 12-20 | 0-1 | 60s |
| 6 | Overhead cable triceps ext. | 3 × 10-15 | 1 | 60s |

### Day 3 — Lower, quad + posterior

| # | Slot | Sets × reps | RIR | Rest |
|---|---|---|---|---|
| 0 | Mobility block | 6-8 min | — | — |
| 1 | Heel-elevated goblet/SSB squat, depth to tolerance | 3 × 6-10 | meso RIR | 180s |
| 2 | Single-leg hip thrust *or* B-stance hip thrust | 3 × 8-12/side | meso RIR | 120s |
| 3 | Leg press, pain-free ROM | 3 × 10-15 | meso RIR | 150s |
| 4 | Lying leg curl (second weekly hamstring exposure) | 3 × 12-15 | 1-2 | 90s |
| 5 | Seated calf raise | 4 × 12-20 | 1 | 60s |
| 6 | Cable abduction / hip abduction machine | 3 × 15-20 | 1 | 60s |

### Day 4 — Upper, pull emphasis

| # | Slot | Sets × reps | RIR | Rest |
|---|---|---|---|---|
| 0 | Mobility block (thoracic + hips) | 5-6 min | — | — |
| 1 | Weighted pull-up *or* lat pulldown | 4 × 6-10 | meso RIR | 150s |
| 2 | Barbell / T-bar row | 3 × 8-12 | meso RIR | 150s |
| 3 | Single-arm cable row (left/right corrective slot) | 3 × 10-12/side | meso RIR | 90s |
| 4 | Rear delt fly / reverse pec deck | 3 × 15-20 | 0-1 | 60s |
| 5 | Incline DB curl *or* cable curl | 3 × 10-15 | 1 | 60s |
| 6 | Face pull | 2 × 15-20 | 1 | 45s |

**Why this ordering works for the goals.** Glutes get direct heavy loading twice a week
(hip thrust bilateral on day 1, unilateral on day 3) — that's the highest-priority posterior
muscle getting the highest-quality slots. Hamstrings get two lying-curl exposures at mid-range
rather than one heavy stretched exposure. Calves get two sessions, one straight-leg (standing)
and one bent-knee (seated), covering gastroc and soleus. The push day carries a row and the
pull day carries a single-arm corrective, which keeps push/pull and left/right honest without
adding days.

---

## 3. Time-boxing to 60-75 minutes

Budget: 7 min mobility + 5 min warm-up sets + ~50-60 min working sets.

Working-set time ≈ sets × (set duration + rest). A 4 × 6-8 hip thrust at 180s rest costs about
13 min. Six exercises as laid out above lands at 55-65 min.

When time is short:

- **60 min:** drop the last isolation slot and one set from slots 4-5. Never drop the mobility
  block or the primary compound.
- **45 min:** run slots 1-3 only, at full sets. Supersetting antagonists (row/press,
  curl/pushdown) buys ~8 min with no meaningful loss on isolation work — never superset the
  primary compound.
- **Under 45 min:** primary compound plus one posterior accessory, full sets. Log it as a
  reduced session so the weekly set count reflects reality.

---

## 4. Weekly set accounting

Set targets per muscle live in `SKILL.md`. When counting from `get_training_summary()`:

- Count only working sets — warm-ups and sets at RIR ≥4 don't count toward the weekly target.
- Unilateral work counts as one set per side, not one set total.
- Compound movements count fractionally to secondary muscles: a row counts 1.0 to back and
  ~0.5 to biceps; a hip thrust counts 1.0 to glutes and ~0.3 to hamstrings; a squat counts 1.0
  to quads and ~0.5 to glutes. Apply the same convention the app uses in `get_chain_balance()`
  so the numbers reconcile.

**Chain balance arithmetic.** Ratio = posterior working sets ÷ anterior working sets over the
week. Posterior = glutes, hamstrings, calves (gastroc), back, rear delts, spinal erectors.
Anterior = quads, chest, front/side delts, biceps-as-anterior-arm, hip flexors. Target ≥1.2:1
for this block; at 1.0 or below, flag it and add glute and back sets.

---

## 5. Adding volume between mesocycles

Rules for the set additions at each new mesocycle:

1. Cap total weekly additions at ~10-15%. Above that, recovery becomes the limiter.
2. Spend additions in priority order: glutes → back → hamstrings (only if the hamstring
   progression criteria in `injury-guardrails.md` are met) → calves → side delts.
3. Never add sets to a muscle that hasn't progressed load or reps in the previous mesocycle —
   that's a recovery problem, not a stimulus problem.
4. Never add sets in a week where sleep or appetite is disrupted.
5. When a muscle hits the top of its band (e.g. glutes at 20 sets) and progress continues, hold
   volume and progress load instead. Volume isn't the only lever and it's the expensive one.

---

## 6. Progression decision table

Read the last 1-2 sessions for the movement from `get_training_summary()`.

| Observation | Action |
|---|---|
| All sets at top of rep range, RIR at or above target | Add load (2.5-5 kg compound, 1-2.5 kg isolation), reset to bottom of range |
| Some sets at top, some not | Add reps on the lagging sets, hold load |
| Reps dropping week on week at same load | Check sleep/food. Hold load one more week; if still dropping, deload the movement |
| RIR consistently below target (grinding) | Load is too heavy — drop 5-10% and rebuild |
| RIR consistently above target (easy) | Add load immediately, don't wait for the rep ceiling |
| Pain reported >3/10 or lingering next day | Regress load or range per `injury-guardrails.md`. Progression is suspended for that movement until clear |
| Stable across a full mesocycle, recovery fine | Add a set next mesocycle, within the weekly cap |

---

## 7. Transition back to running (weeks 21-22 and beyond)

The block ends, it doesn't stop dead. In the final two weeks:

- Cut lifting volume ~40%, hold loads. This preserves strength while freeing recovery for the
  first running weeks.
- Add low-intensity aerobic work — 2-3 easy sessions — before adding any intensity.
- **The proximal hamstring is the risk point on return to running.** Sprinting and fast downhill
  running load the proximal tendon in a lengthened position at speed, which is exactly the thing
  the whole block has been avoiding. Reintroduce speed last, after 3-4 weeks of easy volume,
  and only if hamstring loading has been symptom-free through full range.
- Keep two lifting sessions per week indefinitely. Losing the block's gains to a running
  build is avoidable; maintenance volume is roughly one-third of accumulation volume.
- Mobility work continues unchanged. Running does not improve ankle dorsiflexion or hip
  extension; it consumes them.

---

## 8. Evidence notes

- **Volume landmarks** — Schoenfeld et al. (2017) dose-response meta-analysis and subsequent
  volume-landmark work support ~10-20 sets/muscle/week for trained lifters, with a flattening
  return above that band and a rising recovery cost.
- **Rest intervals** — Schoenfeld et al. (2016) found greater hypertrophy with 3 min vs 1 min
  rest on compound work, driven by preserved volume-load. Hence 150-180s on primaries.
- **Rep range** — hypertrophy is comparable across ~5-30 reps when sets are taken near failure
  (Schoenfeld et al. 2021). The ranges here are chosen for joint tolerance and time efficiency,
  not because a magic range exists.
- **Autoregulation by RIR** — Helms et al. (2016) RPE/RIR-based load prescription; RIR scales
  are accurate enough in trained lifters within ~1 rep near failure.
- **Deload** — Israetel's fatigue-management model: volume accumulates stimulus and fatigue
  together; the deload realises the adaptation.
