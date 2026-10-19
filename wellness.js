// Wellness content and logic: feelings, body check-in, recovery days and the
// menstrual cycle. No DOM code here (see checkin.js), so it ports to a phone app as-is.

// ---------- feelings ----------
// Her feelings (any number of them a day) live in emotions.js; moodMix averages them.
// feelingOf gives the screens one summary: the box the average lands in, the words, a kind line.
function feelingOf(entry) {
  const mix = moodMix(entry);
  if (!mix) return null;
  const g = GROUP_BY_ID[mix.group];
  return { id: mix.group, emoji: g ? g.emoji : "🌀", label: feelingWords(mix.list), lines: MIX_LINES[mix.group], mix };
}
const clampTo = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------- body ----------
const BODY = [
  { id: "energized", emoji: "⚡", label: "Energized", score: 5, lines: [
    "Full battery! Great day for a workout or the heavier chores.",
    "Your body's ready to move. Use it, then stretch it.",
    "Energy to spare. Just don't spend it all before lunch.",
  ] },
  { id: "good", emoji: "💪", label: "Feeling good", score: 4, lines: [
    "Body's happy. Keep it that way with water and a real lunch.",
    "Feeling good is the goal. Protect it with good sleep tonight.",
    "Solid. A walk today keeps it rolling.",
  ] },
  { id: "little_sore", emoji: "🦵", label: "A little sore", score: 3, lines: [
    "A bit sore? Light movement and a stretch will help.",
    "Sore means you've been working. Give those muscles some love.",
    "Warm shower, gentle stretch, plenty of water.",
  ] },
  { id: "very_sore", emoji: "🤕", label: "Very sore", score: 2, lines: [
    "Very sore means recovery comes first today. No heavy lifting.",
    "Your body's rebuilding. Rest, heat and water are the plan.",
    "Today's workout is resting. Seriously.",
  ] },
  { id: "drained", emoji: "🪫", label: "Drained", score: 1.5, lines: [
    "Battery's low. Recharge first, everything else second.",
    "Drained isn't lazy. It's a signal. Eat, hydrate, rest.",
    "Running on empty. Cut today's list down to the essentials.",
  ] },
  { id: "sick", emoji: "🤒", label: "Sick", score: 1, lines: [
    "Feel better soon 💛 Rest is the only thing on today's list.",
    "Sick days are for fluids, blankets and nothing else.",
    "Everything else can wait. Your job today is getting better.",
  ] },
];
const bodyOf = entry => entry && BODY.find(b => b.id === entry.body);

// ---------- seeded "random" so a day's pick doesn't change on every redraw ----------
function seeded(day, salt) {
  let h = 2166136261;
  for (const ch of day + "|" + salt) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const pickFor = (list, day, salt) => list[Math.floor(seeded(day, salt) * list.length)];
function pickSome(list, n, day, salt) {
  const copy = [...list];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(seeded(day, salt + i) * copy.length), 1)[0]);
  return out;
}

// ---------- menstrual cycle ----------
let cycle = { starts: [], length: 28, periodLength: 5 };

