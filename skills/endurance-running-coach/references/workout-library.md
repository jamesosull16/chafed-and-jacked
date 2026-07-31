# Workout Library

Roads, trails, a treadmill, and a track when one is wanted. Outdoor running is the default and
the treadmill is a substitute rather than a mode of training.

This is the session catalogue — the running equivalent of `exercise-library.md` in
`strength-conditioning-coach`. Consult it when picking a session, when substituting one that
isn't possible today, and when deciding whether a session type is allowed yet.

What this file does **not** own, and must not contradict:

| Question | Owned by |
|---|---|
| How the weeks are sequenced, and what happens in weeks 1-12 | `return-to-run.md` |
| Zone definitions and how to anchor them without a lab | `aerobic-development.md` §2 |
| Whether a symptom stops a session; hamstring and Achilles rules | `running-injury-guardrails.md` |
| The lifting programme running alongside this build | `strength-conditioning-coach` |
| Anything about food, carbohydrate, or gut training | `sports-nutritionist` |

Where a return week here disagrees with `return-to-run.md`, that file wins.

## How to read the columns

- **Zone** — primary intensity zone on the 5-zone scale, with the 3-zone equivalent below. A
  session is filed by the zone it *trains*, not the zone the warm-up touches.
- **Ham-risk** — proximal hamstring lengthened-load-at-speed risk: **low** / **mod** /
  **high**. The governing flag for this athlete. Mechanism: the hamstring reaches peak
  musculotendon length and peak force in terminal swing — the moment before footstrike, hip
  flexed, knee extending — and *both* scale with running speed. Fast flat running, downhill
  running, and long strides put the proximal tendon under high force at long length, which is
  the injury mechanism itself. Easy flat running and uphill running keep length low: gradient
  shortens the stride, brings footstrike closer under the centre of mass, and caps velocity, so
  force stays high while length stays short. That decoupling is why hills come before speed
  here. The full ranked list of provoking stimuli is in `running-injury-guardrails.md` §2; this
  column is that ranking applied session by session.
- **Impact** — mechanical and bone loading per unit time: **low** / **mod** / **high**. Track
  it separately. A long easy run is low ham-risk and high cumulative impact, and bone stress
  injuries do not care about the hamstring flag.
- **Return wk** — the earliest week of the return-to-run build at which the session type is
  appropriate. `return-to-run.md` runs a 12-week build: weeks 1-4 walk/run, weeks 5-8
  continuous running (down week and gate at 8), weeks 9-10 long run and strides, weeks 11-12
  first threshold and the volume peak. Weeks 13+ are the post-build phase, where uphill work,
  downhill work, and finally speed enter. **A week number is a gate, not a schedule** — the
  hamstring criteria in `running-injury-guardrails.md` §2 must also be met, and where the
  hamstring gate and the build gate differ, the later one is the binding one.

Early in the build, default to **Ham-risk low** and **Impact ≤ mod**. Ham-risk **high** never
enters on a fatigued day, and never in the same week it is first cleared.

### Intensity zones

Reproduced from `aerobic-development.md` §2 for convenience. If they ever differ, that file
wins.

| Zone | Name | % HRmax | % LTHR | RPE | Talk test | 3-zone |
|---|---|---|---|---|---|---|
| Z1 | Recovery | 60-72% | <82% | 1-2 | Full conversation, nasal breathing possible | Zone 1 |
| Z2 | Aerobic / easy | 72-82% | 82-89% | 3-4 | Full sentences, slightly interrupted | Zone 1 |
| Z3 | Steady / marathon | 82-88% | 90-94% | 5-6 | Short sentences only | Zone 2 |
| Z4 | Threshold | 88-93% | 95-102% | 7-8 | A short phrase, then breath | Zone 2 (upper) |
| Z5 | VO₂max | 93-100% | >102% (HR lags) | 9-10 | Single words or none | Zone 3 |
| — | Neuromuscular | n/a | n/a | 10 | None | — |

Neuromuscular work is not a heart-rate zone; it is prescribed by effort and duration only,
because the rep ends before heart rate has responded. For the first three weeks back, pace and
RPE anchor every session and heart rate controls nothing.

---

## 1. Easy and recovery running

Easy running is 75-85% of the week's volume and produces most of the adaptation that matters:
mitochondrial density, capillarisation, stroke volume, fat oxidation, and — the part that
governs this build — tendon and bone tolerance, built at a cost that can be repeated tomorrow.
Through week 10 it is very nearly the entire catalogue.

It is also the most commonly ruined session in the sport. The failure mode is drift into Z3:
the run feels productive, heart rate sits 10-15 bpm above easy, and the session collects most
of the fatigue of a threshold run for a fraction of the adaptation. That degrades two sessions
— today stops being recovery, and the next quality day is run tired at the wrong pace. For an
athlete returning from five months of lifting the drift is nearly guaranteed, because aerobic
fitness is the limiter and *effort* feels honest at a pace that is objectively moderate.

