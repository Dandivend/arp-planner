// Fitness: goals, a workout library, a weekly plan, and the daily
// "Physical activity ideas" side panel. Plans adapt to the energy forecast
// (cycle, body, feelings, workday) from wellness.js.

const GOALS = [
  { id: "flexible", emoji: "🧘", label: "Get very flexible", cats: ["flexibility"] },
  { id: "primal", emoji: "🐾", label: "Primal movement", cats: ["primal"] },
  { id: "strength", emoji: "💪", label: "Build muscle & strength", cats: ["strength"] },
  { id: "weight", emoji: "🔥", label: "Lose weight", cats: ["cardio", "strength"] },
  { id: "cardio", emoji: "❤️", label: "Heart health & stamina", cats: ["cardio"] },
  { id: "pt", emoji: "🎖️", label: "Pass a PT test", cats: ["pt"] },
];
// Air Force fitness test events (2026): one cardio, one strength and one core event.
const PT_EVENTS = [
  { id: "run", group: "Cardio", label: "🏃 2-mile run" },
  { id: "hamr", group: "Cardio", label: "🔁 HAMR shuttle (20 m)" },
  { id: "pushups", group: "Strength", label: "💪 Push-ups (1 min)" },
  { id: "hrpu", group: "Strength", label: "✋ Hand-release push-ups (2 min)" },
  { id: "situps", group: "Core", label: "🙆 Sit-ups (1 min)" },
  { id: "clrc", group: "Core", label: "🦵 Cross-leg reverse crunch (2 min)" },
  { id: "plank", group: "Core", label: "🧱 Forearm plank" },
];
const PT_GROUPS = ["Cardio", "Strength", "Core"];
const FAVORITE_MOVES = [
  { id: "primal_crawl", label: "🐾 Primal crawls" }, { id: "primal_squat", label: "🦍 Primal squats" },
  { id: "stretch", label: "🧘 Stretch training" }, { id: "splits", label: "🤸 Splits" },
  { id: "yoga", label: "🌙 Yoga flow" }, { id: "pushups", label: "💪 Push-ups" },
  { id: "glutes", label: "🍑 Glutes" }, { id: "walk", label: "🚶 Walks" }, { id: "run", label: "🏃 Running" },
];
const CAT_INFO = {
  pt: { label: "PT test prep", emoji: "🎖️" },
  strength: { label: "Strength", emoji: "💪" },
  cardio: { label: "Cardio", emoji: "❤️" },
  flexibility: { label: "Stretch & flexibility", emoji: "🧘" },
  primal: { label: "Primal movement", emoji: "🐾" },
};
// What she told us she loves, used until she changes it in the Fitness tab.
const DEFAULT_PROFILE = {
  goals: ["flexible", "primal"], favorites: ["primal_crawl", "primal_squat", "stretch"],
  sessionsPerWeek: 4, sessionMinutes: 20, ptTest: { date: null, events: ["pushups", "situps", "run"] },
};
const prof = key => (profile[key] !== undefined ? profile[key] : DEFAULT_PROFILE[key]);