const PHASES = {
  menstrual: {
    label: "Menstrual phase", short: "Period", emoji: "🩸", color: "#e8607a",
    blurb: "Hormones are at their lowest, so energy often is too. This is your body's reset week.",
    doList: ["Gentle movement: a walk, yoga or stretching", "Lower-key plans. It's fine to say no", "Extra sleep if you can get it", "Journaling or quiet time"],
    eat: ["Iron-rich foods: leafy greens, lentils, beans, red meat", "Vitamin C (citrus, peppers) to help absorb that iron", "Warm, comforting meals like soups and stews", "Magnesium: dark chocolate, nuts, seeds"],
    care: ["Heating pad on your belly or back for cramps", "Stay hydrated. It can help with bloating", "Comfy clothes, cozy blanket, zero guilt", "Rest is the priority this week"],
    facts: [
      "Cramps come from prostaglandins, hormone-like compounds that make the uterus contract.",
      "Iron is lost with menstrual blood. Pairing iron-rich food with vitamin C helps your body absorb it.",
      "In studies, heat on the lower belly eased cramps about as well as common pain relievers.",
      "The average period lasts 3–7 days. The whole cycle usually runs 21–35 days.",
      "Light exercise boosts endorphins, your body's natural pain relievers.",
    ],
  },
  follicular: {
    label: "Follicular phase", short: "Follicular", emoji: "🌱", color: "#5cc98a",
    blurb: "Estrogen is rising, and many people feel their energy, mood and focus climbing.",
    doList: ["Try something new or start a project", "Harder workouts feel easier now", "Planning and brainstorming", "Social plans"],
    eat: ["Lean protein to fuel more activity", "Fermented foods: yogurt, kefir, kimchi", "Lots of fresh veggies and fruit", "Whole grains for steady energy"],
    care: ["Use the energy, but still keep a rest day", "Great week to batch tough chores", "Get outside: sunlight + rising energy = good mood"],
    facts: [
      "This phase is named after the follicles in the ovaries that mature during it.",
      "Rising estrogen is linked with better mood and energy for many people.",
      "Some research suggests strength training can feel easier in the follicular phase.",
    ],
  },
  ovulation: {
    label: "Ovulation", short: "Ovulation", emoji: "✨", color: "#b48cff",
    blurb: "Estrogen peaks around now. Energy and confidence are often at their highest.",
    doList: ["Big conversations, presentations, social events", "High-energy workouts", "Tackle the hardest thing on your list"],
    eat: ["Fiber-rich veggies and whole grains", "Antioxidants: berries, colorful produce", "Plenty of water"],
    care: ["Don't overbook yourself just because you feel great", "Light, cool meals if you feel warm", "Sunscreen on, get outside"],
    facts: [
      "After ovulation, an egg survives about 12–24 hours.",
      "Some people feel a brief one-sided twinge at ovulation called mittelschmerz, German for 'middle pain'.",
      "Ovulation usually happens about 14 days before the next period, not always on day 14.",
    ],
  },
  luteal: {
    label: "Luteal phase", short: "Luteal", emoji: "🍂", color: "#f0a24a",
    blurb: "Progesterone rises. Energy often dips toward the end, and cravings are normal.",
    doList: ["Moderate exercise: pilates, walks, swimming", "Lighter schedule as your period gets closer", "Wrap up projects rather than starting new ones", "Wind-down routine in the evening"],
    eat: ["Complex carbs: oats, sweet potato, brown rice", "Magnesium: leafy greens, pumpkin seeds, dark chocolate", "B6 foods: bananas, chickpeas, salmon", "Go easy on salt and caffeine if you're bloated"],
    care: ["Protect your sleep. It matters extra now", "Plan cozy nights in", "Be patient with yourself if you feel more sensitive"],
    facts: [
      "Body temperature rises slightly (about 0.3–0.5 °C) after ovulation because of progesterone.",
      "Your body can burn a little more energy in the luteal phase, so feeling hungrier is normal.",
      "PMS symptoms usually show up in the last week or two before a period.",
      "Magnesium-rich foods may help ease PMS symptoms for some people.",
    ],
  },
};

// Which cycle day / phase a date falls on, from the most recent period start.
// Projects up to 6 cycles ahead; returns null when there's no data.
function cycleInfo(day) {
  const starts = [...(cycle.starts || [])].sort();
  let start = null;
  for (const s of starts) if (s <= day) start = s;
  if (!start) return null;
  const len = cycle.length || 28;
  const diff = daysBetween(start, day);
  const n = Math.floor(diff / len);
  if (n > 6) return null;
  const cycleDay = (diff % len) + 1;
  const ov = len - 14;
  const periodLen = Math.min(cycle.periodLength || 5, ov - 2);
  const phase =
    cycleDay <= periodLen ? "menstrual" :
    cycleDay < ov - 1 ? "follicular" :
    cycleDay <= ov + 1 ? "ovulation" : "luteal";
  return { cycleDay, phase, projected: n > 0, start: addDays(start, n * len) };
}

// ---------- energy forecast ----------
// Blends cycle phase, body, feelings and whether it's a workday into a rough
// energy level for the day. Future days only have the cycle + workday to go on.
// Work schedule: profile.workHours = { 0..6 (Sun..Sat): { start: "HH:MM", end: "HH:MM" } or null }.
// Until she sets it: Mon-Fri 9-5 (or her older "days I work" list, at 9-5).
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_SHIFT = { start: "09:00", end: "17:00" };
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Her weekly hours from Settings.
function settingsShiftFor(day) {
  const dow = fromKey(day).getDay();
  if (profile.workHours) return profile.workHours[dow] || null;
  return (profile.workdays || DEFAULT_WORKDAYS).includes(dow) ? DEFAULT_SHIFT : null;
}

// Work shifts that come from her calendar: any timed event whose title contains the
// work-shift name (Settings, default "Ariel - Work"). On those days the event IS the work
// schedule, instead of the Settings hours, and it isn't counted as a task.
const DEFAULT_WORK_FROM_CAL = { enabled: true, match: "Ariel - Work" };
const workFromCal = () => ({ ...DEFAULT_WORK_FROM_CAL, ...(profile.workFromGoogle || {}) });
function isWorkShift(t) {
  const pref = workFromCal();
  const match = (pref.match || "").trim().toLowerCase();
  return !!(pref.enabled && match && t && !t.deleted && t.time && (t.title || "").toLowerCase().includes(match));
}
function calendarShiftFor(day) {
  const ev = tasks.filter(t => t.date === day && isWorkShift(t)).sort((a, b) => a.time.localeCompare(b.time))[0];
  return ev ? { start: ev.time, end: addMinutesTo(ev.time, ev.minutes || 8 * 60), fromCalendar: true, title: ev.title } : null;
}