**The anchor is the talk test, not the watch.** If a full sentence can't be spoken comfortably,
it is not an easy run. The talk test corresponds well to the ventilatory thresholds (Foster and
colleagues) and it self-corrects for heat, sleep, and the fact that early-build easy pace is
embarrassing.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Walk/run | Z1-2 | low | low | 1 | e.g. 6 × (2 min run / 2 min walk) | Weeks 1-6. Structure owned by `return-to-run.md` §3 |
| Recovery run | Z1 | low | low | 7 | 20-40 min, flat, softest surface available | Slower than easy. If it feels slow it is correct |
| Easy run | Z2 | low | mod | 7 | 25-75 min, conversational throughout | The default session, and most of the week |
| Easy run + strides | Z2 | mod | mod | 9 (uphill) / 12 (flat) | Easy run, 4-6 × 8-10 s uphill strides; flat 15-20 s from wk 12 | Strides gated separately — see §5 |
| Double-easy day | Z2 | low | mod | 13 | 2 × 25-40 min, ≥6 h apart | Adds volume at lower per-session tissue load. After frequency has maxed |
| Off-road easy run | Z2 | low | mod | 14 | 40-70 min on trail or grass | Lower impact, higher ankle demand. The `ankleMobility` flag gates it, not the hamstring |

**Rules.**

- Cap easy-run heart rate rather than pace, and expect cardiac drift on warm days — it is not a
  reason to grind.
- Walking inside an easy run is legitimate, not a failure, particularly on hills.
- Hills raise effort at any pace. On rolling terrain judge by breathing on the climbs.
- Easy running is **low** ham-risk only while the stride stays short. A fatigued shuffle in the
  last 20 minutes of a long run is not the same tissue exposure as fresh easy running.
- Prescribe minutes, not kilometres. Pace returns long before tissue tolerance does, and a
  minutes-based plan can't be inflated by fitness arriving.

---

## 2. Long runs

The long run trains what no other session does: sustained substrate depletion, slow-twitch
recruitment deep into fatigue, plasma volume expansion, and mechanical tolerance to repetitive
loading for a duration approaching the race. **Duration, not distance**, and for a returning
runner time on feet is the variable to progress.

**Duration by goal race** — as a single long run, and as a share of weekly volume.

| Goal race | Long-run duration | Share of week | Notes |
|---|---|---|---|
| 5 km / 10 km | 70-90 min | 20-25% | Aerobic support. Keep it easy; specificity lives elsewhere |
| Half marathon | 90-110 min | 25-30% | Steady segments from mid-build |
| Marathon | 2:00-2:45 | 25-30% | Cap at 2:45-3:00 regardless of pace; past that the cost outruns the return |
| Trail / ultra | 2:30-4:00+ | 30-35% | Prescribe by time and vertical metres. Back-to-backs replace one very long day |

In the return build the long run starts at 40 minutes in week 9 and reaches 70 by week 12. It
earns structure only after that: no steady, progression, or marathon-pace content inside the
12-week build, and none in the same week a new intensity is introduced.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Standard long run | Z2 | low | high | 9 | 40-150 min entirely easy | The default. No pace target, no finishing fast |
| Long run w/ steady segments | Z2/3 | mod | high | 14 | 3 × 10 min steady inside an easy long run, 5 min easy float | The gentlest way to add quality to a long run |
| Progression long run | Z2→3 | mod | high | 15 | Last 20-30% at steady, final 5-10 min approaching threshold | Teaches pacing discipline on fatigued legs |
| Hilly long run | Z2 | low up / **high** down | high | 14 | 60-120 min rolling, easy up, controlled down | Uphill is free; the descent is the loaded part. See §6 |
| Long run w/ MP blocks | Z3 | mod-**high** | high | 17 | 2-3 × 20-30 min at marathon effort, 5-10 min easy between | The key marathon session, and the highest ham-risk long-run variant |
| Back-to-back long runs | Z2 | mod | high | 18 | Sat 90-120 min, Sun 60-90 min, both easy | Trail/ultra only. Lower single-session risk than one very long day |

**Progression rule.** Grow the long run fortnightly, not weekly, and by 10-15 minutes at a
time. If anything niggles, the long run is the first session trimmed — it carries a
disproportionate share of the week's load, not the easy runs.

**Fuelling.** Anything over ~75 minutes gets carbohydrate during the run; anything over ~2
hours gets a plan. Rehearse race fuelling in long runs that carry race-pace content, because
gut tolerance is intensity-dependent. Targets, products, and gut training belong to
`sports-nutritionist` — hand it the session's duration and intensity and defer.

**Ham-risk note.** Risk climbs in the final 20 minutes as pelvic control fades and stride
lengthens, and it climbs sharply when fast content sits at the *end*. Put marathon-pace blocks
in the middle of a long run for the first two or three uses.

---

## 3. Threshold work

**What "tempo" actually means.** The word gets used for anything that feels hard, which is why
tempo sessions are so often run at 10 km effort — a session with threshold's name, VO₂max's
cost, and neither's benefit. Lactate threshold (the second threshold, LT2 / MLSS) is the
highest intensity at which lactate production and clearance stay in balance: roughly the pace a
trained runner holds for 50-70 minutes, ~2.5-4.5 mmol/L, 88-93% of HRmax.

Three anchors, used together:

1. **Comfortably hard.** Sustainable, unpleasant, and clearly not a race.
2. **~1-hour race effort.** For most runners that sits between 15 km and half-marathon pace.
3. **The short-sentence test.** A short phrase — five to eight words — comes out, then a
   breath. If two sentences run together it is steady state; if only two words come out it is
   VO₂max.

