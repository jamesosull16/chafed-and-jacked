# Lean Bulk Protocol — Strength Block

Full derivation and adjustment procedure. `SKILL.md` holds the decision flow; this is the
arithmetic and the reasoning.

---

## 1. Energy expenditure

### BMR

**Katch-McArdle — preferred when body-fat % is known:**

```
lean_mass_kg = weight_kg × (1 − bodyfat_pct / 100)
BMR = 370 + (21.6 × lean_mass_kg)
```

Preferred because it works from lean mass, and a lean muscular athlete is exactly the case
where weight-based equations misfire. A 80 kg athlete at 12% vs 22% body fat has meaningfully
different metabolic tissue at the same bodyweight.

**Mifflin-St Jeor — fallback (Mifflin et al. 1990):**

```
Male:   BMR = 10·kg + 6.25·cm − 5·age + 5
Female: BMR = 10·kg + 6.25·cm − 5·age − 161
```

### TDEE in strength mode

```
TDEE = (BMR × activity_factor) + strength_session_kcal
```

**Activity factor ~1.5** for this block: a desk-based day plus four lifting sessions plus
general movement. This is deliberately higher than the running-mode 1.2 in
`src/lib/macroCalculator.js`, because in running mode run kcal are added explicitly on top
and the base factor stays low. In strength mode there is no run kcal line, so the activity
factor absorbs NEAT and general activity.

Adjust the factor if reality disagrees:
- Mostly sedentary outside the gym, desk job, low step count → 1.4
- Default → 1.5
- On feet all day, physical job, high step count → 1.6-1.7

**Strength session kcal:** roughly 5-8 kcal/min of a lifting session, so a 60-75 min session
is ~350-500 kcal. This is lower than most trackers claim — heavy lifting with 2-3 min rest
periods is not metabolically expensive minute-for-minute. Do not add EPOC as a separate line;
it's small and already inside the estimate.

**When live data exists, `get_targets()` returns the derivation the app used. Trust it over
recalculating by hand, and only recompute when the athlete is questioning a number or the app
isn't connected.**

### Surplus

Default **+300 kcal** (`BODY_COMP_GOALS.leanBulk.kcalDelta`). Configurable — the athlete can
set `strength.calorieSurplus` in the app, and the rate-of-gain guardrail nudges it over time.

Other configured goals, for reference: aggressive bulk +600, recomp 0, cut −400.

Why +300 rather than more: muscle protein accretion in a trained lifter is capped somewhere
around 0.2-0.4 kg/month. Calories above what supports that rate go to fat. A +300 kcal surplus
covers the theoretical maximum accretion rate with headroom, and nothing above it buys more
muscle.

---

## 2. Macro derivation

Work in this order — protein, then carbs, then fat as the remainder.

### Protein: 1.8-2.2 g/kg, default 2.0

```
protein_g = weight_kg × 2.0
```

ISSN position stand on protein and exercise (Jäger et al. 2017) puts 1.4-2.0 g/kg as the range
for building muscle, with the upper end appropriate during hypertrophy blocks. Morton et al.
(2018) meta-analysis found benefit plateauing around 1.6 g/kg with a confidence interval
reaching 2.2 — so 2.0 sits at a sensible point with margin for imperfect logging.

Use bodyweight, not lean mass, unless the athlete is above ~25% body fat.

**Distribution matters as much as the total.** Aim ~0.4 g/kg per meal across 4-5 meals
(Schoenfeld & Aragon 2018). For an 80 kg athlete that's ~32 g per feed, 5 feeds. A day that
hits 160 g in two enormous meals is a worse day than one that hits 150 g across five.

Nudge to 2.2 g/kg during a deload or if they're not gaining as expected — the extra protein is
satiating and protective. Drop toward 1.8 only if hitting 2.0 is crowding out carbs.

### Carbs: 4-6 g/kg, training days at the top

| Day type | Carbs |
|---|---|
| Lifting day | 5.5-6 g/kg |
| Rest day | 4-4.5 g/kg |
| Deload lifting day | 4.5-5 g/kg |

Carbs are the primary lever for hitting the calorie target because they fuel the training that
justifies the surplus. High-volume hypertrophy work is glycogen-dependent; sets to near-failure
in the 8-15 range draw heavily on muscle glycogen, and depleted sessions lose reps.

```
carb_g = weight_kg × (5.5 if training else 4.0)
```

### Fat: the remainder, floored at 0.8 g/kg