// The shift that starts on this day: from her calendar if there is one, else Settings.
const workHoursFor = day => calendarShiftFor(day) || settingsShiftFor(day);
const isWorkday = day => !!workHoursFor(day);

// Work as blocks of minutes within this day (0-1440): today's shift (cut at midnight if it
// runs overnight) plus the after-midnight part of yesterday's overnight shift.
function workBlocks(day) {
  const blocks = [];
  const s = workHoursFor(day);
  if (s) {
    const a = toMin(s.start), b = toMin(s.end);
    blocks.push(a < b ? [a, b] : [a, 24 * 60]);
  }
  const y = workHoursFor(addDays(day, -1));
  if (y && toMin(y.end) <= toMin(y.start) && toMin(y.end) > 0) blocks.push([0, toMin(y.end)]);
  return blocks;
}
// Is she at work at this time ("HH:MM") on this day?
function atWork(day, time) {
  if (!time) return false;
  const m = toMin(time);
  return workBlocks(day).some(([a, b]) => m >= a && m < b);
}

// Minutes of work in a shift (overnight shifts wrap past midnight).
function shiftMinutes(shift) {
  if (!shift) return 0;
  const len = toMin(shift.end) - toMin(shift.start);
  return len > 0 ? len : len + 24 * 60;
}
const shiftLabel = s => `${formatTime(s.start)}–${formatTime(s.end)}`;

// Is a time of day ("HH:MM") inside the shift?
function duringWork(time, shift) {
  if (!shift || !time) return false;
  const t = toMin(time), a = toMin(shift.start), b = toMin(shift.end);
  return a < b ? t >= a && t < b : t >= a || t < b;
}

// ---------- sleep schedule ----------
// profile.sleep = { 0..6 (Sun..Sat): { bed: "HH:MM", wake: "HH:MM" } }: the bedtime is the
// night of that day (may be after midnight), the wake time is that morning.
const DEFAULT_SLEEP = { bed: "22:00", wake: "07:00" };
const sleepFor = day => (profile.sleep && profile.sleep[fromKey(day).getDay()]) || DEFAULT_SLEEP;