Threshold is the highest-return, lowest-risk quality work available to this athlete. It raises
the pace at which lactate accumulates without requiring the stride lengths that provoke the
proximal tendon, and it recovers fast enough to coexist with two lifting sessions. That is why
it enters at week 11, ahead of hills and long before speed, despite being the harder-feeling
session — risk order and difficulty order are not the same thing.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Steady state | Z3 | low | mod | 11 | 10-30 min continuous at marathon effort | The bridge from easy to threshold. Start here, not at a tempo |
| Threshold by time | Z4 | mod | mod | 11 | 2 × 5 min, building to 4 × 8 min, 2 min easy jog between | How the build introduces it. Time-based survives hills and unknown fitness |
| Cruise intervals | Z4 | mod | mod | 13 | 5-8 × 1 km at threshold, 60-90 s float | The workhorse. More total volume at threshold than a continuous run, at lower cost |
| Continuous tempo | Z4 | mod | mod | 14 | 20-40 min continuous at threshold | Mentally the hardest version. Cap at ~40 min |
| Progression run | Z2→4 | mod | mod | 14 | 40-60 min, easy → steady → threshold in thirds | Self-limiting. Excellent when fitness is unknown |
| Threshold ladder | Z4 | mod | mod | 16 | 3-6-9-6-3 min, roughly equal float | Keeps a long threshold session honest by breaking it up |
| Threshold + steady | Z3/4 | mod | mod | 17 | 20 min steady, 4 × 5 min threshold, 10 min steady | Half-marathon and marathon specific |
| Uphill tempo | Z4 | **low** | mod | 13 | 8-15 min continuous at 3-6% grade | Threshold dose at reduced impact and reduced hamstring length |

**Prescription rules.**

- Time at threshold per session: 20-40 min once established. Below 20 there isn't a dose; above
  40 the session stops being repeatable inside the week.
- Threshold caps at ~10% of weekly volume while the hamstring flag is active. Two threshold
  sessions per week only in a peak block, never alongside a VO₂max session and a fast long run.
- **Float, don't stand.** Recovery is easy jogging. It keeps the session aerobically continuous
  and keeps the hamstring warm rather than cooling and being reloaded — a small point that
  matters with this flag.
- The last rep should match the first. A session that falls apart in the last two reps was run
  at 10 km effort; correct it downward next time rather than celebrating it.
- New intensity enters on a reduced-volume week. Never add volume and intensity together.

---

## 4. VO₂max and interval work

**Why 3-5 minutes.** Oxygen uptake takes roughly 90-120 seconds to reach maximum at hard
running paces, so a two-minute interval spends most of itself getting there. Work intervals of
3-5 minutes at approximately vVO₂max — the pace sustainable for about 6-8 minutes all-out —
accumulate the most time *at or near* VO₂max per unit of total fatigue (Billat 2001). Shorter
reps work only when recoveries are short enough that uptake never returns to baseline; that is
the logic of 30/30s, not a shortcut around it.

**Recovery ratios.** 1:0.5 to 1:1 of work time, jogged. Longer recoveries remove the cumulative
oxygen demand; much shorter turns the session into a badly executed threshold run. Total work
volume 12-24 minutes when established — 3 × 3 min is a complete first session.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Uphill VO₂max reps | Z5 | **low** | mod | 14 | 5-6 × 3 min at 4-6% grade, jog/walk down | The low-ham-risk route into Z5. Use this before any flat interval |
| 30/30s | Z5 | mod | mod | 16 | 12-20 × 30 s hard / 30 s jog | Accumulates time near VO₂max at a lower mechanical dose. Good reintroduction |
| 5 × 3 min | Z5 | mod | high | 16 | 3 min at 3-5 km effort, 2-3 min jog | The default flat VO₂max session. Time-based, works anywhere |
| 4 × 4 min | Z5 | mod | high | 17 | 4 min hard, 3 min jog | More time at VO₂max per rep, higher cost |
| 6 × 800 m | Z5 | mod | high | 17 | 800 m at ~3 km effort, 400 m jog | Track version. Pace discipline is easier, ego risk is higher |
| 6 × 1000 m | Z5 | mod | high | 18 | 1000 m at 5 km effort, 2-3 min jog | Slightly longer and slower; well tolerated |
| Descending ladder | Z5 | mod | high | 19 | 1200-1000-800-600, equal jog recovery | Late sharpening. Reps get faster as they shorten |

**These are the least urgent sessions in this build.** VO₂max responds inside 4-6 weeks and
detrains just as fast. Aerobic base, tendon tolerance, and bone remodelling take months and
cannot be hurried. So for an athlete rebuilding after five months away, VO₂max work is added
last and cut first, and there is no cost to delaying it until the base is genuinely there.

Ham-risk is **mod** rather than high because 3-5 km effort elevates stride length without
approaching sprint mechanics — but these are the most fatiguing sessions in the catalogue, and
fatigue is itself a hamstring risk factor. Track work carries a separate week-16 gate: repeated
tight left-hand bends load the limbs asymmetrically and bend running raises hamstring demand.
Run early intervals on straights, road, or grass.

---

## 5. Speed, strides, and neuromuscular work

**This is the highest-risk category for a proximal hamstring, without close competition.** Say
so plainly rather than sliding strides in as a warm-up detail.