// ---------- workout library ----------
// intensity: light | moderate | hard. tags link to favorite moves.
const WORKOUTS = {
  pt: {
    hard: [
      { id: "pt-mock", title: "PT test run-through", minutes: 30, tags: ["pushups", "situps", "run"], moves: [
        "Warm up: 5 min easy jog + arm circles", "Max push-ups in 1 min (good form!)", "Rest 2 min",
        "Max sit-ups in 1 min", "Rest 3 min", "Timed run, or 6 × 2 min hard / 1 min walk", "Cool down: walk + stretch"] },
      { id: "pt-pyramid", title: "Push-up & sit-up pyramid", minutes: 25, tags: ["pushups", "situps"], moves: [
        "Pyramid 1-2-3-4-5-6-5-4-3-2-1 push-ups", "Same pyramid of sit-ups in between", "Rest as needed, keep form tight",
        "Finish: 3 × 30 s plank"] },
      { id: "pt-hamr", title: "HAMR shuttle practice", minutes: 25, tags: ["hamr"], moves: [
        "Mark two lines 20 m apart (about 22 big steps)", "Warm up: 5 min easy jog + leg swings",
        "Play a HAMR beep track and shuttle until you miss 2 beeps. Note your shuttle count!",
        "Rest 3 min", "6 × (1 min fast shuttles / 1 min walk)", "Cool down: walk + calf and hip stretches"] },
      { id: "pt-2min", title: "2-minute test simulation", minutes: 25, tags: ["hrpu", "clrc"], moves: [
        "Warm up: 5 min (arm circles, glute bridges, easy crunches)",
        "Hand-release push-ups for 2 min: chest to the floor, lift hands, press back up. Pace it, don't sprint",
        "Rest 3 min", "Cross-leg reverse crunches for 2 min: steady rhythm, breathe out on the way up",
        "Rest 2 min, then one more round at ~60% effort", "Stretch chest, shoulders and hip flexors"] },
    ],
    moderate: [
      { id: "pt-shuttles", title: "Shuttle intervals", minutes: 20, tags: ["hamr", "run"], moves: [
        "Mark two lines 20 m apart", "5 min easy jog warm-up",
        "10 rounds: 2 fast shuttles (there and back), then 30 s walk",
        "Practice quick turns: plant, touch the line, push off", "5 min walk cool-down"] },
      { id: "pt-hrpu", title: "Hand-release push-up builder", minutes: 15, tags: ["hrpu", "pushups"], moves: [
        "5 sets of 6–10 hand-release push-ups (from the knees is fine), 60 s rest",
        "Last set: lower slowly over 3 seconds", "Finish: 3 × 20 s high plank, shoulders over wrists"] },
      { id: "pt-core", title: "Reverse-crunch core builder", minutes: 15, tags: ["clrc", "situps", "plank"], moves: [
        "4 rounds, 45 s rest between:", "15 cross-leg reverse crunches", "30 s forearm plank", "10 dead bugs per side"] },
      { id: "pt-run2", title: "2-mile pace run", minutes: 30, tags: ["run"], moves: [
        "5 min easy jog warm-up", "4 × 800 m (or 4 min) at goal 2-mile pace, 2 min walk between",
        "5 min easy jog cool-down"] },
      { id: "pt-ladder", title: "15-min push-up & sit-up ladder", minutes: 15, tags: ["pushups", "situps"], moves: [
        "Every minute on the minute: push-ups (start at 5, add 1 each round)", "Odd minutes: 10–15 sit-ups",
        "Stop when form breaks. Note your top number!"] },
      { id: "pt-intervals", title: "Run intervals", minutes: 20, tags: ["run"], moves: [
        "5 min brisk walk warm-up", "6 × (1 min fast run / 1½ min walk)", "5 min easy walk cool-down"] },
      { id: "pt-groove", title: "Grease the groove", minutes: 10, tags: ["pushups"], moves: [
        "5 mini sets spread through the day", "Each set: about half your max push-ups + 15 sit-ups",
        "Never to failure, it's practice"] },
    ],
    light: [
      { id: "pt-form", title: "Form practice", minutes: 10, tags: ["pushups", "situps"], moves: [
        "3 × 5 slow push-ups (knees are fine)", "3 × 10 slow sit-ups", "10 min easy walk"] },
      { id: "pt-form2", title: "New-event form practice", minutes: 10, tags: ["hrpu", "clrc", "plank"], moves: [
        "3 × 5 slow hand-release push-ups (knees are fine)", "3 × 8 slow cross-leg reverse crunches",
        "2 × 20 s forearm plank", "A few easy 20 m shuttles at walking pace to practice the turns"] },
    ],
  },
  strength: {
    hard: [
      { id: "str-full", title: "Full-body strength circuit", minutes: 30, tags: ["primal_squat", "pushups", "glutes"], moves: [
        "4 rounds:", "12 squats (try a deep primal squat at the bottom)", "8–10 push-ups", "10 reverse lunges per leg",
        "15 glute bridges", "30 s plank", "Rest 1 min between rounds"] },
      { id: "str-legs", title: "Legs & glutes burner", minutes: 25, tags: ["glutes", "primal_squat"], moves: [
        "4 rounds: 15 squats, 12 split squats per leg, 20 glute bridges, 10 single-leg deadlifts per leg",
        "Finish: 60 s primal squat hold"] },
    ],
    moderate: [
      { id: "str-core", title: "Lower body + core", minutes: 20, tags: ["glutes"], moves: [
        "3 rounds:", "15 bodyweight squats", "10 lunges per leg", "15 glute bridges", "10 dead bugs per side", "20 s side plank each side"] },
      { id: "str-upper", title: "Upper body & posture", minutes: 20, tags: ["pushups"], moves: [
        "3 rounds:", "8 push-ups (incline is fine)", "12 band or towel rows", "10 pike shoulder taps", "12 superman holds"] },
    ],
    light: [
      { id: "str-gentle", title: "Gentle strength", minutes: 15, tags: ["glutes"], moves: [
        "2 × 10 wall push-ups", "2 × 10 sit-to-stand from a chair", "2 × 8 bird dogs per side", "2 × 12 glute bridges"] },
    ],
  },
  cardio: {
    hard: [
      { id: "car-hiit", title: "HIIT 20", minutes: 20, tags: ["run"], moves: [
        "40 s on / 20 s off, 4 rounds of:", "Jumping jacks", "Mountain climbers", "Squat jumps (or fast squats)",
        "High knees", "Burpees (step back if needed)"] },
      { id: "car-run", title: "Tempo run", minutes: 30, tags: ["run"], moves: [
        "5 min easy warm-up", "20 min at a 'comfortably hard' pace", "5 min walk cool-down"] },
    ],
    moderate: [
      { id: "car-walk", title: "Brisk walk or bike", minutes: 30, tags: ["walk"], moves: [
        "30 min at a pace where talking is a little hard", "Bonus: find a hill"] },
      { id: "car-dance", title: "Dance cardio", minutes: 20, tags: [], moves: [
        "Put on 5 favorite songs", "Move the whole time. Nobody's watching!"] },
    ],
    light: [
      { id: "car-easy", title: "Easy walk outside", minutes: 20, tags: ["walk"], moves: [
        "20 min relaxed walk", "Fresh air + daylight do wonders for energy"] },
    ],
  },
  flexibility: {
    hard: [
      { id: "flex-deep", title: "Deep flexibility session", minutes: 30, tags: ["stretch", "splits"], moves: [
        "5 min warm-up: jumping jacks or a brisk walk", "Front split progression: 3 × 45 s per side",
        "Pancake (wide seated straddle) fold: 3 × 45 s", "Pigeon pose: 90 s per side",
        "PNF hamstrings: push 5 s, relax and sink deeper, × 3 per leg", "Bridge or wheel: 3 × 15 s"] },
    ],
    moderate: [
      { id: "flex-stretch", title: "Stretch training", minutes: 20, tags: ["stretch", "splits"], moves: [
        "Hamstring PNF: contract 5 s, relax deeper, × 3 per leg", "Low-lunge hip-flexor stretch: 60 s per side",
        "Butterfly: 60 s, gently press knees", "Thoracic opener on the floor: 10 reps", "Shoulder dislocates with a towel: 10 reps",
        "Half splits: 45 s per side"] },
      { id: "flex-yoga", title: "Yoga flow for flexibility", minutes: 20, tags: ["yoga", "stretch"], moves: [
        "3 sun salutations", "Lizard pose 45 s per side", "Triangle 30 s per side", "Seated forward fold 60 s", "Happy baby 60 s"] },
    ],
    light: [
      { id: "flex-gentle", title: "Gentle stretch flow", minutes: 10, tags: ["stretch", "yoga"], moves: [
        "Cat-cow × 10", "Child's pose 60 s", "Supine twist 45 s per side", "Legs up the wall 2 min", "Slow neck rolls"] },
    ],
  },
  primal: {
    hard: [
      { id: "pri-flow", title: "Primal flow", minutes: 20, tags: ["primal_crawl", "primal_squat"], moves: [
        "Beast crawl forward and back: 4 × 30 s", "Crab reach: 3 × 8 per side", "Primal squat hold: 4 × 45 s, sway side to side",
        "Lizard crawl: 3 × 20 s", "Ape walk side to side: 3 × 30 s"] },
    ],
    moderate: [
      { id: "pri-crawl", title: "Primal crawls & squats", minutes: 15, tags: ["primal_crawl", "primal_squat"], moves: [
        "3 rounds:", "30 s bear/beast crawl", "45 s primal (deep) squat hold, heels down", "8 crab reaches",
        "30 s crab walk", "Rest 45 s"] },
    ],
    light: [
      { id: "pri-snack", title: "Primal squat & crawl snack", minutes: 8, tags: ["primal_squat", "primal_crawl"], moves: [
        "3 × 60 s primal squat hold (hold a doorframe if needed)", "2 × 30 s slow crawl", "10 hip circles each way"] },
    ],
  },
};