// Her awake window for a day, in minutes from that day's midnight (end can pass 24:00).
function awakeWindow(day) {
  const s = sleepFor(day);
  const start = toMin(s.wake);
  let end = toMin(s.bed);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

// Hours of sleep going into a day: the previous night's bedtime to this morning's wake.
function sleepHoursBefore(day) {
  let m = toMin(sleepFor(day).wake) - toMin(sleepFor(addDays(day, -1)).bed);
  if (m <= 0) m += 24 * 60;
  return m / 60;
}

// Minutes of work between two points of the day (minutes from midnight, may pass 24:00).
function workMinutesBetween(day, from, to) {
  const today = workBlocks(day), tomorrow = to > 24 * 60 ? workBlocks(addDays(day, 1)) : [];
  let busy = 0;
  for (let m = Math.ceil(from / 5) * 5; m < to; m += 5) {
    // Past midnight (a late bedtime) it's tomorrow's clock that counts.
    const [blocks, mm] = m < 24 * 60 ? [today, m] : [tomorrow, m - 24 * 60];
    if (blocks.some(([a, b]) => mm >= a && mm < b)) busy += 5;
  }
  return busy;
}

// Time she's awake and not at work: the most she could ever spend on tasks.
function freeMinutes(day) {
  const w = awakeWindow(day);
  return w.end - w.start - workMinutesBetween(day, w.start, w.end);
}

// Minutes of things she still plans to do. Scheduled events count 30 min (or their own
// length) unless they're during work; work shifts and finished things don't count.
function plannedMinutes(list, day) {
  return list
    .filter(t => !t.done && !t.deleted && !isWorkShift(t))
    .filter(t => kindOf(t) !== "event" || !(day && atWork(day, t.time)))
    .reduce((s, t) => s + (minutesLeft(t) ?? (kindOf(t) === "event" ? 30 : 15))    // finished steps don't count
      + (isSocial(t) ? SOCIAL_QUIET : 0), 0);                                      // quiet time after people
}

// Free time left: for today, counted from right now (in seconds, for the live timer).
function freeTimeLeft(day, list) {
  const w = awakeWindow(day);
  const planned = plannedMinutes(list, day) * 60;
  if (day !== todayKey()) {
    const total = (freeMinutes(day)) * 60;
    return { seconds: total - planned, total, planned, past: false, beforeWake: false };
  }
  const now = nowLocal();          // her clock (Settings → Time zone)
  let nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  // After midnight but before a late bedtime counts as the same evening.
  if (w.end > 24 * 60 && nowMin < w.start && nowMin + 24 * 60 < w.end) nowMin += 24 * 60;
  const from = Math.max(nowMin, w.start);
  const awake = Math.max(0, w.end - from) * 60;
  const work = workMinutesBetween(day, from, w.end) * 60;
  return {
    seconds: awake - work - planned, total: awake - work, planned,
    past: nowMin >= w.end, beforeWake: nowMin < w.start,
  };
}

function energyFor(day) {
  const entry = moods[day] || {};
  const f = feelingOf(entry), b = bodyOf(entry), c = cycleInfo(day);
  let score = 3;
  const why = [];
  const add = (delta, reason) => { score += delta; if (reason) why.push(reason); };

  if (c) {
    const len = cycle.length || 28;
    if (c.phase === "menstrual" && c.cycleDay <= 2) add(-1.5, `period day ${c.cycleDay}`);
    else if (c.phase === "menstrual") add(-0.5, `period day ${c.cycleDay}`);
    else if (c.phase === "follicular") add(0.5, "follicular phase");
    else if (c.phase === "ovulation") add(1, "ovulation");
    else if (c.cycleDay > len - 5) add(-0.5, "late luteal (PMS) days");
  }
  if (b) add({ energized: 1, good: 0.5, little_sore: -0.5, very_sore: -1.5, drained: -1.5, sick: -3 }[b.id], b.label.toLowerCase());
  // Feelings: more energy and nicer feelings lift the day; drained or awful ones lower it.
  if (f) {
    const d = clampTo(0.45 * f.mix.en + 0.35 * f.mix.pl, -1.5, 0.6);
    add(d, Math.abs(d) >= 0.1 ? "feeling " + f.label : null);
  }
  // A short night (under 7 hours planned) costs energy.
  const slept = sleepHoursBefore(day);
  if (slept < 7) add(slept < 6 ? -0.75 : -0.4, `${Math.round(slept * 2) / 2} hr of sleep`);
  // Work drains her, and longer shifts drain more (8 hr = -0.75, 12 hr = -1.05).
  const shift = workHoursFor(day);
  if (shift) {
    const hrs = shiftMinutes(shift) / 60;
    add(-(0.15 + hrs * 0.075), `${Math.round(hrs * 2) / 2} hr workday`);
  } else add(0.25, "day off");

  const level = score >= 3.5 ? "high" : score >= 2.25 ? "medium" : "low";
  const earlyPeriod = !!(c && c.phase === "menstrual" && c.cycleDay <= 2);
  return { level, score, why, earlyPeriod, sick: !!(b && b.id === "sick") };
}

const ENERGY_TEXT = {
  high: { label: "High", emoji: "🔋", color: "#4cc38a", tip: "Great day for the heavy stuff." },
  medium: { label: "Medium", emoji: "🔋", color: "#f0c24a", tip: "Steady pace. Mix heavy and light jobs." },
  low: { label: "Low", emoji: "🪫", color: "#ef6a6a", tip: "Heavy jobs are on hold unless they're due." },
};

// How physical a task is: "light" | "medium" | "heavy".
const effortOf = t => t.effort || (kindOf(t) === "chore" ? "medium" : "light");

// Should this task wait for a better day? Never if it's due soon, important or scheduled.
function holdReason(t, day, energy) {
  if (t.done || t.time) return null;
  const urgent = (t.dueDate && daysBetween(day, t.dueDate) <= 1) || t.priority === "important";
  if (urgent) return null;
  if (energy.brainHold && energy.brainHold.has(t.id)) return BRAIN_HOLD;
  const effort = effortOf(t);
  if (effort === "heavy" && energy.earlyPeriod) return "Heavy job on an early period day";
  if (effort === "heavy" && energy.level === "low") return "Heavy job on a low-energy day";
  // Medium jobs only wait on really rough days, and quick ones (15 min or less) never do.
  if (effort === "medium" && (t.minutes || 15) > 15 && (energy.sick || energy.score < 1.25)) return "Too much for today";
  return null;
}

// Work drains her, so on a workday anything really physical (heavy, or medium and
// an hour or more) gets a burnout warning, even when it has to happen today.
function burnoutRisk(t, day) {
  if (t.done || !isWorkday(day) || kindOf(t) === "event") return null;
  const effort = effortOf(t), min = t.minutes || null;
  if (effort === "heavy") return { level: min && min >= 90 ? "high" : "medium", minutes: min };
  if (effort === "medium" && min && min >= 60) return { level: "medium", minutes: min };
  return null;
}

function nextDayOff(from) {
  for (let i = 1; i <= 7; i++) if (!isWorkday(addDays(from, i))) return addDays(from, i);
  return addDays(from, 1);
}

// Total minutes of physical jobs (medium/heavy) still to do on this day.
const physicalMinutes = list => list
  .filter(t => !t.done && kindOf(t) !== "event" && effortOf(t) !== "light")
  .reduce((s, t) => s + (minutesLeft(t) ?? 15), 0);      // (what's left of it, after finished steps)

// Next day (within a week) that suits a job of this effort.
function betterDayFor(t, from) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    const e = energyFor(d);
    if (!holdReason({ ...t, dueDate: null, priority: "normal" }, d, e) && (effortOf(t) !== "heavy" || e.level !== "low")) return d;
  }
  return addDays(from, 1);
}

