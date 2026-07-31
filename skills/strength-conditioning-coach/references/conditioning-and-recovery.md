# Conditioning & Recovery

Aerobic maintenance inside the lifting block, and the recovery rules that decide whether a
session happens at all. `SKILL.md` Steps 6 and 7 hold the decision procedure; this file holds
the protocols and the reasoning.

**Contents**

1. Why aerobic maintenance is non-optional
2. The maintenance protocol
3. Modality selection and the interference effect
4. Scaling up toward January
5. Sleep — the largest recovery lever
6. Readiness monitoring, and what HRV is and isn't good for
7. Soreness, and what it does and doesn't mean
8. Illness rules and the return-to-training ladder
9. Travel
10. Recovery modalities worth the time, and ones that aren't
11. Evidence notes

---

## 1. Why aerobic maintenance is non-optional

The athlete stops running for five months and starts again in January. The temptation is to
treat the block as pure lifting and deal with running when it comes. The arithmetic argues
otherwise.

VO₂max declines measurably within 2-4 weeks of stopping endurance training and continues falling
over the following months; plasma volume drops fastest, then stroke volume, then mitochondrial
and capillary adaptations, which are the slowest to lose and also the slowest to rebuild
(Mujika & Padilla 2000). Losing them means January's return-to-run has to spend 6-10 weeks
rebuilding a base that 40-60 minutes a week would have held.

Against that, the cost of maintenance is small. Low-intensity, non-impact aerobic work at
2 × 25 min/week is roughly 1.5-2% of weekly training time and — done at the right intensity, in
the right place in the week — has no measurable effect on hypertrophy.

The second argument is tissue-specific and matters more here. Running loads the proximal
hamstring in a lengthened position at speed. Twenty-two weeks of never doing anything remotely
like that, followed by a return to running, is a load spike into exactly the tissue the whole
block has been protecting. Low-impact aerobic work doesn't fully solve that — the staged
hamstring progression in `injury-guardrails.md` does — but rucking and incline walking keep
the calves, Achilles, and posterior chain used to sustained low-grade loading, which is a
meaningful head start.

---

## 2. The maintenance protocol

**Dose: 2 sessions/week, 20-30 min, easy.** Hold this from block week 1 to week 15; weeks 16
onward ramp as the table below shows.

| Block phase | Sessions/week | Duration | Intensity |
|---|---|---|---|
| Weeks 1-5 (foundation) | 2 | 20-25 min | Easy, conversational |
| Weeks 6-15 (accumulation A/B) | 2 | 25-30 min | Easy, conversational |
| Weeks 16-20 (accumulation C) | 2-3 | 30 min | Easy, plus optionally one 4 × 3 min at moderate |
| Weeks 21-22 (transition) | 3-4 | 30-40 min | Handed to `endurance-running-coach` |
| Deload weeks | 2 | 20 min | Unchanged — conditioning doesn't deload |

Conditioning does not deload alongside lifting. The deload exists to dissipate lifting fatigue,
and 20 minutes of easy cycling doesn't add to that pool. Removing it just costs base for nothing.

**Intensity definition.** Conversational — able to speak in full sentences. Roughly 60-70% of
maximum heart rate, or RPE 3-4 out of 10. If a heart-rate figure is wanted and no lab test
exists, use `HRmax ≈ 208 − 0.7 × age` (Tanaka et al. 2001) rather than `220 − age`, which
systematically underestimates in adults over 30.

**Where it goes in the week.**

| Slot | Verdict |
|---|---|
| After an upper-body lifting session | Best. Legs are fresh for the next lower day, and the aerobic work is already-fatigued-tissue-agnostic |
| Non-lifting day (Wed / weekend) | Also good. Doubles as active recovery |
| After a lower-body session | Acceptable but not preferred — adds to leg fatigue before the next lower day |
| Before any lifting session | No. Pre-fatiguing a strength session is the one placement that clearly costs something |
| Same morning as an evening lower session | Avoid where possible; 6+ hours of separation is the working guideline |

---

## 3. Modality selection and the interference effect