// ---------- planning ----------
const INTENSITY_OF = { high: "hard", medium: "moderate", low: "light" };
const EFFORT_OF = { hard: "heavy", moderate: "medium", light: "light" };
const INTENSITY_LABEL = { hard: "Hard", moderate: "Moderate", light: "Easy" };

function goalCats() {
  const cats = [];
  for (const g of GOALS) if (prof("goals").includes(g.id)) for (const c of g.cats) if (!cats.includes(c)) cats.push(c);
  return cats;
}

function ptDaysLeft(day) {
  const pt = prof("ptTest");
  if (!prof("goals").includes("pt") || !pt || !pt.date) return null;
  return daysBetween(day, pt.date);
}

// Which days this week get a main workout: the best-energy days, days off preferred.
function weekPlan(anyDay) {
  const start = addDays(anyDay, -fromKey(anyDay).getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scored = days.map(d => {
    const e = energyFor(d);
    const left = ptDaysLeft(d);
    let s = e.score + (isWorkday(d) ? 0 : 0.5);
    if (left === 1) s = -99;              // rest the day before the PT test
    if (left === 0) s = 99;               // test day is a "workout" (the test!)
    if (e.sick) s = -99;
    return { d, s };
  });
  const n = Math.min(7, prof("sessionsPerWeek") || 4);
  const chosen = new Set(scored.filter(x => x.s > -50).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.d));
  const cats = goalCats();
  const ptSoon = d => { const l = ptDaysLeft(d); return l !== null && l >= 0 && l <= 42; };
  let i = 0;
  return days.map(d => {
    if (!chosen.has(d) || !cats.length) return { day: d, cat: null };
    let cat = cats[i % cats.length];
    if (ptSoon(d) && i % 2 === 0) cat = "pt";   // PT prep every other session as the test nears
    i++;
    return { day: d, cat };
  });
}