// ---------- brain & body batteries ----------
// Two batteries instead of one energy number. 💪 Body: physical jobs and workouts (t.effort).
// 🧠 Brain: thinking, deciding, people, noise (t.brain: "light" | "medium" | "heavy").
// Cleaning a messy room is easy on the body but drains the brain. A physical day eats into
// her workout; a brain-heavy one into her will to do anything else at all.

// A first guess from the name, until she rates it herself (or rated one like it before).
// Lots: decisions, executive function, people, crowds. Easy: routine, autopilot jobs.
const BRAIN_LOTS = /\b(clean(ing|up)?\b.*((?<!bath)room|\b(closet|office|garage|desk|basement|attic|car|house)\b)|declutter|organi[sz]|sort(ing)?\b|tidy|put away|fil(e|es|ing)\b|paperwork|tax|bills?\b|budget|bank|insurance|e-?mails?\b|call|phone|appointment|schedul|plan(ning)?\b|apply|application|forms?\b|doctor|dentist|vet\b|meeting|interview|study|homework|essay|writ(e|ing)|research|pack(ing)?\b|unpack|return|refund|errands?\b|shop(ping)?\b|grocer|meal ?preps?)/i;
const BRAIN_EASY = /\b(dish(es|washer)?|laundry|fold|trash|garbage|recycl|vacuum|sweep|mop|wipe|water(ing)? (the )?plants|feed|litter|shower|bath|nap|rest|stretch|walk|make the bed|load|unload|play|games?|movie|tv|relax|chill)\b/i;
// Calendar events are time with people unless the name says otherwise.
const SOLO_EVENT = /\b(gym|workout|run|nap|rest|reminder|pay|due|trash|pick ?up|drop ?off|alarm|meds?|medicine|pills?)\b/i;
// Events that are mostly moving (a class, a game): some brain, and they use the body too.
const MOVING_EVENT = /\b(ballet|dance|dancing|yoga|pilates|barre|gym|workout|hike|hiking|climb|climbing|swim|swimming|run|soccer|volleyball|basketball|tennis|martial|karate|bjj|spin|zumba)\b/i;
// Body use for the batteries: calendar events come in as "light", so a moving one counts as medium.
const bodyEffortOf = t => (kindOf(t) === "event" && effortOf(t) === "light" && MOVING_EVENT.test(t.title || "") ? "medium" : effortOf(t));
const SOCIAL_QUIET = 15;           // minutes of quiet time she gets after being with people
const isSocial = t => !t.done && !t.deleted && kindOf(t) === "event" && !!t.time && !isWorkShift(t) &&
  !SOLO_EVENT.test(t.title || "");

function guessBrain(t) {
  const k = kindOf(t), title = t.title || "";
  if (k === "workout") return "light";
  if (k === "event") return isSocial({ ...t, done: false }) && !MOVING_EVENT.test(title) ? "heavy" : "medium";
  if (BRAIN_LOTS.test(title)) return "heavy";
  if (BRAIN_EASY.test(title)) return "light";
  return "medium";
}

// How she rated a task with this name before (rebuilt on each render).
let brainByName = null;
function rememberedBrain(t) {
  if (!brainByName) {
    brainByName = new Map();
    const rated = tasks.filter(o => o.brain && !o.deleted)
      .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
    for (const o of rated) brainByName.set(nameKey(o.title), o.brain);
  }
  return brainByName.get(nameKey(t.title)) || null;
}
const brainOf = t => t.brain || rememberedBrain(t) || guessBrain(t);
const BRAIN_LABEL = { light: "🪶 Easy", medium: "🌀 Some", heavy: "🧠 Lots" };

// Battery use per minute of each kind of job. A full battery is about 4 hours of the
// hardest kind (hard thinking, or heavy lifting).
const BRAIN_COST = { light: 0.2, medium: 0.6, heavy: 1 };
const BODY_COST = { light: 0.15, medium: 0.6, heavy: 1 };
const BATTERY_FULL = 240;
// Her job is mostly brain work: a shift drains the brain a lot and the body a little.
const WORK_BRAIN = 0.35, WORK_BODY = 0.08;     // battery per minute of work