The mechanism is specific. In terminal swing the hip is flexed, the knee is extending, and the
hamstring is at its greatest length while generating near-peak force to decelerate the shank.
Peak length and peak force both rise with running speed (Chumanov et al. 2011), which is why
hamstring injuries occur during sprinting and essentially never during jogging. Proximal,
"high" hamstring injuries are typically the *stretching-type* presentation, which Askling and
colleagues showed resolves considerably more slowly than sprint-type biceps femoris injuries —
so the cost of getting this wrong is measured in months.

**Uphill sprinting is the way in.** On a 6-8% grade the foot lands closer under the centre of
mass, stride length shortens, terminal-swing hip flexion and knee extension are reduced, and
maximal velocity is capped by the gradient itself. Force output and neural drive stay high;
peak hamstring length does not. Flat sprinting reintroduces both at once. Downhill sprinting is
the worst possible first exposure and is sequenced dead last.

### Reintroduction order — follow it in sequence, do not skip

| # | Step | Earliest wk | Dose | Gate to the next step |
|---|---|---|---|---|
| 1 | Easy running only; eccentric hamstring loading continues in the gym | 1 | — | No symptoms at all for 2 weeks |
| 2 | **Uphill strides**, relaxed, 6-8% grade, walk the descent | 9 | 4-6 × 8-10 s, weekly | ≤3/10 during, clear next morning, 3 sessions |
| 3 | **Flat strides** on grass, controlled and sub-maximal | 10 | 4-6 × 15-20 s, full walk recovery | Clear for 2 weeks, no pain on sitting |
| 4 | **Short hill sprints**, near-max, 8-12% grade | 14 | 4-6 × 8-10 s, 2-3 min walk down | 2 clean sessions; Achilles quiet in the mornings |
| 5 | **Longer flat strides**, ~90-95% of max | 16 | 6-8 × 20-30 s, full recovery | 3 symptom-free weeks; full-range eccentric loading cleared |
| 6 | **Flying 30s / true maximal velocity** | 18 | 3-5 × 30 m fly, full recovery | Only if the goal race demands it |
| 7 | **Downhill striding** | 18 | See §6 | Last of all |

The hamstring gate in `running-injury-guardrails.md` §2 opens uphill strides at week 5 and flat
strides at week 8; the build gate is later because strides aren't scheduled until week 9. Both
must hold, so the later number is the one tabled.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Uphill strides | — | **low** | mod | 9 | 4-6 × 8-10 s at 6-8%, walk down | The safe entry to fast running. Relaxed, not maximal |
| Strides (flat) | — | **mod** | mod | 10 | 4-6 × 15-20 s, 5 km-to-mile effort, walk back | Not a sprint. Build over 5 s, hold, decelerate gradually |
| Accelerations / build-ups | — | mod | mod | 13 | 4 × 100 m, easy → fast → easy | Gradual on-ramp, no standing start |
| Hill sprints | — | **low-mod** | mod | 14 | 4-6 × 8-10 s near-max at 8-12%, 2-3 min | High force, short length. Also the best calf/Achilles stimulus available |
| Long strides | — | **high** | mod | 16 | 6-8 × 20-30 s at 90-95% | The first session that meaningfully approaches the injury mechanism |
| Flying 30s | — | **high** | high | 18 | 30 m run-in, 30 m maximal, walk back | Maximal velocity. Only after every gate above is met |
| Downhill strides | — | **high** | high | 18 | See §6 | Highest combined hamstring and quadriceps load in the catalogue |

**Rules.**

- Never introduce a new speed step on a fatigued day, after a long run, or in the same week as
  a new session type. Fatigue reduces hamstring force capacity and lengthens stride.
- Strides come *before* fatigue — mid-run or after a short easy run, never bolted onto the end
  of 100 minutes.
- Grass or track over tarmac. Never on a camber. Never on a downhill.
- Any change of sensation at the ischial tuberosity ends the set immediately.
  `running-injury-guardrails.md` §2 governs what happens after that.
- Strides are relaxed, not strained. The target is coordination and elastic stiffness, and
  straining degrades both.

---

## 6. Hill work

Uphill and downhill are different sessions with different risks and belong in different parts
of the build. Treating "hills" as one category is how a return-to-run plan quietly programmes
the most provocative stimulus available.

### Uphill — low ham-risk, high value, but gated by the Achilles

Uphill running raises muscular force, cardiac demand, and calf/Achilles loading while
shortening stride and reducing hamstring length. On hamstring grounds it could come very early.
It doesn't, for two reasons that have nothing to do with the hamstring: the Achilles has the
thinnest margin of any structure at this point in the build, and going up means coming down.
Hence week 13-14, after four weeks of stable running volume — with one exception below.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Treadmill grade intervals | Z4-5 | **low** | mod | 11 | 5-6 × 3 min at 6-8% grade | **The exception.** No descent to survive, fully controllable. The earliest hill work available |
| Uphill tempo | Z4 | low | mod | 13 | 8-15 min continuous at 3-6% | Threshold dose at reduced hamstring length |
| Short hill repeats | Z5 | low | mod | 13 | 8-10 × 30-45 s hard, jog/walk down | Strength-endurance with a VO₂max flavour |
| Medium hill repeats | Z5 | low | mod | 14 | 6-8 × 60-90 s at 5 km effort, jog down | The workhorse hill session |
| Hilly steady run | Z2-3 | low up / mod down | mod | 14 | 45-75 min rolling, easy up, controlled down | Manage the descents; they are the loaded part |
| Long hill repeats | Z4-5 | low | mod | 15 | 4-5 × 2-4 min at threshold-to-5 km effort | Effectively VO₂max work with a safety margin |
| Hill sprints | — | low-mod | mod | 14 | See §5 | Neuromuscular, not aerobic |