```
remaining_kcal = target_kcal − (protein_g × 4) − (carb_g × 4)
fat_g = remaining_kcal / 9
if fat_g < weight_kg × 0.8:
    fat_g = weight_kg × 0.8
    # recompute carbs down to fit the calorie target
```

The 0.8 g/kg floor exists because sustained very-low-fat intake compromises fat-soluble vitamin
absorption and, in athletes, testosterone. Fat is the flexible macro above that floor, not
below it.

---

## 3. Worked example

80 kg athlete, 14% body fat, 178 cm, 34, male, lifting day.

```
lean_mass    = 80 × 0.86               = 68.8 kg
BMR          = 370 + (21.6 × 68.8)     = 1,856 kcal
TDEE         = (1,856 × 1.5) + 420     = 3,204 kcal
target       = 3,204 + 300             = 3,504 kcal

protein      = 80 × 2.0  = 160 g       = 640 kcal
carbs        = 80 × 5.5  = 440 g       = 1,760 kcal
remaining                              = 1,104 kcal
fat          = 1,104 / 9 = 123 g       (floor is 64 g — comfortably clear)
```

**Lifting day: 3,504 kcal · 160 P · 440 C · 123 F**

Rest day, same athlete:

```
TDEE         = (1,856 × 1.5) + 0       = 2,784 kcal
target       = 2,784 + 300             = 3,084 kcal
protein      = 160 g                                   = 640 kcal
carbs        = 80 × 4.0 = 320 g                        = 1,280 kcal
fat          = (3,084 − 1,920) / 9     = 129 g
```

**Rest day: 3,084 kcal · 160 P · 320 C · 129 F**

Protein identical. Carbs and calories track the training. That's the whole model.

---

## 4. Rate-of-gain adjustment protocol

Target: **0.25-0.5% bodyweight/week** (`weeklyRateRange: [0.0025, 0.005]`). For 80 kg that's
**200-400 g/week**, or **0.8-1.6 kg/month**.

### Reading the trend correctly

- Use a **3-4 week rolling average**, never a single weigh-in. Daily weight moves 1-2 kg on
  glycogen (each gram of stored glycogen binds ~3 g water), sodium, fibre, and gut content.
- Compare like with like: same time of day, ideally first thing, post-bathroom, pre-food.
- `get_body_metrics({weeks: 4})` returns the trend. Use the trend line, not the endpoints.

### Working from sparse or messy weigh-in data

Most athletes don't weigh daily, and the guardrail still has to function. The question is how
many readings are enough to distinguish a real 200-400 g/week signal from day-to-day noise of
1-2 kg — and the honest answer is that it depends heavily on how often they step on the scale.

| Weigh-in frequency | Minimum window before the trend means anything | Method |
|---|---|---|
| Daily | 2-3 weeks | 7-day rolling average, compare week 1 average to week 3 average |
| 3-4×/week | 3-4 weeks | Weekly average of whatever readings exist |
| 1-2×/week | 4-6 weeks | Fit the direction across all points; do not compare individual weeks |
| Less than weekly, or irregular | Not usable | Ask for a fortnight of consistent morning weigh-ins before changing anything |

**Rules that make sparse data usable:**

1. **Same conditions, or the reading is worthless.** First thing, after the bathroom, before
   food or fluid, minimal clothing. A weigh-in at 6pm after dinner isn't a weak data point; it's
   a different measurement.
2. **Drop obvious outliers, but say you did.** A single reading 1.5 kg above the neighbouring
   points, the morning after a restaurant meal or a long-haul flight, is a water event — exclude
   it and tell the athlete why rather than silently smoothing it away.
3. **Never act on fewer than 6 readings** spread over at least 3 weeks. Saying "there isn't
   enough data yet, keep going and we'll look again in a fortnight" is a real answer and a
   better one than a change made on noise.
4. **When the direction is clear but the rate isn't**, act on the direction only, and in the
   smallest increment — ±150 kcal, then re-check.
5. **Look at training data alongside.** If loads are progressing well, an ambiguous weight trend
   is much less urgent. The scale is one input, not the verdict.

**When the athlete won't weigh in at all.** Some won't, and pushing it can do more harm than the
missing data does. Use proxies: how clothing fits, training-load progression, photographs at
fixed intervals, and their own read on leanness. These are cruder — expect to need 6-8 weeks
rather than 3-4 to see anything — so make the surplus deliberately conservative (+200 rather
than +300) and hold it. A smaller surplus you can't measure beats a larger one you can't
correct. Never invent a trend from proxies and present it as a number.