// Both batteries for a day: what's spent (work so far + done jobs), what's still planned,
// and what's left after the plan (below 0 = more planned than she has).
function batteriesFor(day, list = tasksFor(day)) {
  const entry = moods[day] || {};
  const f = feelingOf(entry), b = bodyOf(entry), c = cycleInfo(day);
  const brain = { cap: BATTERY_FULL, why: [] }, body = { cap: BATTERY_FULL, why: [] };
  const scale = (bat, x, why) => { if (x && x !== 1) { bat.cap *= x; if (why && x < 1) bat.why.push(why); } };
  // Feelings: thinking room (Inspired, Focused up; Foggy, Burned Out down) and get-up-and-go.
  if (f) {
    scale(brain, clampTo(1 + 0.15 * f.mix.br + 0.04 * f.mix.pl, 0.55, 1.25), "feeling " + f.label);
    scale(body, clampTo(1 + 0.08 * f.mix.en, 0.8, 1.15), "feeling " + f.label);
  }
  if (b) scale(body, { energized: 1.15, good: 1.05, little_sore: 0.85, very_sore: 0.6, drained: 0.7, sick: 0.3 }[b.id], b.label.toLowerCase());
  if (b && (b.id === "drained" || b.id === "sick")) scale(brain, b.id === "sick" ? 0.6 : 0.8, b.label.toLowerCase());
  const slept = sleepHoursBefore(day);
  if (slept < 7) {
    const why = `${Math.round(slept * 2) / 2} hr of sleep`;
    scale(brain, slept < 6 ? 0.8 : 0.9, why);
    scale(body, slept < 6 ? 0.85 : 0.95, why);
  }
  if (c) {
    if (c.phase === "menstrual" && c.cycleDay <= 2) {
      scale(body, 0.7, `period day ${c.cycleDay}`);
      scale(brain, 0.85, `period day ${c.cycleDay}`);
    } else if (c.phase === "menstrual") scale(body, 0.9, `period day ${c.cycleDay}`);
    else if (c.phase === "follicular" || c.phase === "ovulation") { scale(brain, 1.05); scale(body, 1.05); }
    else if (c.cycleDay > (cycle.length || 28) - 5) scale(brain, 0.9, "PMS days");
  }

  // Work: all of it on past days, none yet on future ones, the part done so far today.
  const shift = workHoursFor(day);
  const workMin = shift ? shiftMinutes(shift) : 0;
  const tk = todayKey();
  let workDone = day < tk ? 1 : 0;
  if (day === tk && workMin) {
    const n = nowLocal();
    workDone = Math.min(1, workMinutesBetween(day, 0, n.getHours() * 60 + n.getMinutes()) / workMin);
  }
  brain.work = Math.min(brain.cap * 0.85, workMin * WORK_BRAIN);
  body.work = Math.min(body.cap * 0.5, workMin * WORK_BODY);

  for (const bat of [brain, body]) { bat.done = bat.work * workDone; bat.todo = bat.work * (1 - workDone); bat.workout = 0; }
  for (const t of list) {
    if (t.deleted || isWorkShift(t)) continue;
    const k = kindOf(t);
    if (k === "event" && (!t.time || atWork(day, t.time))) continue;   // all-day notes; work already counts
    const total = Math.max(t.minutes || 0, minutesLeft(t) || 0) || (k === "event" ? 30 : 15);
    const left = t.done ? 0 : Math.min(total, minutesLeft(t) ?? total);
    const bc = BRAIN_COST[brainOf(t)] * (isSocial({ ...t, done: false }) ? 1.25 : 1);
    const yc = BODY_COST[bodyEffortOf(t)];
    brain.done += (total - left) * bc; brain.todo += left * bc;
    body.done += (total - left) * yc; body.todo += left * yc;
    if (k === "workout") body.workout += left * yc;
  }
  for (const bat of [brain, body]) {
    bat.left = bat.cap - bat.done - bat.todo;
    bat.pctLeft = Math.round(100 * bat.left / bat.cap);           // after everything planned
    bat.pctNow = Math.round(100 * (bat.cap - bat.done) / bat.cap); // right now
  }
  return { brain, body };
}

// More brain planned than she has? The brain-heavy jobs that could move so it fits: not
// scheduled, not due within a day, not important. Optional ones and the biggest go first.
function brainOverflow(day, list, bats) {
  let over = -bats.brain.left;
  if (over <= 0 || day < todayKey()) return [];
  const urgent = t => (t.dueDate && daysBetween(day, t.dueDate) <= 1) || t.priority === "important";
  const cands = list
    .filter(t => !t.done && !t.deleted && !t.time && !urgent(t) && ["task", "chore"].includes(kindOf(t)) && brainOf(t) !== "light")
    .map(t => ({ t, cost: (minutesLeft(t) ?? t.minutes ?? 15) * BRAIN_COST[brainOf(t)] }))
    .sort((a, b) => (levelOf(b.t, day) === "optional") - (levelOf(a.t, day) === "optional") || b.cost - a.cost);
  const out = [];
  for (const c of cands) {
    if (over <= 0) break;
    out.push(c.t);
    over -= c.cost;
  }
  return out;
}

// What to do when the brain battery runs out (Settings): "suggest" or "auto" (move them herself).
const brainMode = () => (profile.brainEmpty === "auto" ? "auto" : "suggest");
const BRAIN_HOLD = "Brain battery's full today";