The "interference effect" — concurrent endurance training blunting strength and hypertrophy
adaptation — is real, but the size of it depends almost entirely on the details. The
meta-analytic picture (Wilson et al. 2012) is that interference scales with **modality, duration,
frequency, and intensity**, and that running interferes substantially more than cycling. The
proposed mechanism for the modality difference is eccentric muscle damage: running involves
repeated eccentric loading of the same muscles the lifting is trying to grow, and that damage
competes directly for recovery. Cycling is almost purely concentric.

So the selection rule is simple: **minimise eccentric load and impact, cap the duration, keep
the intensity low.**

| Modality | Eccentric load | Impact | Verdict |
|---|---|---|---|
| Stationary bike / assault bike | None | None | Default choice |
| Sled push / drag | None (concentric-only) | None | Best fit — also counts as quad/glute work. Backward drags are notably knee-friendly |
| Incline treadmill walk | Low | Low | Good. Loads calves and glutes in a running-adjacent way without the eccentric cost |
| Rucking (weighted pack walk) | Low | Low | Same as above, with more posterior-chain load. Start at 10% bodyweight |
| Rower / ski erg | Low | None | Fine, but the rowing catch is a loaded hip-flexed position — keep the catch shallow while the hamstring flag is active |
| Elliptical / cross-trainer | Low | None | Fine, unexciting |
| Stair machine | Moderate | Low | Heavier on the knees than it looks; not while the knee flag is active |
| Easy running | High | High | The one to avoid this block, and the point of the whole arrangement |
| HIIT / intervals / circuits | High | Varies | No. High interference, high fatigue cost, no maintenance benefit that easy work doesn't provide |

**Sled work is the standout** because it does two jobs at once: concentric-only conditioning and
genuine lower-body loading with no soreness cost. Sled push 6-10 × 20 m with 60-90s rest, or
continuous backward drags for 15-20 min, both fit the maintenance slot and both sit at
`Ham-len: low` in the exercise library.

---

## 4. Scaling up toward January

The last stretch of the block hands over. This is the sequencing:

**Weeks 16-20.** Add an optional third conditioning session and introduce a small amount of
moderate work — 4 × 3 min at a comfortably hard effort with 2 min easy between — on the bike or
incline treadmill. The purpose is to reintroduce a higher cardiac output stimulus before running
does it, not to build fitness.

**Weeks 21-22 (transition).** Lifting volume drops ~40% with loads held.
`endurance-running-coach` owns the run reintroduction from here. Conditioning volume rises to
fill the recovery the lifting released.

**After the block.** Two lifting sessions per week indefinitely, at roughly one-third of
accumulation volume, is enough to hold the block's gains through a running build. Details in
`program-design.md` §7.

**Ordering rule for the overlap period.** When lifting and running land on the same day, run
first if the run is the priority session and lift first if the lift is — whichever comes second
is the one that gets compromised, so the decision is about which adaptation matters more that
day, not about a universal rule. During the transition, running is the priority.

---

## 5. Sleep — the largest recovery lever

Nothing else in this file competes with it. Sleep restriction impairs muscle protein synthesis,
raises cortisol, reduces testosterone, degrades RIR judgement and technique, and increases injury
risk. In athletes, chronic sleep under ~8 h/night is associated with substantially higher injury
rates (Milewski et al. 2014, in adolescents; the adult picture is directionally the same). One
well-cited trial found that under sleep restriction, dieters lost ~55% less fat and ~60% more
lean mass for the same weight change (Nedeltcheva et al. 2010) — the direction of effect that
matters even though this block is a surplus rather than a deficit.

**The practical targets, in priority order:**

1. **7.5-9 h in bed**, consistently. Consistency of timing matters nearly as much as duration.
2. **A fixed wake time**, including weekends. Wake time anchors the circadian rhythm; bedtime
   drifts and that's tolerable.
3. **No caffeine within 8-10 h of bed.** Caffeine's half-life is ~5-6 hours, so an afternoon
   pre-workout is a real cost. If a pre-session stimulant is wanted for an evening session, that
   is a direct trade against sleep — name the trade rather than prescribing both.