Section 9 of `situations.md` lists the specific anomalies that produce a fake trend — water
events, creatine loading, the first fortnight of a surplus, illness, travel — and what each one
looks like.

### Adjustment table

| 3-4 week trend | Diagnosis | Action |
|---|---|---|
| < 0.25%/week | Undershooting | +150 kcal, added as **carbs** (~38 g). Best-tolerated, best for training |
| 0.25-0.5%/week | On target | Hold. Don't fix what works |
| > 0.5%/week | Overshooting | −150 kcal, taken from **fat** first (~17 g), then carbs |
| > 0.75%/week | Well over | −300 kcal, fat then carbs. Re-check in 2 weeks |
| Flat or losing | TDEE estimate wrong, or intake under-reported | Verify a week of complete logging first. If logging is honest, +300 kcal and re-check |

### Rules for adjusting

1. **One change at a time.** Wait 2-3 weeks before judging it — anything shorter is noise.
2. **Never cut protein** to make room. Protein is fixed; carbs and fat are the levers.
3. **Cross-check body composition.** Weight up + body-fat % flat is the ideal. Weight up +
   body-fat % climbing means trim the surplus even when the rate looks fine. Weight flat + lean
   mass up + fat down is a recomp — that's a good outcome, don't "fix" it by adding calories.
4. **Check training first when weight is flat.** If loads are progressing and weight is flat,
   they may be recomping. If loads are stalling *and* weight is flat, it's a fuelling problem —
   add calories and tell the S&C skill not to add volume.
5. **Expect the first 1-2 weeks to lie.** Starting a surplus adds glycogen and water — 1-1.5 kg
   of apparent gain that isn't tissue. Don't cut the surplus on the back of it.

---

## 5. Changing the goal, and changing the mode

Two different changes, often confused. `SKILL.md` Step 9 holds the decision procedure; this is
the arithmetic.

### Goal changes — the surplus moves, the model doesn't

| Goal | kcal delta | Weekly rate target | Protein | Carbs |
|---|---|---|---|---|
| Aggressive bulk | +600 | +0.5-0.75% | 2.0 g/kg | 5.5-6.5 g/kg training days |
| **Lean bulk (default)** | **+300** | **+0.25-0.5%** | **2.0 g/kg** | **5.5-6 g/kg training days** |
| Recomp | 0 | ~0, lean mass up | 2.0-2.2 g/kg | 4.5-5.5 g/kg |
| Cut | −400 | −0.5-0.75% | 2.2-2.4 g/kg | 3-4 g/kg, training days at the top |

Protein rises as calories fall, which is the opposite of most people's instinct. In a deficit it
does two jobs — protecting lean mass and providing satiety — and both matter more when there's
less of everything else (Helms et al. 2014).

**Worked transition, 80 kg athlete, lean bulk → cut:**

```
Lean bulk (training day)   3,504 kcal · 160 P · 440 C · 123 F
Cut target                 3,204 − 400 = 2,804 kcal
  protein     80 × 2.3 = 184 g                        =   736 kcal
  carbs       80 × 4.0 = 320 g                        = 1,280 kcal
  remaining                                           =   788 kcal
  fat         788 / 9  = 88 g       (floor 64 g — clear)

Cut (training day)         2,804 kcal · 184 P · 320 C · 88 F
```

Move it in two steps a week apart rather than in one jump, and expect the first fortnight's
weight change to be glycogen and water rather than tissue in either direction.

### Mode changes — the TDEE model itself changes

This is the January handover and it's a different kind of change. Strength mode and running mode
are two separate accounting systems, and the most common error is mixing them, which
double-counts the same activity.

| | Strength mode | Running mode |
|---|---|---|
| Activity factor | ~1.5 — absorbs NEAT *and* general activity | ~1.2 — base only |
| Session kcal line | Lifting sessions, ~5-8 kcal/min | Run kcal, added explicitly |
| Run kcal estimate | n/a | ~1 kcal per kg per km (so ~0.8-1.0 kcal/kg/km; 80 kg × 10 km ≈ 800 kcal) |
| Carbs | 4-6 g/kg | 5-8 g/kg, scaling with volume; higher again in a race build |
| Protein | 2.0 g/kg | 1.8-2.0 g/kg — does not drop |
| Typical goal | Lean bulk +300 | Recomp or a small surplus |

**Worked comparison, 80 kg athlete, BMR 1,856:**

```
Strength mode, lifting day
  TDEE = (1,856 × 1.5) + 420 = 3,204 kcal

Running mode, 12 km easy run + a lifting session
  TDEE = (1,856 × 1.2) + 960 + 420 = 3,607 kcal
        base 2,227      run   lift
```