function pickWorkout(cat, intensity, day, salt) {
  let pool = WORKOUTS[cat][intensity] || WORKOUTS[cat].light;
  if (cat === "pt") {
    // Train for the events she'll actually be tested on.
    const events = (prof("ptTest") || {}).events || [];
    const mine = pool.filter(w => w.id === "pt-mock" || w.tags.some(t => events.includes(t)));
    if (mine.length) pool = mine;
  }
  // Prefer workouts that fit her usual session length (when any do).
  const fits = pool.filter(w => w.minutes <= (prof("sessionMinutes") || 20) + 5);
  if (fits.length) pool = fits;
  if (cat === "pt" && pool.some(w => w.id === "pt-mock")) {
    pool = pool.map(w => (w.id === "pt-mock" ? { ...w, moves: ptMockMoves() } : w));
  }
  const favs = prof("favorites");
  const liked = pool.filter(w => w.tags.some(t => favs.includes(t)));
  const from = liked.length && seeded(day, salt + "fav") < 0.7 ? liked : pool;
  return { ...pickFor(from, day, salt), cat, intensity };
}

// A full test run-through in the order of the real test, for the events she picked.
function ptMockMoves() {
  const ev = new Set((prof("ptTest") || {}).events || []);
  const strength = ev.has("hrpu") ? "Hand-release push-ups: 2 min, steady pace" : "Max push-ups in 1 min (good form!)";
  const core = ev.has("clrc") ? "Cross-leg reverse crunches: 2 min"
    : ev.has("plank") && !ev.has("situps") ? "Forearm plank: hold as long as you can with good form"
    : "Max sit-ups in 1 min";
  const cardio = ev.has("hamr") && !ev.has("run") ? "HAMR: shuttle 20 m to the beeps until you miss 2 (or 8 × 1 min fast shuttles)"
    : "2-mile run at test pace (or 6 × 2 min hard / 1 min walk)";
  return ["Warm up: 5 min easy jog + arm circles", strength, "Rest 2–3 min", core, "Rest 3 min", cardio,
    "Cool down: walk + stretch"];
}