Walk the descents on the first two or three hill sessions, genuinely. The recovery is a
recovery, not a second stimulus. And **do not add uphill volume in a week where knee-to-wall
dorsiflexion has regressed** — uphill running demands range the ankle may not have and takes it
from the Achilles.

### Downhill — high ham-risk, high eccentric quad load, late and deliberate

Downhill running is the standard experimental model for inducing eccentric muscle damage, which
is a fair description of what it does to an unprepared runner. Two loads stack: the quadriceps
absorb impact eccentrically at every contact at an elevated impact peak, and the hamstring
meets a longer stride and a longer terminal-swing position at higher velocity. Both active
flags — hamstring and knee — point at this one session. It still gets programmed, because
untrained downhill legs fail at 30 km of a hilly marathon and on every long descent of a trail
race, and that failure is mechanical rather than aerobic.

| Stage | Earliest wk | Grade | Dose | Effort | Gate |
|---|---|---|---|---|---|
| 1 | 14 | 1-3% | Short shallow descents inside easy runs | Easy | Expect no soreness. If there is any, hold here |
| 2 | 16 | 3-5% | 4-6 × 30-45 s, jog or walk back up | Easy to steady | 48 h soreness settled, no hamstring signal |
| 3 | 18 | 5-8% | 6-8 × 45-60 s | Steady | Two clean sessions at stage 2 |
| 4 | 20 | Race-specific | Sustained descents at goal effort | Goal race effort | Only for races with meaningful descent |

**Rules for descending.**

- **Progress volume before grade, and grade before speed.** Never two at once.
- Expect delayed-onset soreness 24-48 h after the first two sessions — that is the adaptation.
  The first downhill session therefore sits 72 h clear of a threshold session or long run.
- Technique: higher cadence, shorter stride, land closer under the body, let the grade set the
  pace. Overstriding downhill both brakes and puts the hamstring at length under load — the
  slowest and the most dangerous way to descend at the same time.
- Downhill running counts as quality for recovery accounting even at easy effort. Log it as
  such.
- If the knee flag is active, downhill volume is the first thing cut and the last thing added.

---

## 7. Fartlek and unstructured work

Fartlek is structured effort without prescribed pace. That makes it better than a prescribed
session in five situations and worse in one.

**Better when:** fitness is unknown (early in this build it always is); terrain makes pace
targets meaningless (trail, hills, wind, snow); readiness is uncertain and the athlete would
otherwise chase a number they can't hit today; the athlete is stale on the track; or — the case
that matters most here — when hitting a fixed pace would push stride length further than the
hamstring should go. Effort-based prescription self-regulates. Pace-based does not.

**Worse when:** the point of the session is a precise physiological dose. If the goal is 30
minutes at threshold, a fartlek delivers 30 minutes somewhere between steady and 10 km effort,
and the dose was the thing being trained.

| Session | Zone | Ham-risk | Impact | Return wk | Prescription | Notes |
|---|---|---|---|---|---|---|
| Time fartlek | Z4 | low-mod | mod | 12 | 6 × 3 min "comfortably hard", 90 s float | The gentlest introduction to quality in this build |
| Terrain fartlek | Z3-5 | **low** | mod | 14 | Surge every climb, float every descent | Trail-specific, and every surge is uphill — low ham-risk by construction |
| Landmark fartlek | Z3-4 | mod | mod | 14 | Surge lamppost to lamppost, unplanned | Play. Useful when motivation is the limiter |
| Mona fartlek | Z3-5 | mod | mod | 17 | 2×90 s, 4×60 s, 4×30 s, 4×15 s, equal easy float | 20 min total, complete session, no track needed. The 15s reps are fast |
| 10-20-30 | Z3-5 | **high** | mod | 19 | 5 × (30 s easy, 20 s moderate, 10 s near-sprint), × 3-5 blocks | The 10 s is a sprint. Gate it as a speed session, not a fartlek |

For this athlete specifically: **fartlek is the default quality method for weeks 12-15.** It
delivers the stimulus without asking a runner five months out of training to hit paces they
have no basis for, and it lets effort rather than a watch set stride length.

---

## 8. Cross-training substitutes

Cross-training buys aerobic fitness when running isn't available or isn't wise. It does not buy
mechanical tolerance, and pretending otherwise turns one injury into two.