4. **Naps count**, at roughly 60% of the value of equivalent night sleep. A 20-30 min nap costs
   nothing; a 90 min one is a full cycle and also fine. The 45-75 min window is the one that
   produces grogginess.

**When sleep is genuinely broken and can't be fixed** — a new baby, shift work, a stressful
stretch at work — do not simply program on and hope. Cut the top of the volume band by ~20%,
hold the loads, and keep the frequency. Frequency preserves the skill and the habit; volume is
what the impaired recovery can't pay for.

---

## 6. Readiness monitoring, and what HRV is and isn't good for

The four-signal readiness table in `SKILL.md` Step 6 is deliberately subjective. That's not a
compromise — subjective wellness measures track training load and predict performance at least
as well as most objective ones (Saw et al. 2016), and they cost nothing.

**If the athlete tracks HRV,** here is how to use it without being led astray:

- **Use the rolling 7-day average against the 30-day baseline**, never a single morning reading.
  Day-to-day HRV is enormously noisy — alcohol, a late meal, a warm room, and measurement
  position all move it more than training does.
- **A 7-day average below the 30-day baseline's normal range** is a real signal: reduce volume,
  don't add. A single low morning is not.
- **HRV rising after a hard block is normal and good.** HRV falling while performance is rising
  is also common in trained athletes and doesn't require action on its own.
- **HRV does not tell you what to do about a problem.** It flags accumulated stress without
  distinguishing training stress from work stress, illness, or a bad night. Pair it with the
  subjective signals; when they disagree, believe the subjective ones.

**Resting heart rate** is cruder and more useful than it gets credit for: +5 bpm or more above
the usual morning value, sustained over 2-3 days, is a good early illness or overreaching flag.

**What not to do:** don't build a composite readiness score and prescribe from it. Every attempt
to reduce readiness to one number ends up either over-reactive (cancelling good sessions) or
inert (a number nobody acts on). Score the four signals, apply Step 6's table, move on.

---

## 7. Soreness, and what it doesn't mean

Delayed-onset muscle soreness is a poor proxy for training quality. It tracks novelty and
eccentric load far more than it tracks stimulus — a new exercise produces soreness whether or not
it produced growth, and a well-adapted movement stops producing soreness while still driving
adaptation. Do not use it to judge a session, and gently push back when the athlete does.

Where it *is* useful:

- **As a readiness input**, per Step 6. Soreness that limits range or changes gait means modify.
- **As a novelty flag.** Unusual soreness after an exercise swap says the swap was a bigger
  change than intended — don't add load on top of it for a session.
- **As a volume flag.** Soreness that hasn't cleared by the next scheduled session for the same
  muscle, repeatedly, means weekly volume is above what recovery supports at current sleep and
  fuelling. That's the case for holding volume, not adding.

Soreness in a flag-site structure (the proximal hamstring, the patellar tendon) is a different
thing entirely and follows the guardrail's pain rules, not this section.

---

## 8. Illness rules and the return-to-training ladder

**The above/below the neck heuristic.** It's crude but it holds up well enough to program from:

| Symptoms | Action |
|---|---|
| Runny nose, sneezing, mild sore throat, no fever | Train. Reduce volume ~30%, hold loads, drop conditioning. Reassess daily |
| Fever, body aches, chills | No training, no conditioning. Rest until 24 h fever-free |
| Chest congestion, productive cough, breathlessness | No training. Myocarditis risk with training through a systemic viral illness is small but not zero, and the downside is catastrophic |
| GI illness, vomiting, diarrhoea | No training. Hydration and electrolytes first; hand fuelling to `sports-nutritionist` |
| Unexplained resting HR +10 bpm, sore throat, heavy fatigue | Treat as illness onset. Take the day |

**The return-to-training ladder.** After anything with a fever or systemic symptoms, don't
resume at the prescribed volume — the single most common way a 3-day illness becomes a 2-week
setback.

| Session | Volume | Intensity | Gate to advance |
|---|---|---|---|
| 1 | ~50% of prescribed sets | RIR 4-5 | Felt normal, no symptom return next morning |
| 2 | ~70% | RIR 3 | Same |
| 3 | ~85% | RIR 2-3 | Same |
| 4 | Full prescription | Normal | — |