// Up to three ideas for a day: the main workout plus stretch / primal add-ons.
function ideasFor(day) {
  const e = energyFor(day);
  if (e.sick) return { note: "Rest is your workout today 🛌 Get better first.", ideas: [] };
  let intensity = INTENSITY_OF[e.level];
  if (e.earlyPeriod) intensity = "light";
  const left = ptDaysLeft(day);
  if (left !== null && left > 0 && left <= 3) intensity = "light";   // taper before the test

  // 💪 Body battery: physical chores already spend some of today's workout.
  let bodyNote = "";
  const bats = batteriesFor(day, tasksFor(day).filter(t => !holdReason(t, day, e)));
  const bodyLeft = (bats.body.left + bats.body.workout) / bats.body.cap;      // after jobs, before workouts
  if (bodyLeft < 0.15) {
    intensity = "light";
    bodyNote = " Your physical jobs are your workout today 💪 so just a gentle stretch, if anything.";
  } else if (bodyLeft < 0.35 && intensity !== "light") {
    intensity = intensity === "hard" ? "moderate" : "light";
    bodyNote = " Lots of physical jobs today, so it's a lighter one 💪";
  }
  if (bats.brain.pctLeft < 25 && bodyLeft >= 0.35) bodyNote += " Your brain's had a lot today: an easy walk is a great way to let it reset 🧠";

  const plan = weekPlan(day).find(p => p.day === day);
  const ideas = [];
  let note;
  if (left === 0) {
    note = "🎖️ PT test day! Warm up for 10 minutes, breathe, and trust your training. You've got this!";
  } else if (left === 1) {
    note = "PT test tomorrow. Rest day! Just a gentle stretch, good food and early sleep.";
  } else if (plan && plan.cat) {
    ideas.push(pickWorkout(plan.cat, intensity, day, "main"));
    note = `${CAT_INFO[plan.cat].emoji} ${CAT_INFO[plan.cat].label} day · ${INTENSITY_LABEL[intensity].toLowerCase()} to match your energy.`;
  } else {
    note = "Rest day. Keep it light: stretch and move gently.";
  }
  if (e.earlyPeriod) note += " Period day: gentle movement only.";
  if (left !== 0 && left !== 1) note += bodyNote;
  if (mindLowBodyOk(day)) note += " Moving is one of the best mood-lifters there is. Even 10 minutes helps 💛";
  else if (annoyedDay(day)) note += " Annoyed? A workout is a great way to burn it off 🔥";

  const favs = prof("favorites"), goals = prof("goals");
  const addonIntensity = intensity === "hard" ? "moderate" : "light";
  const mainCat = ideas[0] && ideas[0].cat;
  if ((goals.includes("flexible") || favs.includes("stretch")) && mainCat !== "flexibility") {
    ideas.push(pickWorkout("flexibility", plan && plan.cat ? "light" : addonIntensity, day, "flex"));
  }
  if ((goals.includes("primal") || favs.some(f => f.startsWith("primal"))) && mainCat !== "primal") {
    ideas.push(pickWorkout("primal", "light", day, "primal"));
  }
  return { note, ideas: ideas.slice(0, 3), energy: e };
}

async function addWorkoutToDay(w, day) {
  await persist({
    id: newId(), date: day, time: null, done: false, createdAt: new Date().toISOString(), external: {},
    kind: "workout", title: `${CAT_INFO[w.cat].emoji} ${w.title}`, notes: w.moves.join("\n"),
    priority: "normal", dueDate: null, minutes: w.minutes, area: null,
    effort: EFFORT_OF[w.intensity], workout: w.id,
  });
  warnIfOverloaded(day);
}

// ---------- change workout ----------
// Swap a workout task for another one: today's suggestions first, then everything
// in her goal categories, then the rest of the library.
let swapping = null;

function openSwap(t) {
  swapping = t;
  $("swap-current").textContent = `Swapping out: ${t.title}`;
  const list = $("swap-list");
  list.innerHTML = "";
  const tk = t.date;
  const all = [];
  for (const [cat, levels] of Object.entries(WORKOUTS)) {
    for (const [intensity, pool] of Object.entries(levels)) for (const w of pool) all.push({ ...w, cat, intensity });
  }
  const suggested = ideasFor(tk).ideas.filter(w => w.id !== t.workout);
  const cats = goalCats();
  const groups = [
    ["✨ Suggested for today", suggested],
    ...Object.keys(WORKOUTS).sort((a, b) => (cats.includes(b) - cats.includes(a)))
      .map(cat => [`${CAT_INFO[cat].emoji} ${CAT_INFO[cat].label}`, all.filter(w => w.cat === cat && w.id !== t.workout)]),
  ];
  const order = { light: 0, moderate: 1, hard: 2 };
  for (const [label, items] of groups) {
    if (!items.length) continue;
    list.appendChild(el("div", "swap-group", label));
    for (const w of [...items].sort((a, b) => order[a.intensity] - order[b.intensity])) {
      const b = el("button", "swap-item");
      b.append(el("span", "swap-title", w.title), el("span", "swap-min", `${w.minutes} min`),
        el("span", "idea-badge i-" + w.intensity, INTENSITY_LABEL[w.intensity]));
      b.title = w.moves.join("\n");
      b.addEventListener("click", () => swapTo(w));
      list.appendChild(b);
    }
  }
  $("swap-dialog").showModal();
}