| Modality | Zone reachable | Ham-risk | Impact | Replaces | Does not replace | Notes |
|---|---|---|---|---|---|---|
| Bike / turbo | Z1-5 | low | none | Easy volume, threshold, VO₂max | Impact loading, stride mechanics, calf/Achilles | Most controllable. Best intensity substitute |
| Deep-water running | Z1-4 | low | none | Easy volume, threshold, some specificity | Impact loading, elastic return | Closest movement pattern. HR runs 8-12 bpm below land at matched effort |
| Elliptical / arc trainer | Z1-4 | low | low | Easy volume, moderate intensity | Bone loading, eccentric tolerance | Dull, works, tolerated by most niggles |
| Rowing | Z1-4 | **mod** | none | Aerobic volume, upper-body conditioning | Anything leg-specific | Keep the catch shallow — a deep catch is loaded hip flexion. Same caveat as the lifting block |
| Incline walking | Z1-2 | low | low | Easy volume, calf and glute loading | Speed, elastic loading | 10-15% grade, 5-6 km/h. Best posterior-chain option |
| Rucking | Z1-2 | low | low | Easy volume, partial bone loading | Intensity, stride mechanics | Start at 10% bodyweight. The only mode with real bone stimulus |
| Stair machine | Z2-4 | low | low | Aerobic volume | Stride mechanics | Not while the knee flag is active |
| Anti-gravity treadmill | Z1-5 | low | scaled | Nearly everything, at reduced bodyweight | Full-load impact | If accessible, the best substitute in a return build |

**Equivalence guide.** Match by *duration at matched effort*, never by distance or calories.

| Running session | Substitute with |
|---|---|
| 45 min easy run | 60-75 min easy bike, or 45 min pool running, or 55-60 min elliptical |
| 75 min easy run | 100-120 min easy bike, or 60-75 min pool running (cap around 75 min) |
| 4 × 8 min threshold | 4 × 8 min bike threshold, same recoveries — translates almost exactly |
| 5 × 3 min VO₂max | 5 × 3 min bike or pool, 1:1 recovery — translates well |
| Long run, 2 h | 3 h easy bike, or 2 h bike plus 30 min easy run where running is partly available |

Rule of thumb: **cycling needs ~1.5× the duration** of the easy run it replaces; pool running
is close to 1:1; elliptical ~1.2×. Intensity work translates near 1:1 in time, because the
limiter there is central rather than mechanical.

**The honest caveat.** Nothing here replaces the mechanical loading of running. Bone
remodelling, tendon stiffness, and the eccentric tolerance of the calf and quadriceps are
responses to impact, and impact is precisely what these modalities remove. Six weeks of cycling
returns an athlete who is aerobically intact and mechanically detrained — an engine driving a
chassis nobody has loaded in six weeks, which is the standard setup for a bone stress injury
three weeks after returning. **After more than two weeks of substitution, rebuild running
volume from a reduced base regardless of how good the aerobic numbers look.**

---

## 9. Running-specific strength and drills

The strength programme belongs to `strength-conditioning-coach` — two sessions a week continue
through this build, and neither exercise selection nor progression is decided here. Achilles and
hamstring loading rules belong to `running-injury-guardrails.md` §2 and §4. What follows is
the running-adjacent work between the two, and its volume must be **coordinated, not
duplicated**, across the three files.

### Plyometric progression

Elastic stiffness improves running economy and is lost during a lifting-only block. Gate: heavy
slow calf loading tolerated, pain-free single-leg heel raises with side-to-side symmetry, and
four weeks of stable running volume. Then one step every 1-2 weeks, low volume, forgiving
surface. Progress by contact intensity, not by volume.

| Stage | Drill | Ham-risk | Return wk | Dose | Notes |
|---|---|---|---|---|---|
| 1 | Pogo hops (double-leg, ankles only) | low | 6 | 3 × 20-30 s | Stiff ankles, minimal knee bend. Contact time is the target |
| 2 | Double-leg skipping (rope) | low | 8 | 3 × 60 s | Cheap, high-frequency calf and Achilles loading |
| 3 | Line hops / ankle hops, multi-directional | low | 9 | 3 × 20 each way | Adds a frontal-plane component |
| 4 | Single-leg hops / single-leg pogo | low | 11 | 3 × 15/side | First real unilateral elastic demand |
| 5 | Low box jumps, drop-and-stick | low-mod | 13 | 3 × 6 | Landing mechanics. Stick every landing |
| 6 | Bounding (double-leg) | mod | 16 | 3 × 20 m | Now the hamstring works at length under speed |
| 7 | Single-leg bounding | **high** | 18 | 3 × 20 m | Gate with the same criteria as flying 30s |

### Running drills

Ten minutes, twice a week, before easy runs rather than before quality. Their value is
coordination and posture, not fitness.

| Drill | Ham-risk | Return wk | Dose | Notes |
|---|---|---|---|---|
| Marching / A-march | low | 5 | 2 × 20 m | Posture, hip flexion, foot landing under the hip |
| A-skip | low | 7 | 2 × 20 m | Rhythm and elastic ankle. The default drill |
| High knees | low | 7 | 2 × 20 m | Cadence and hip flexion |
| Butt kicks | low | 7 | 2 × 20 m | Knee flexion speed, hip stays under the body |
| Ankling / dribbles | low | 7 | 2 × 20 m | Contact-time work |
| **B-skip** | **high** | 16 | 2 × 20 m | Actively extends the knee at speed with the hip flexed — terminal swing, on purpose. Late |
| **Straight-leg bounds** | **high** | 16 | 2 × 20 m | Same objection as B-skips |

### The calf and Achilles