// The next day (within a week) with room in the brain battery for this job.
function brainRoomDay(t, from) {
  const cost = (minutesLeft(t) ?? t.minutes ?? 15) * BRAIN_COST[brainOf(t)];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i);
    if (batteriesFor(d).brain.left >= cost) return d;
  }
  return addDays(from, 1);
}

// Two brain-heavy jobs back to back are a lot: slip something easier between them.
function spreadBrain(list) {
  const rest = [...list], out = [];
  while (rest.length) {
    let i = 0;
    const prev = out[out.length - 1];
    if (prev && !prev.done && !rest[0].done && brainOf(prev) === "heavy" && brainOf(rest[0]) === "heavy") {
      const j = rest.findIndex(t => !t.done && brainOf(t) !== "heavy");
      if (j > 0) i = j;
    }
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// Her best thinking time: not the first 2 hours after she wakes, nor the last 2 before bed.
const BRAIN_WARMUP = 120, BRAIN_WINDDOWN = 120;
function brainWindow(day) {
  const w = awakeWindow(day);
  return { start: w.start + BRAIN_WARMUP, end: w.end - BRAIN_WINDDOWN };
}
const minToHHMM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;

// "early" / "late" when a brain-heavy job lands outside her thinking time (null = fine).
// Scheduled jobs go by their time; anytime jobs by the clock right now (today only).
function brainTiming(t, day) {
  if (t.done || brainOf(t) !== "heavy" || isWorkShift(t)) return null;
  const w = brainWindow(day);
  let m;
  if (t.time) m = toMin(t.time);
  else if (day === todayKey()) { const n = nowLocal(); m = n.getHours() * 60 + n.getMinutes(); }
  else return null;
  if (m < awakeWindow(day).start - 120) m += 24 * 60;     // the small hours belong to the night before
  if (m < w.start) return { when: "early", until: minToHHMM(w.start) };
  if (m >= w.end) return { when: "late" };
  return null;
}

// ---------- chaos meter ----------
// How much of her free time the day eats up (0-100). When she's exhausted or sore the
// same load feels heavier, so the meter fills faster.
const CHAOS_BOOST = {
  sick: [1.5, "you're sick"], drained: [1.4, "you're drained"], very_sore: [1.35, "you're very sore"],
  little_sore: [1.1, "you're a little sore"],
};
const CHAOS_LEVELS = [
  [25, "😌", "Calm"], [50, "🙂", "Busy"], [75, "😬", "Hectic"], [90, "🥵", "Frantic"], [101, "🤯", "Total chaos"],
];

function chaosFor(day, ft) {
  const entry = moods[day] || {};
  const f = feelingOf(entry), b = bodyOf(entry);
  // Strongest of her body / feelings boosts. Unpleasant or drained feelings make the same
  // day feel busier (Miserable about 1.3, Tired about 1.2, Anxious about 1.15).
  let boost = 1, reason = null;
  const hit = b && CHAOS_BOOST[b.id];
  if (hit) [boost, reason] = hit;
  if (f) {
    const fb = 1 + 0.09 * Math.max(0, -f.mix.pl) + 0.1 * Math.max(0, -f.mix.en);
    if (fb > boost + 0.01) [boost, reason] = [fb, "you're feeling " + f.label];
  }
  if (energyFor(day).earlyPeriod && boost < 1.25) { boost = 1.25; reason = "it's an early period day"; }
  let used;
  if (ft.planned <= 0) used = 0;
  else if (ft.total <= 0) used = 1.2;
  else used = ft.planned / ft.total;
  // A full day (all free time used) reads about 90; going over pins it at 100.
  const pct = Math.max(0, Math.min(100, Math.round(used * 90 * boost)));
  const [, emoji, label] = CHAOS_LEVELS.find(l => pct < l[0]);
  return { pct, emoji, label, boost, reason };
}

// ---------- body fine, heart not ----------
// Good body but a low mood: lead with movement and quick wins (both help mood),
// and leave long sit-down tasks for later.
function mindLowBodyOk(day) {
  const entry = moods[day] || {};
  const f = feelingOf(entry), b = bodyOf(entry);
  return !!(f && b && f.mix.pl <= -0.75 && f.mix.en < 0.5 && ["energized", "good", "little_sore"].includes(b.id));
}

function moodBoostScore(t) {
  if (t.done || t.time) return 0;                                  // scheduled things stay put
  const k = kindOf(t), mins = t.minutes || 15;
  if (k === "workout") return 3;                                   // movement lifts mood
  if (mins <= 15) return 2;                                        // quick wins build momentum
  if (k === "chore" && effortOf(t) !== "light") return 1;          // physical jobs clear the head
  if (k === "task" && mins >= 60 && effortOf(t) === "light") return -2;  // long sit-down thinking: later
  return 0;
}

// ---------- feelings reorder the day ----------
// From her feelings (averaged): which ways of ordering the list help today.
//   move   Annoyed, Anxious, Restless…: physical jobs and movement first, thinking jobs later
//   quick  Anxious, Overwhelmed, Foggy…: quick easy wins first, to get going
//   brainy Inspired, Focused, Curious…: brain-heavy work first, while her head is clear
function moodOrderOf(day) {
  const f = feelingOf(moods[day] || {});
  if (!f) return null;
  const o = { move: f.mix.mv >= 1, quick: f.mix.qw >= 1, brainy: f.mix.br >= 1 && !(f.mix.mv >= 1), words: f.label };
  return o.move || o.quick || o.brainy ? o : null;
}
const annoyedDay = day => { const o = moodOrderOf(day); return !!(o && o.move); };

function quickWinScore(t) {
  if (t.done || t.time) return 0;
  const mins = minutesLeft(t) ?? t.minutes ?? 15;
  if (mins <= 15) return 2;
  if (mins <= 30) return 1;
  return mins >= 60 ? -1 : 0;
}

function moodOrderScore(t, day, o = moodOrderOf(day)) {
  if (!o || t.done || t.time) return 0;
  let s = 0;
  if (o.move) s += burnOffScore(t, day);
  if (o.quick) s += quickWinScore(t);
  if (o.brainy) s += { light: 0, medium: 1, heavy: 2 }[brainOf(t)];
  return s;
}

function burnOffScore(t, day) {
  if (t.done || t.time) return 0;                                  // scheduled things stay put
  const b = bodyOf(moods[day] || {});
  const bodyOk = !b || ["energized", "good", "little_sore"].includes(b.id);
  const k = kindOf(t), effort = effortOf(t);
  let s = 0;
  if (bodyOk && k === "workout") s += 3;                           // the best outlet there is
  else if (bodyOk && (k === "chore" || effort !== "light")) s += effort === "light" ? 1 : 2;
  return s - { light: 0, medium: 1, heavy: 2 }[brainOf(t)];        // thinking jobs: later
}

// ---------- recovery days ----------
const RECOVERY_IDEAS = {
  sore: [
    { id: "stretch", text: "10 minutes of gentle stretching" },
    { id: "bath", text: "Warm bath or long shower" },
    { id: "heat", text: "Heat pack on the sore spots" },
  ],
  tired: [
    { id: "nap", text: "Rest with your feet up for 20 minutes" },
    { id: "early", text: "Early night tonight, phone down by 10" },
    { id: "meal", text: "Eat a real meal, not just snacks" },
  ],
  sick: [
    { id: "fluids", text: "Fluids all day: water, tea, broth" },
    { id: "blanket", text: "Couch, blanket, a comfort show" },
    { id: "skip", text: "Skip anything that isn't urgent" },
  ],
  mood: [
    { id: "outside", text: "Step outside for 5 minutes of fresh air" },
    { id: "text", text: "Text someone who makes you smile" },
    { id: "small", text: "Do one small thing, then rest" },
  ],
  period: [
    { id: "heatpad", text: "Heating pad + cozy spot" },
    { id: "iron", text: "An iron-rich snack (and some chocolate)" },
    { id: "gentle", text: "Gentle walk or stretch if you feel up to it" },
  ],
  always: [{ id: "water", text: "Drink a big glass of water" }],
};

// Bad day = low mood, a hurting body, or the first heavy days of a period.
function recoveryFor(day) {
  const entry = moods[day] || {};
  const f = feelingOf(entry), b = bodyOf(entry), c = cycleInfo(day);
  const reasons = [];
  const groups = [];
  if (b && ["very_sore"].includes(b.id)) { reasons.push("your body is very sore"); groups.push("sore"); }
  if (b && b.id === "sick") { reasons.push("you're not feeling well"); groups.push("sick"); }
  if ((b && b.id === "drained") || (f && f.mix.en <= -1.25)) { reasons.push("you're running low on energy"); groups.push("tired"); }
  if (f && f.mix.pl <= -1) { reasons.push("it's a hard day"); groups.push("mood"); }
  const onPeriod = entry.period === true || (c && c.phase === "menstrual" && !c.projected);
  // Early period days count too, unless she's told us she feels good anyway.
  const feelsGood = (f && f.mix.pl >= 1 && f.mix.en >= 0) || (b && (b.id === "energized" || b.id === "good"));
  if (onPeriod && c && c.cycleDay <= 2 && !feelsGood) { reasons.push("it's an early period day"); groups.push("period"); }
  if (!reasons.length) return null;
  const ideas = [];
  for (const g of groups) for (const i of RECOVERY_IDEAS[g].slice(0, groups.length > 1 ? 2 : 3)) if (!ideas.some(x => x.id === i.id)) ideas.push(i);
  ideas.push(...RECOVERY_IDEAS.always);
  return { reasons, ideas: ideas.slice(0, 5) };
}