async function swapTo(w) {
  const t = swapping;
  $("swap-dialog").close();
  if (!t) return;
  await persist({
    ...t, title: `${CAT_INFO[w.cat].emoji} ${w.title}`, notes: w.moves.join("\n"),
    minutes: w.minutes, effort: EFFORT_OF[w.intensity], workout: w.id,
  });
  showToast(`🔄 Swapped to ${w.title}`);
}

$("swap-cancel").addEventListener("click", () => $("swap-dialog").close());

// ---------- side panel ----------
function renderSidebar() {
  const box = $("activity-ideas");
  box.innerHTML = "";
  const { note, ideas } = ideasFor(currentDay);
  const left = ptDaysLeft(currentDay);
  if (left !== null && left > 0) box.appendChild(el("div", "pt-chip", `🎖️ PT test in ${plural(left, "day")}`));
  box.appendChild(el("p", "side-note", note));

  for (const w of ideas) {
    const card = el("div", "idea");
    const head = el("div", "idea-head");
    head.append(el("span", "idea-title", w.title), el("span", "idea-badge i-" + w.intensity, INTENSITY_LABEL[w.intensity]));
    card.appendChild(head);
    card.appendChild(el("div", "idea-meta", `${CAT_INFO[w.cat].emoji} ${CAT_INFO[w.cat].label} · ⏱ ${w.minutes} min`));
    // Keep cards short: first 3 moves, the full list on hover (and in the task once added).
    const ul = el("ul", "idea-moves");
    for (const m of w.moves.slice(0, 3)) ul.appendChild(el("li", "", m));
    if (w.moves.length > 3) ul.appendChild(el("li", "more-moves", `…and ${w.moves.length - 3} more`));
    card.title = w.moves.join("\n");
    card.appendChild(ul);
    const already = tasks.some(t => !t.deleted && t.date === currentDay && t.workout === w.id);
    const btn = el("button", "idea-add" + (already ? " added" : ""), already ? "✓ On your list" : "+ Add to my day");
    btn.disabled = already;
    btn.addEventListener("click", () => addWorkoutToDay(w, currentDay));
    card.appendChild(btn);
    box.appendChild(card);
  }
  if (!prof("goals").length) {
    const b = el("button", "link-btn", "Set up your fitness goals ›");
    b.addEventListener("click", () => openSettingsSection("fitness-goals"));
    box.appendChild(b);
  }
}

// ---------- Fitness tab ----------
async function saveProfile(changes) {
  profile = { ...DEFAULT_PROFILE, ...profile, ...changes };
  render();
  try {
    await pushProfile();
  } catch {
    showError("Couldn't save your settings. Try closing and reopening the planner.");
  }
}

function chip(label, on, onClick) {
  const b = el("button", "chip-btn" + (on ? " on" : ""), label);
  b.addEventListener("click", onClick);
  return b;
}

function renderFitness() {
  const goals = prof("goals");
  const grid = $("fitness-goals");
  grid.innerHTML = "";
  for (const g of GOALS) {
    const on = goals.includes(g.id);
    const b = el("button", "goal" + (on ? " on" : ""));
    b.append(el("span", "goal-emoji", g.emoji), el("span", "goal-label", g.label), el("span", "goal-check", on ? "✓" : ""));
    b.addEventListener("click", () => saveProfile({ goals: on ? goals.filter(x => x !== g.id) : [...goals, g.id] }));
    grid.appendChild(b);
  }

  const pt = prof("ptTest") || { date: null, events: [] };
  $("pt-box").hidden = !goals.includes("pt");
  $("pt-date").value = pt.date || "";
  const left = ptDaysLeft(todayKey());
  $("pt-countdown").textContent = left === null ? "" : left > 0 ? `${plural(left, "day")} to go 💪` : left === 0 ? "It's today! 🎖️" : "Done! Set the next one?";
  const ev = $("pt-events");
  ev.innerHTML = "";
  ev.appendChild(el("span", "fit-label", "On the test (one of each)"));
  for (const group of PT_GROUPS) {
    const row = el("div", "pt-group");
    row.appendChild(el("span", "pt-group-name", group));
    for (const e of PT_EVENTS.filter(x => x.group === group)) {
      const on = (pt.events || []).includes(e.id);
      row.appendChild(chip(e.label, on, () => saveProfile({ ptTest: { ...pt,
        events: on ? pt.events.filter(x => x !== e.id) : [...(pt.events || []), e.id] } })));
    }
    ev.appendChild(row);
  }

  renderWorkHours();
  renderSleep();
  const ses = $("sessions");
  if (!ses.options.length) {
    for (let n = 1; n <= 7; n++) ses.add(new Option(n + (n === 1 ? " day" : " days"), n));
    for (const m of [10, 15, 20, 30, 45, 60]) $("session-min").add(new Option(m + " min", m));
  }
  ses.value = String(prof("sessionsPerWeek"));
  $("session-min").value = String(prof("sessionMinutes"));

  const favBox = $("favorites");
  favBox.innerHTML = "";
  const favs = prof("favorites");
  for (const f of FAVORITE_MOVES) {
    const on = favs.includes(f.id);
    favBox.appendChild(chip(f.label, on, () => saveProfile({ favorites: on ? favs.filter(x => x !== f.id) : [...favs, f.id] })));
  }
}