If symptoms return at any rung, drop back one rung and add a rest day. Conditioning restarts at
session 2 of the ladder, at half duration.

**Where to resume in the block.** Illness of under a week doesn't change the mesocycle — resume
where it left off after the ladder. Over a week, drop back one mesocycle week of volume
progression, as with any missed week.

---

## 9. Travel

Travel breaks weeks more often than illness does, and it's more predictable, so it's worth
planning rather than reacting to.

**Before the trip.** Ask how many days, what equipment, and how many sessions are realistic. If
the trip is 4+ days, front-load the priority work: move the lower posterior day to before
departure so the block's priority muscles get their best session in a real gym.

**During.** Two full-body sessions beat four fragments. Build them around whatever equipment
exists, preserving pattern and chain per `program-design.md` §8. Keep the mobility block —
travel is when hips and ankles get worse, and it takes six minutes in a hotel room.

**Long-haul and time zones.** Expect the first 24-48 h to be poor and don't program a heavy
session into it. Anchor to local wake time immediately, get morning daylight, and accept the
first session back is a technique session, not a progression session.

**Returning.** No make-up sessions and no doubling. Resume the rotation per `SKILL.md` Step 9.

---

## 10. Recovery modalities — worth the time, and not

| Modality | Verdict |
|---|---|
| **Sleep** | The only one that matters at scale. Everything below is rounding error by comparison |
| **Adequate food, especially protein and total calories** | Second. See `sports-nutritionist` |
| **Easy movement / walking** | Genuinely useful. 8-10k steps a day, and it costs no recovery |
| **Massage / soft tissue work** | Modest effect on perceived soreness, none on performance recovery. Fine if enjoyed; don't count on it |
| **Foam rolling** | Short-lived range increase, small soreness reduction. Useful in the mobility block as a warm-up, not as recovery |
| **Cold water immersion** | Reduces soreness, and **blunts hypertrophy adaptation** when used routinely after resistance training (Roberts et al. 2015). Avoid it in this block. If it's used for a genuine reason, keep it at least 4 h from the session |
| **Sauna / heat** | Neutral-to-mildly-positive for cardiovascular adaptation. No hypertrophy downside. Fine |
| **Compression garments** | Small perceived-soreness benefit. Harmless |
| **Stretching for recovery** | Doesn't do what it's believed to do. Program mobility for range, not for recovery |
| **Deload weeks** | See `program-design.md` §1. Structural, and the one recovery intervention with real leverage |

The cold-water one is worth stating plainly to the athlete, because it's counterintuitive and
widely done: routine post-lifting ice baths measurably reduce long-term muscle growth. In a
block whose entire purpose is hypertrophy, that's a direct trade against the goal.

---

## 11. Evidence notes

- **Mujika & Padilla (2000)**, *Sports Med* — detraining time course; VO₂max and plasma volume
  losses within 2-4 weeks, slower loss of mitochondrial and capillary adaptations.
- **Wilson et al. (2012)**, *J Strength Cond Res* — concurrent training meta-analysis;
  interference scales with modality (running > cycling), duration, frequency, and intensity.
- **Tanaka et al. (2001)**, *J Am Coll Cardiol* — `HRmax = 208 − 0.7 × age`, more accurate than
  `220 − age` in adults.
- **Milewski et al. (2014)**, *J Pediatr Orthop* — sleep duration and injury rate in athletes.
- **Nedeltcheva et al. (2010)**, *Ann Intern Med* — sleep restriction shifts weight loss toward
  lean mass and away from fat.
- **Saw, Main & Gastin (2016)**, *Br J Sports Med* — subjective wellness measures track training
  load at least as responsively as objective measures.
- **Roberts et al. (2015)**, *J Physiol* — regular post-exercise cold water immersion attenuates
  long-term gains in muscle mass and strength.
- **Plews et al. (2013)**, *Sports Med* — HRV in athletes; the case for rolling averages over
  single-day readings.
