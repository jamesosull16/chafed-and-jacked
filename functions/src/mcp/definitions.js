/**
 * MCP TOOL DEFINITIONS — Chafed & Jacked
 *
 * The action surface exposed to a Claude conversation. Descriptions are written
 * for the model rather than for a human reading the file: they say when to
 * reach for a tool, not only what it does, because that is what actually moves
 * the call rate.
 *
 * Dates are always local YYYY-MM-DD and always optional, defaulting to today.
 * The athlete's timezone comes from the request, not from the server, which
 * runs in UTC and would otherwise roll the day over mid-evening.
 */

const DATE = {
  type: 'string',
  description: 'Local date, YYYY-MM-DD. Defaults to today.',
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'preWorkout', 'postWorkout']

const SET = {
  type: 'object',
  description: 'One logged set.',
  properties: {
    weight: {
      type: 'number',
      description:
        'The effective load in lbs — for a bodyweight set that is his weight plus anything added.',
    },
    reps: { type: 'number', description: 'Reps, or seconds for a timed hold.' },
    rir: { type: 'number', description: 'Reps in reserve, 0-10.' },
    side: { type: 'string', enum: ['left', 'right'], description: 'For per-side movements.' },
    isBodyweight: { type: 'boolean' },
    addedWeight: {
      type: 'number',
      description: 'On a bodyweight set: plate added, or negative for machine assistance.',
    },
  },
  required: ['weight', 'reps'],
}