// ---------- Settings: work schedule ----------
function currentWorkHours() {
  const out = {};
  for (let i = 0; i < 7; i++) out[i] = settingsShiftFor(addDays("2024-01-07", i));   // 2024-01-07 is a Sunday
  return out;
}

function saveWorkHours(hours) {
  const workdays = Object.keys(hours).filter(k => hours[k]).map(Number);
  saveProfile({ workHours: hours, workdays });
}

// A time dropdown in 30-minute steps (shared by the work and sleep schedules).
function timeSelect(value, onChange) {
  const s = el("select");
  for (let m = 0; m < 24 * 60; m += 30) {
    const v = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    s.add(new Option(formatTime(v), v));
  }
  if (![...s.options].some(o => o.value === value)) s.add(new Option(formatTime(value), value));
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

// ---------- Settings: sleep schedule ----------
function renderSleep() {
  const box = $("sleep-hours");
  box.innerHTML = "";
  const sleep = {};
  for (let i = 0; i < 7; i++) sleep[i] = sleepFor(addDays("2024-01-07", i));   // a Sunday
  const save = next => saveProfile({ sleep: next });

  for (let i = 0; i < 7; i++) {
    const s = sleep[i];
    const dayName = new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: "long" });
    const row = el("div", "wh-row on");
    row.appendChild(el("span", "wh-day", dayName));
    const times = el("span", "wh-times");
    // That night's sleep: tonight's bedtime -> the NEXT day's wake-up (shown, so it's clear
    // why changing tomorrow's wake-up time changes this row's hours).
    const next = (i + 1) % 7;
    let night = toMin(sleep[next].wake) - toMin(s.bed);
    if (night <= 0) night += 24 * 60;
    const hrs = Math.round(night / 30) / 2;
    const nextName = new Date(2024, 0, 7 + next).toLocaleDateString(undefined, { weekday: "short" });
    const len = el("span", "wh-len" + (hrs < 7 ? " short" : ""),
      `→ ${hrs} hr till ${nextName} ${formatTime(sleep[next].wake)}${hrs < 7 ? " ⚠️" : ""}`);
    len.title = `Sleep the night of ${dayName}: bed at ${formatTime(s.bed)}, up ${nextName} at ${formatTime(sleep[next].wake)}` +
      (hrs < 7 ? ". That's a bit short: under 7 hours lowers your energy forecast." : "");
    times.append(
      el("span", "wh-to", "☀️ Up at"), timeSelect(s.wake, v => save({ ...sleep, [i]: { ...s, wake: v } })),
      el("span", "wh-to", "🌙 Bed at"), timeSelect(s.bed, v => save({ ...sleep, [i]: { ...s, bed: v } })),
      len,
    );
    row.appendChild(times);
    box.appendChild(row);
  }
  const first = sleep[1];
  const copy = el("button", "link-btn", `Use up at ${formatTime(first.wake)}, bed at ${formatTime(first.bed)} for every day`);
  copy.addEventListener("click", () => {
    const next = {};
    for (let i = 0; i < 7; i++) next[i] = { ...first };
    save(next);
  });
  box.appendChild(copy);
}