**The calf-Achilles complex is the most under-prepared structure in most returning runners.**
The Achilles carries loads on the order of several times bodyweight per stride, and an hour of
running is roughly 5,000-6,000 loading cycles per leg. Nothing in a lifting block or on a bike
prepares that. The soleus in particular takes the larger share at running speeds and is the
muscle most often missed, because a straight-knee calf raise doesn't train it.

Entry standard before continuous running: **≥25 full-range single-leg heel raises, both sides**
— criterion R1 in `return-to-run.md` §2. If it isn't there, it is the first thing to build.

**Heavy slow resistance progression.** 3 sessions/week at least a day apart, ~3 s up and ~3 s
down, minimum 12 weeks. Full range including below neutral *unless* the presentation is
insertional. Run it inside the two lifting sessions plus one standalone slot rather than as a
separate daily habit.

| Stage | Movement | Sets × reps | Notes |
|---|---|---|---|
| 1 | Bilateral standing heel raise | 3 × 15RM | Full range, pause at the bottom. Doubles as dorsiflexion work |
| 2 | **Seated heel raise** | 3 × 15RM → 4 × 6RM by wk 9-12 | Soleus, knee bent. Non-negotiable, needs its own slot |
| 3 | Single-leg standing heel raise | 3 × 12-15 | Weakest side first. Build toward the 25-rep standard |
| 4 | Loaded standing heel raise (machine or Smith) | 4 × 6-8RM | The heavy end. Gastrocnemius, knee straight |
| 5 | Leg-press calf press | 3 × 10-12 | Convenient loading when the standing version is fatigued |
| 6 | Single-leg mid-range isometric hold | 4 × 30-45 s | Analgesic on a grumbling tendon. Use instead of stopping |
| 7 | Pogo hops → hill sprints | See tables above | The elastic end. Hill sprints are the best Achilles stimulus in the catalogue |

Monitoring variable is **morning stiffness on the first ten steps out of bed**, tracked as a
trend. Stable or reducing means the load is tolerated; rising over 7-10 days means the load is
too high even if the runs feel fine.

---

## 10. Session selection quick-reference

### Which session type

| Build phase | 5 km / 10 km | Half / marathon | Trail / ultra |
|---|---|---|---|
| Weeks 1-4 | Walk/run, plus incline walking | Walk/run, plus incline walking | Walk/run, plus incline walking |
| Weeks 5-8 | Continuous easy, drills, plyo entry | Same | Same, plus rucking |
| Weeks 9-10 | Easy + strides, long run | Easy + strides, long run | Easy + strides, long run |
| Weeks 11-12 | Threshold by time (treadmill grade from wk 13) | Threshold by time, long run | Threshold by time, long run |
| Weeks 13-15 | Hill repeats, time fartlek, strides | Cruise intervals, uphill tempo | Uphill tempo, terrain fartlek, vert |
| Weeks 16-19 | VO₂max, long strides, race pace | Long run w/ MP blocks, threshold + steady | Back-to-backs, downhill stages 2-3 |
| Weeks 20+ | Flying 30s, race-specific | Marathon-pace long runs | Race-specific vert and descent |

### Readiness modifier — applied on top of the above

| Today's readiness | The prescribed quality session becomes |
|---|---|
| Good — slept well, no soreness, motivated | As written |
| Moderate — poor sleep, mild fatigue | Same intensity, 60-70% of the reps. Never the reverse |
| Poor — two bad nights, heavy legs, high stress | Steady state or easy. Reschedule the quality |
| Hamstring signal of any kind | Easy, flat or uphill only. No strides, no descents. Escalate to `running-injury-guardrails.md` §2 |
| Focal bone pain, worse with impact | No running. This is the one that ends builds |
| Illness above the neck, no fever | Easy only, halve the duration |
| Illness below the neck, or fever | No running |

Cutting reps while holding pace preserves the session's physiological signature. Cutting pace
while holding reps produces a long moderate session — the one outcome to avoid.

### Substitution table — the prescribed session isn't possible today

| Constraint | Prescribed | Substitute | Why |
|---|---|---|---|
| Half the time available | 75 min easy | 35-40 min easy | Cut duration. Never convert a shortened easy run into a hard one |
| Half the time available | 2 h long run | 70-80 min easy, or split AM/PM | A compressed long run is a tempo wearing a long run's name |
| Half the time available | 5 × 1 km threshold | 3 × 1 km, same pace | Reps go, pace stays |
| Treadmill only | Threshold, VO₂max, hills | Same session, 1% grade | Translates well. Grade work is *better* on a treadmill |
| Treadmill only | Long run | Split in two, or bike plus a short run | Long treadmill runs cost more mentally than they return |
| Ice, or unlit roads | Any quality | Treadmill, or bike intervals | Nothing in this build is worth a fall |
| High wind | Threshold by pace | Threshold by effort, or uphill tempo | Pace targets are meaningless into a headwind |
| Feeling flat | Any quality | Reduced reps at target pace, or steady state | See the readiness table |
| Hamstring niggle | Strides, speed, downhill | Easy flat or uphill running only | The one non-negotiable substitution in this file |
| Knee niggle | Downhill, long run | Flat easy, bike, uphill | Cut descending volume first |
| Calf or Achilles niggle | Hill sprints, speed | Flat easy, bike, isometric calf holds | Those two are peak Achilles load |
| No safe running available | Anything | See §8 equivalences | Substitute duration at matched effort |

