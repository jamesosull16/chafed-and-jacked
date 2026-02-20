/**
 * SNARKY STATS & QUOTES — Chafed & Jacked
 *
 * Generates weekly motivational/sarcastic stats tied to the app's crude humor theme.
 * All in good fun for a 42-year-old who chooses to run 100 miles for "fun."
 */

const VOLUME_QUIPS = [
  (lbs) => `You've lifted ${lbs.toLocaleString()} lbs this week. Your knees are filing a formal complaint.`,
  (lbs) => `${lbs.toLocaleString()} lbs moved. That's roughly the weight of your excuses for not stretching.`,
  (lbs) => `Weekly volume: ${lbs.toLocaleString()} lbs. Your chiropractor just bought a boat.`,
  (lbs) => `${lbs.toLocaleString()} lbs lifted. Your joints sound like a bag of microwave popcorn.`,
  (lbs) => `You moved ${lbs.toLocaleString()} lbs this week. Your body is aging like fine wine left in the sun.`,
  (lbs) => `${lbs.toLocaleString()} lbs. That's ${Math.round(lbs / 2000)} tons of "I'll feel this tomorrow."`,
  (lbs) => `Weekly haul: ${lbs.toLocaleString()} lbs. Your ibuprofen bottle is getting nervous.`,
  (lbs) => `${lbs.toLocaleString()} lbs lifted. Still can't open a jar without making a noise.`,
]

const MILEAGE_QUIPS = [
  (mi) => `${mi} miles this week. Your nipples called — they want a divorce.`,
  (mi) => `${mi} miles logged. That's ${Math.round(mi * 5280 / 2.5)} steps of questioning your life choices.`,
  (mi) => `You ran ${mi} miles. Normal people just drive places, you know.`,
  (mi) => `${mi} miles. Your toenails are filing for emancipation.`,
  (mi) => `Weekly mileage: ${mi}. Your shoes have PTSD.`,
  (mi) => `${mi} miles. That's almost far enough to run away from your responsibilities.`,
]

const RACE_COUNTDOWN_QUIPS = [
  (days) => `${days} days until race day. Your body has started writing its will.`,
  (days) => `${days} days to go. Your couch is already mourning your absence.`,
  (days) => `Race in ${days} days. That's ${days} more days of pretending this is fun.`,
  (days) => `${days} days out. Your foam roller is sharpening its elbows.`,
  (days) => `Only ${days} days left. Plenty of time to reconsider your life choices.`,
  (days) => `${days} days. In dog years, your body is already dead.`,
]

const DELOAD_QUIPS = [
  'Deload week. Even your muscles need a vacation from your terrible decisions.',
  'Recovery week. Time to do the bare minimum — just like your boss suspects you already do.',
  'Deload week: the one time "taking it easy" is actually the right call.',
  'Light week. Your body is thanking you in a language made entirely of joint cracks.',
]

const GENERAL_QUIPS = [
  'Remember: you chose this. Nobody made you sign up for a race longer than most people drive.',
  'At 42, every rep is a negotiation between ambition and cartilage.',
  'Fun fact: your 25-year-old self would be both impressed and concerned.',
  'Strength training for ultras: because running 100 miles isn\'t punishing enough.',
  'You\'re not old. You\'re "experienced." Your joints disagree, but whatever.',
]

/** Get a snarky stat of the week based on available data */
export function getWeeklySnark({ weeklyVolume, weeklyMileage, daysUntilRace, isDeload }) {
  if (isDeload) {
    return pickRandom(DELOAD_QUIPS)
  }

  const options = []

  if (weeklyVolume && weeklyVolume > 0) {
    const quip = pickRandom(VOLUME_QUIPS)
    options.push(quip(weeklyVolume))
  }

  if (weeklyMileage && weeklyMileage > 0) {
    const quip = pickRandom(MILEAGE_QUIPS)
    options.push(quip(weeklyMileage))
  }

  if (daysUntilRace && daysUntilRace > 0 && daysUntilRace < 200) {
    const quip = pickRandom(RACE_COUNTDOWN_QUIPS)
    options.push(quip(daysUntilRace))
  }

  if (options.length === 0) {
    return pickRandom(GENERAL_QUIPS)
  }

  return pickRandom(options)
}

function pickRandom(arr) {
  // Use day-of-year as seed for consistent daily quote (changes daily, not on refresh)
  const now = new Date()
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
  return arr[dayOfYear % arr.length]
}