function renderWorkHours() {
  const box = $("work-hours");
  box.innerHTML = "";
  const hours = currentWorkHours();

  for (let i = 0; i < 7; i++) {
    const dayName = new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: "long" });
    const shift = hours[i];
    const row = el("div", "wh-row" + (shift ? " on" : ""));
    row.appendChild(el("span", "wh-day", dayName));
    const toggle = el("button", "wh-toggle" + (shift ? " on" : ""), shift ? "💼 Work" : "🌙 Off");
    toggle.title = shift ? "Make this a day off" : "Make this a workday";
    toggle.addEventListener("click", () => saveWorkHours({ ...hours, [i]: shift ? null : { ...DEFAULT_SHIFT } }));
    row.appendChild(toggle);
    if (shift) {
      const times = el("span", "wh-times");
      times.append(
        timeSelect(shift.start, v => saveWorkHours({ ...hours, [i]: { ...shift, start: v } })),
        el("span", "wh-to", "to"),
        timeSelect(shift.end, v => saveWorkHours({ ...hours, [i]: { ...shift, end: v } })),
        el("span", "wh-len", `${Math.round(shiftMinutes(shift) / 30) / 2} hr` + (toMin(shift.end) <= toMin(shift.start) ? " · overnight" : "")),
      );
      row.appendChild(times);
    } else {
      row.appendChild(el("span", "wh-off", "Day off: heavy jobs and workouts go here"));
    }
    box.appendChild(row);
  }

  // Quick fill: copy the first workday's hours to every workday.
  const first = Object.values(hours).find(Boolean);
  if (first) {
    const copy = el("button", "link-btn", `Use ${shiftLabel(first)} for every workday`);
    copy.addEventListener("click", () => {
      const next = {};
      for (let i = 0; i < 7; i++) next[i] = hours[i] ? { ...first } : null;
      saveWorkHours(next);
    });
    box.appendChild(copy);
  }

  // Work shifts from her calendar (e.g. "Ariel - Work Dayshift" in Google Calendar).
  const pref = workFromCal();
  const wrap = el("div", "work-cal");
  const lab = el("label", "check");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = pref.enabled;
  cb.addEventListener("change", () => saveProfile({ workFromGoogle: { ...workFromCal(), enabled: cb.checked } }));
  lab.append(cb, "📆 Use work shifts from my calendar");
  wrap.appendChild(lab);
  const row = el("div", "work-cal-row");
  row.appendChild(el("span", "fit-label", "Events whose title contains"));
  const input = el("input");
  input.type = "text";
  input.value = pref.match;
  input.placeholder = "Ariel - Work";
  const commit = () => {
    if (input.value.trim() !== pref.match) saveProfile({ workFromGoogle: { ...workFromCal(), match: input.value.trim() } });
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
  row.appendChild(input);
  wrap.appendChild(row);
  wrap.appendChild(el("p", "hint-small",
    "On days with one of these events, its start and end times are your work hours (instead of the hours above), " +
    "and it's not counted as a task. Overnight shifts carry over into the next morning."));
  box.appendChild(wrap);
}

// This week at a glance (shown on the Home screen).
function renderWeekPlan() {
  const wp = $("week-plan");
  wp.innerHTML = "";
  const tk = todayKey();
  for (const p of weekPlan(tk)) {
    const e = energyFor(p.day);
    const col = el("div", "wp-day" + (p.day === tk ? " today" : ""));
    col.appendChild(el("div", "wp-name", fromKey(p.day).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })));
    const en = el("div", "wp-energy", `${ENERGY_TEXT[e.level].emoji} ${ENERGY_TEXT[e.level].label}`);
    en.style.color = ENERGY_TEXT[e.level].color;
    col.appendChild(en);
    const shift = workHoursFor(p.day);
    if (shift) {
      col.appendChild(el("div", "wp-work", `💼 ${shortTime(shift.start)}–${shortTime(shift.end)}`));
    }
    const c = cycleInfo(p.day);
    if (c) col.appendChild(el("div", "wp-cycle", `${PHASES[c.phase].emoji} ${PHASES[c.phase].short}`));
    const left = ptDaysLeft(p.day);
    const focus = left === 0 ? "🎖️ PT TEST" : left === 1 ? "😴 Rest" : p.cat ? `${CAT_INFO[p.cat].emoji} ${CAT_INFO[p.cat].label}` : "🧘 Rest & stretch";
    col.appendChild(el("div", "wp-focus" + (p.cat ? "" : " rest"), focus));
    col.addEventListener("click", () => { currentDay = p.day; showView("day"); });
    col.title = "Open this day";
    wp.appendChild(col);
  }
}

$("pt-date").addEventListener("change", e => saveProfile({ ptTest: { ...(prof("ptTest") || {}), date: e.target.value || null } }));
$("sessions").addEventListener("change", e => saveProfile({ sessionsPerWeek: Number(e.target.value) }));
$("session-min").addEventListener("change", e => saveProfile({ sessionMinutes: Number(e.target.value) }));