The base factor drops by 0.3 (≈ 557 kcal) while the run adds 960 — so a run day in running mode
is genuinely bigger, but nothing like as much bigger as adding a run line to the strength-mode
factor would have suggested. That error is worth several hundred kcal a day and it always runs
in the direction of overfeeding.

**Transition rules.** Change mode once, at the point running becomes regular rather than
occasional — not on the first run back. During the walk-run weeks, run kcal are small enough to
ignore; stay in strength mode. Switch when weekly running exceeds roughly 20 km or 2.5 hours.
Recalculate, hold for 3 weeks, then judge it on the trend. `endurance-running-coach` owns
run-specific and in-run fuelling from that point.

---

## 6. Nutrient timing

Timing is a small effect on top of a large one. Total daily intake is the large one.

**Pre-workout (1-2 h before):**
- 0.5-1 g/kg carbs, 25-40 g protein
- Keep fat and fibre low — they slow gastric emptying and 60-75 min of heavy lifting under a
  full stomach is miserable
- Example at 80 kg: 80 g oats + a 30 g whey scoop + a banana

**Post-workout (within ~2 h):**
- 0.4 g/kg protein (~32 g at 80 kg) plus carbs
- The anabolic window is far wider than commonly claimed — Schoenfeld et al. (2013) found the
  post-workout timing effect largely disappears once total protein intake is matched. Treat
  post-session as a convenient slot for a large protein feed, not an emergency

**Across the day:**
- 4-5 protein feeds of ~0.4 g/kg
- Pre-sleep 30-40 g casein or Greek yoghurt: modest but real overnight MPS benefit
  (Res et al. 2012), and it's an easy place to bank protein

**Rest days:** protein unchanged, carbs at the bottom of the band, fat fills the remainder.
Recovery and repair happen on rest days — protein is *more* important then, not less.

**Deload weeks:** `get_block_status().phase === 'deload'` → trim ~150-200 kcal from carbs.
Training volume is roughly halved so the demand genuinely drops. Hold the surplus otherwise;
a deload is not a mini-cut.

---

## 7. Supplements — the short list

Only what has evidence worth the money:

| Supplement | Dose | Why |
|---|---|---|
| **Creatine monohydrate** | 3-5 g/day, any time, no loading needed | The most well-supported ergogenic in existence. Strength, lean mass, training volume. Expect ~1 kg of water weight in the first weeks — account for it in the rate-of-gain read |
| **Whey / casein protein** | as needed | A convenience food, not a supplement. Useful when the protein target is hard to hit with whole food |
| **Caffeine** | 3-6 mg/kg pre-session | Performance and perceived exertion. Skip if it's wrecking sleep — sleep matters more |
| **Vitamin D** | 1,000-2,000 IU/day in winter | UK/Ireland winter latitude. Deficiency is common and affects muscle function |

Everything else is optional. Get the diet, sleep, and training right first.

---

## 8. Hydration

- ~35 ml/kg/day baseline, plus ~500-750 ml per training hour.
- At 80 kg that's ~2.8 L baseline, ~3.5 L on lifting days.
- Higher carb intake increases water demand — glycogen storage binds water.
- Pale-straw urine is the practical marker. Weighing in dehydrated is the most common cause of
  a confusing weight trend.

---

## 9. References

- Jäger et al. (2017), *ISSN Position Stand: Protein and Exercise*, JISSN — 1.4-2.0 g/kg for muscle gain.
- Morton et al. (2018), *Br J Sports Med* — protein dose-response meta-analysis; plateau ~1.6 g/kg, CI to 2.2.
- Schoenfeld & Aragon (2018), *JISSN* — per-meal protein dose and distribution.
- Schoenfeld et al. (2013), *JISSN* — post-exercise protein timing meta-analysis.
- Res et al. (2012), *Med Sci Sports Exerc* — pre-sleep protein and overnight MPS.
- Mifflin et al. (1990), *Am J Clin Nutr* — resting energy expenditure equation.
- Katch & McArdle — lean-mass-based BMR.
- Kreider et al. (2017), *ISSN Position Stand: Creatine*.
- Mountjoy et al. (2018), *IOC Consensus Statement on RED-S* — relevant if energy availability is ever in question despite a nominal surplus.
- Garthe et al. (2013), *Int J Sport Nutr Exerc Metab* — rate of weight gain and body composition outcomes in elite athletes; supports the conservative surplus. (Garthe et al. 2011 is the companion study on rates of weight *loss*.)