---

## Assembling a week

**Assembly rules.**

- 48 hours between hard sessions. Downhill running and long runs with fast content count as
  hard.
- Hard days hard, easy days easy. Roughly 80% of weekly *time* below the first threshold — the
  distribution that consistently outperforms a moderate-heavy alternative in trained endurance
  athletes (Seiler & Kjerland 2006; Stöggl & Sperlich 2014).
- One quality session per week through week 15. Two, plus the long run, from week 16 at the
  earliest. New intensity always enters on a reduced-volume week.
- Lifting sits on the same day as a quality run (after it) or on an easy day — never the day
  before the long run, and never the day before a speed session.
- One new variable per week. Volume increases count as a variable.

### Return build, week 10 — the shape `return-to-run.md` prescribes, with lifting placed

| Day | Session | Notes |
|---|---|---|
| Mon | Rest, or 20 min recovery | |
| Tue | 25 min easy + 6 × 15-20 s strides | Strides mid-run, on grass. Not at the end |
| Wed | Lift (lower emphasis) + calf HSR | |
| Thu | 25 min easy + drills | A-skips, high knees, ankling |
| Fri | 30 min easy | |
| Sat | **45 min long run**, entirely easy | No pace target, no finishing fast |
| Sun | Lift (upper emphasis) + 25 min easy | |

150 minutes of running across five runs. Nothing above Z2 except the strides.

### Post-build, week 16 — threshold established, hills entering

| Day | Session | Notes |
|---|---|---|
| Mon | 30 min recovery | |
| Tue | 15 min w/u, 5 × 1 km at threshold w/ 90 s float, 10 min c/d | The week's quality |
| Wed | Lift + 45 min easy | Lift after the run, or ≥6 h apart |
| Thu | 55 min easy including **downhill stage 1** | The week's new stressor: shallow descents inside an easy run. No strides this week |
| Fri | Rest, or 30 min bike | |
| Sat | 1 h 40 long run, entirely easy | Held plain — the descents were the new variable |
| Sun | Lift + 45 min easy | |

Roughly 5.5 h running, ~85% easy by time. One quality session, one long run, one new stressor.

### Marathon-specific, week 22 — peak

| Day | Session | Notes |
|---|---|---|
| Mon | 45 min recovery | |
| Tue | 20 min steady, 4 × 5 min threshold, 10 min steady | Race-specific threshold |
| Wed | 70 min easy + drills | |
| Thu | Lift + 50 min easy | |
| Fri | 40 min easy + 6 × 20 s strides | |
| Sat | 2 h 30 with 2 × 25 min at marathon pace | MP blocks in the middle, not at the end. Fuel per `sports-nutritionist` |
| Sun | Lift + 60 min easy | |

Roughly 8 h running. Two quality sessions plus a long run is the ceiling, not a target to beat.

---

## Evidence notes

- **Seiler & Kjerland (2006)**; **Stöggl & Sperlich (2014)** — elite endurance athletes place
  roughly 80% of sessions below the first ventilatory threshold, and a polarised distribution
  outperformed threshold-dominant and high-volume alternatives in trained athletes. The basis
  for treating Z3 drift on easy days as a cost rather than a bonus.
- **Billat (2001)** — review of interval training and time at VO₂max. The basis for 3-5 minute
  work intervals, and for 30/30s as a lower-mechanical-cost route to the same stimulus.
- **Foster and colleagues** — the talk test corresponds closely to the ventilatory thresholds
  and is reproducible enough to prescribe from in the field. Why easy running is anchored to
  speech rather than to pace or heart rate.
- **Chumanov et al. (2011)** — hamstring musculotendon stretch and force peak in terminal
  swing, and both increase with running speed. The mechanism behind every Ham-risk rating in
  this file.
- **Askling et al. (2007, 2013)** — hamstring injuries divide into sprinting-type (biceps
  femoris, terminal swing) and stretching-type (proximal, substantially longer recovery), and
  rehabilitation emphasising controlled lengthening returns athletes faster than conventional
  protocols. The proximal presentation being the slower one is why speed is gated so hard.
- The uphill-versus-flat argument is mechanical rather than derived from a single trial:
  gradient shortens stride and reduces terminal-swing hip flexion and knee extension while
  maintaining or raising muscular force. Short uphill sprints are a standard reintroduction
  tool in return-to-run practice for that reason. Treat the reasoning as sound and the
  magnitude as unquantified.
- Downhill running is the standard experimental model for inducing eccentric muscle damage and
  delayed-onset soreness, and it raises the impact peak relative to level running (Gottschall &
  Kram 2005). Hence introduced last and progressed by volume before grade.
- **Beyer et al. (2015)** — heavy slow resistance and eccentric training produced comparable
  outcomes in Achilles tendinopathy at 12 weeks, with better adherence in the heavy-slow group.
  The basis for the calf progression in §9.
- **Nielsen et al. (2014)** — large weekly increases in running distance are associated with
  running-related injury. Applied here as: grow the long run fortnightly, and rebuild from a
  reduced base after any cross-training substitution.
- **Wilber et al. (1996)** — deep-water running maintained VO₂max in trained runners across a
  multi-week substitution period. Supports pool running as an aerobic substitute; it says
  nothing about mechanical tolerance, which is the caveat in §8.