export const TOOL_DEFINITIONS = [
  // ── Meals ──
  {
    name: 'log_meal',
    description:
      "Estimate a meal's macros from a description and/or photo and write it to the day's " +
      'nutrition log. Use this whenever James says what he ate and the numbers are not already ' +
      'known. Grounds against USDA where it can and reports its own confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'What he ate, in his words. Portions matter most — "100g oats" beats "oats".',
        },
        image: { type: 'string', description: 'Base64 photo, no data: URI prefix.' },
        media_type: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] },
        label: { type: 'string', description: 'Short dish name for the log. Defaults to the description.' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
        date: DATE,
      },
    },
  },
  {
    name: 'add_meal_manually',
    description:
      'Write a meal whose macros are already known — off a label, a repeat of something logged ' +
      'before, or a figure he states outright. Use this instead of log_meal when the numbers are ' +
      'given: estimating a number he already has is a way to get a different one.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
        date: DATE,
      },
      required: ['label', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
    },
  },
  {
    name: 'list_meals',
    description:
      "What he has eaten, with the day's totals and how much of each target is left. Call this " +
      'before advising on what to eat — the answer depends on what is already logged.',
    inputSchema: {
      type: 'object',
      properties: {
        date: DATE,
        days: { type: 'number', description: 'How many days back, 1-90. Ignored if date is given. Defaults to 1.' },
      },
    },
  },
  {
    name: 'update_meal',
    description:
      'Correct a meal already logged. Use when he adjusts a portion or a number after the fact — ' +
      'never log a second entry for the same meal.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry id from list_meals.' },
        date: DATE,
        label: { type: 'string' },
        kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_meal',
    description:
      'Remove a meal entirely. Only when he did not eat it or it was logged by mistake — for a ' +
      'wrong portion or number use update_meal so the entry keeps its history.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, date: DATE },
      required: ['id'],
    },
  },

  // ── Saved meals ──
  {
    name: 'list_saved_meals',
    description:
      "James's meal library — meals he has estimated, checked and kept for repeat logging. " +
      'Check here before estimating anything he refers to as a usual or by a dish name: a saved ' +
      'meal carries numbers he has already agreed with, and estimating it again is a way to get ' +
      'different ones.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'log_saved_meal',
    description:
      'Log a meal from the library at its saved macros, scaled by quantity. Use instead of ' +
      'log_meal whenever the meal is one of his saved ones. Fails rather than guessing when the ' +
      'name matches nothing or matches several — ask him which.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Saved meal name, from list_saved_meals.' },
        quantity: { type: 'number', description: 'Multiplier on the saved serving. Defaults to 1.' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
        date: DATE,
      },
      required: ['name'],
    },
  },
  {
    name: 'save_meal_to_library',
    description:
      'Keep a meal for one-tap logging later, as one serving. Saving under an existing name ' +
      'replaces that meal rather than adding a second one with the same name — which is how you ' +
      'correct a saved meal whose numbers were off. Only save what he actually repeats; a ' +
      'library full of one-offs is a library he cannot search.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short, searchable dish name — how he refers to it.' },
        kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        meal_type: { type: 'string', enum: MEAL_TYPES },
      },
      required: ['name', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
    },
  },
  {
    name: 'delete_saved_meal',
    description:
      'Remove a meal from the library. This does not touch anything already logged from it — ' +
      'past days keep the meals they recorded.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },

  // ── Runs ──
  {
    name: 'log_run',
    description:
      'Log a run he states as completed. Never one he is planning or considering, and never a ' +
      'distance he did not give. Duration and average heart rate make the calorie and fuelling ' +
      'maths real rather than assumed — include them when he says them.',
    inputSchema: {
      type: 'object',
      properties: {
        miles: { type: 'number' },
        duration_minutes: { type: 'number' },
        avg_hr_bpm: { type: 'number' },
        date: DATE,
      },
      required: ['miles'],
    },
  },
  {
    name: 'list_runs',
    description: 'Runs over a window, with per-day mileage. Use for any question about running volume.',
    inputSchema: {
      type: 'object',
      properties: { date: DATE, days: { type: 'number', description: '1-90. Defaults to 7.' } },
    },
  },
  {
    name: 'update_run',
    description:
      'Correct a logged run. Runs have no id of their own — address one by its position in the ' +
      "day's list, which list_runs returns in order.",
    inputSchema: {
      type: 'object',
      properties: {
        date: DATE,
        index: { type: 'number', description: 'Zero-based position within that day.' },
        miles: { type: 'number' },
        duration_minutes: { type: 'number' },
        avg_hr_bpm: { type: 'number' },
      },
      required: ['index'],
    },
  },
  {
    name: 'delete_run',
    description:
      'Remove one run from a day, addressed by its position in that day. Use when a run was ' +
      'logged twice or against the wrong date; to fix a distance or duration use update_run so ' +
      'the day keeps its shape.',
    inputSchema: {
      type: 'object',
      properties: { date: DATE, index: { type: 'number' } },
      required: ['index'],
    },
  },

  // ── Strength sessions ──
  {
    name: 'log_workout',
    description:
      'Write a completed strength session — every exercise with every set. Use when he describes ' +
      'training he has already done and it is not in the app. Leaves totalVolume unset, because ' +
      'the app derives it from bodyweight fractions and per-hand multipliers this server cannot see.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'e.g. "Lower — Posterior".' },
        day_id: { type: 'string', description: 'Split template id, e.g. lowerPosterior.' },
        mode: { type: 'string', enum: ['strength', 'running'] },
        duration_minutes: { type: 'number' },
        date: DATE,
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'App exercise id, e.g. barbellHipThrust.' },
              sets: { type: 'array', items: SET },
            },
            required: ['id', 'sets'],
          },
        },
      },
      required: ['exercises'],
    },
  },
  {
    name: 'list_workouts',
    description:
      'Recent sessions with their top set per movement. Use for "how has my training gone" and ' +
      'to find the id of a session to inspect or correct.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How far back, 1-365. Defaults to 28.' },
        limit: { type: 'number', description: 'Max sessions, 1-60. Defaults to 20.' },
      },
    },
  },
  {
    name: 'get_workout',
    description: 'One session in full — every set, weight, rep and RIR. Use when the answer depends on how individual sets went.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'From list_workouts.' } },
      required: ['id'],
    },
  },
  {
    name: 'update_workout',
    description:
      'Correct a logged session. Replacing exercises replaces the whole array — read it with ' +
      'get_workout first and send it back modified, or sets will be lost.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        duration_minutes: { type: 'number' },
        completed: { type: 'boolean' },
        exercises: { type: 'array', items: { type: 'object' } },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_workout',
    description:
      'Remove a session entirely. Note that exerciseProgress keeps its own copy of the loads, so ' +
      'a deleted session can still drive the next prescription until that is corrected too.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },

  // ── Body metrics ──
  {
    name: 'log_weigh_in',
    description:
      'Record a weigh-in. This is what every macro target is computed from, so it matters more ' +
      'than its size suggests. Body fat is optional and only worth logging if actually measured.',
    inputSchema: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Pounds.' },
        body_fat_pct: { type: 'number' },
        date: DATE,
      },
      required: ['weight'],
    },
  },
  {
    name: 'list_weigh_ins',
    description:
      'Weigh-in history. Report the readings; do not compute a trend from fewer than three ' +
      "weeks of them — a single reading is water rather than tissue, and the app refuses too.",
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'number', description: '1-104. Defaults to 8.' } },
    },
  },
  {
    name: 'update_weigh_in',
    description:
      'Correct a weigh-in, by the id list_weigh_ins returns. Use for a mistyped figure — every ' +
      'macro target is computed from the most recent weight, so a wrong one propagates into ' +
      'every day that follows it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        weight: { type: 'number' },
        body_fat_pct: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_weigh_in',
    description:
      'Remove a weigh-in — a duplicate, or one recorded against the wrong day. Prefer ' +
      'update_weigh_in for a wrong number: the trend needs three weeks of readings before it ' +
      'means anything, and deleting them makes that longer.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },

  // ── Check-ins ──
  {
    name: 'log_check_in',
    description:
      'Record how he says he is feeling — sleep, soreness, how hard a session felt, or a short ' +
      'note. Use it when he volunteers that in passing ("slept badly", "legs are wrecked") so it ' +
      'is still known tomorrow. Merged into the day, so mentioning sleep and soreness separately ' +
      'is one check-in rather than two conflicting ones. Do not interrogate him for the fields.',
    inputSchema: {
      type: 'object',
      properties: {
        sleep_hours: { type: 'number' },
        soreness: { type: 'number', description: '1-10, where 10 is the worst.' },
        rpe: { type: 'number', description: '1-10 perceived exertion for the last session.' },
        note: { type: 'string', description: 'His words, condensed. Max ~200 chars.' },
        date: DATE,
      },
    },
  },
  {
    name: 'list_check_ins',
    description: 'Recent check-ins. The only record of how training actually felt — a workout document carries none of it.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: '1-90. Defaults to 14.' } },
    },
  },
  {
    name: 'delete_check_in',
    description:
      "Remove a day's check-in — sleep, soreness, RPE and note together. Use when it was logged " +
      'against the wrong day; to change one field, log_check_in merges into the existing day ' +
      'rather than replacing it.',
    inputSchema: {
      type: 'object',
      properties: { date: DATE },
      required: ['date'],
    },
  },

  // ── Exercise progress ──
  {
    name: 'get_exercise_progress',
    description:
      'Load and rep history for one movement, or a summary of every movement when no id is ' +
      'given. This is what the next session prescribes from.',
    inputSchema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string', description: 'App exercise id. Omit for all movements.' },
      },
    },
  },
  {
    name: 'update_exercise_progress',
    description:
      'Repair what the next session will suggest. This document is derived from logged sessions, ' +
      'so reach for it when a bad log has left the next prescription wrong — not as a way to set ' +
      'loads, which is what logging the session does.',
    inputSchema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        current_weight: { type: 'number', description: 'Effective load, bodyweight included.' },
        is_bodyweight: { type: 'boolean' },
        current_added_weight: { type: 'number', description: 'Negative for machine assistance.' },
        last_reps: { type: 'array', items: { type: 'number' } },
      },
      required: ['exercise_id'],
    },
  },
  {
    name: 'delete_exercise_progress',
    description:
      'Wipe a movement\'s progress. The next session prescribes from scratch until it is logged ' +
      'again — use when the history is wrong beyond correcting.',
    inputSchema: {
      type: 'object',
      properties: { exercise_id: { type: 'string' } },
      required: ['exercise_id'],
    },
  },

  // ── Profile ──
  {
    name: 'get_profile',
    description:
      'The athlete\'s settings — mode, block dates, training days, equipment, injury flags, and ' +
      'the physical details every calculation rests on. Read this before advising on anything ' +
      'the block structure affects.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_profile',
    description:
      'Change settings — block dates, training days, session length, equipment, injury flags, ' +
      'physical details, or the strength/running mode. Only these fields can be set; anything ' +
      'else in the profile is rejected rather than silently ignored.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['strength', 'running'] },
        strength: {
          type: 'object',
          properties: {
            blockStart: { type: 'string', description: 'YYYY-MM-DD.' },
            blockEnd: { type: 'string', description: 'YYYY-MM-DD.' },
            trainingDaysPerWeek: { type: 'number' },
            trainingDayIndices: {
              type: 'array',
              items: { type: 'number' },
              description: 'Weekday numbers, Sunday 0 to Saturday 6.',
            },
            sessionMinutes: { type: 'number' },
            equipment: { type: 'string' },
            injuryFlags: { type: 'array', items: { type: 'string' } },
            bodyCompGoal: { type: 'string' },
          },
        },
        profile: {
          type: 'object',
          properties: {
            heightInches: { type: 'number' },
            birthday: { type: 'string' },
            biologicalSex: { type: 'string' },
            vo2max: { type: 'number' },
          },
        },
        onboarding: {
          type: 'object',
          properties: {
            initialWeight: { type: 'number' },
            initialBodyFat: { type: 'number' },
            trainingDays: { type: 'string' },
          },
        },
      },
    },
  },

  // ── Coach thread ──
  {
    name: 'list_coach_messages',
    description:
      'Recent messages from the in-app Coach thread. Use to see what the Coach has already told ' +
      'him, so advice here does not contradict it.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '1-100. Defaults to 20.' } },
    },
  },
  {
    name: 'delete_coach_message',
    description:
      'Remove one message from the Coach thread — a duplicate, or one that is simply wrong. The ' +
      'thread is replayed to the Coach as history on every turn, so a wrong message left there ' +
      'keeps shaping what it says next.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
]
