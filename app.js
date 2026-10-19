// ARP Planner UI: a day view (default) and a month calendar.

// ---------- date helpers (dates are local "YYYY-MM-DD" strings) ----------
const pad = n => String(n).padStart(2, "0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
// "Now" on HER clock (Settings → Time zone), whichever device this is: a Date whose local
// fields (getHours, getDate...) read as her wall-clock time. Unset = this device's own clock.
function plannerZone() {
  try { return (profile && profile.timeZone) || null; } catch { return null; }   // (profile isn't declared yet at first)
}
function nowLocal() {
  const zone = plannerZone();
  if (!zone) return new Date();
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date())) p[x.type] = +x.value;
    return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  } catch { return new Date(); }                     // unknown zone name
}
const todayKey = () => toKey(nowLocal());
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);

// 24-hour ("military") clock? Settings → Time zone & clock.
function use24() {
  try { return !!(profile && profile.clock24); } catch { return false; }   // (profile isn't declared yet at first)
}

function formatTime(t) {
  if (!t) return "Anytime";
  const [h, m] = t.split(":").map(Number);
  if (use24()) return `${pad(h)}:${pad(m)}`;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

// Short form for tight spots (calendar cells, week plan): "9a", "5:30p" or "09", "17:30".
function shortTime(t) {
  const [h, m] = t.split(":").map(Number);
  if (use24()) return m ? `${pad(h)}:${pad(m)}` : pad(h);
  return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""}${h < 12 ? "a" : "p"}`;
}

function formatMinutes(m) {
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 30) / 2;            // nearest half hour
  return (Number.isInteger(h) ? h : Math.floor(h) + "½") + " hr";
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- constants ----------
// (Feelings, body check-in and cycle content live in wellness.js.)
const CHORE_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
const CHORE_AREAS = ["Anywhere", "Kitchen", "Bathroom", "Bedroom", "Living room", "Laundry", "Outside", "Errands"];
const LEVEL_RANK = { important: 0, normal: 1, optional: 2 };

// ---------- state ----------
let tasks = [];                 // all tasks (including soft-deleted)
let moods = {};                 // "YYYY-MM-DD" -> { mood, body, period, recovery, note }
let profile = {};               // fitness goals, workdays, PT test (see fitness.js)

// Save the settings, one save at a time. Each save sends the whole current settings, so
// while one is in flight any further changes just wait and go in the next save. That way
// a slow earlier save can never land after (and overwrite) a newer one, on the server or
// on screen.
let profileSaving = null, profileDirty = false;
function pushProfile() {
  profileDirty = true;
  if (!profileSaving) {
    profileSaving = (async () => {
      try {
        while (profileDirty) {
          profileDirty = false;
          const saved = await Store.putProfile(profile);
          if (!profileDirty) profile = saved;     // keep newer local edits otherwise
        }
      } finally {
        profileSaving = null;
      }
    })();
  }
  return profileSaving;
}

// Is she in the middle of using a dropdown / text box? Then don't redraw under her.
const userIsEditing = () => {
  const a = document.activeElement;
  return !!a && /^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName) && !a.closest("dialog");
};
let showOptional = false;      // on recovery days optional tasks are tucked away until asked for
let currentDay = todayKey();
let monthCursor = new Date();   // any date inside the month being shown
monthCursor.setDate(1);
let editing = null;             // task being edited, or null when adding
let sortMode = "plan";          // "plan" (grouped by importance) or "time"
try { sortMode = localStorage.getItem("dailyPlanner.sort") || "plan"; } catch {}

const $ = id => document.getElementById(id);

// ---------- task logic ----------
const kindOf = t => t.kind || (t.time ? "event" : "task");

// A task whose sub-tasks ALL have times lasts exactly as long as they add up to: that total
// replaces whatever length it had, so her day adds up accurately. null = not every step timed yet.
function stepsTotal(steps) {
  if (!steps || !steps.length || steps.some(s => !s.minutes)) return null;
  return steps.reduce((sum, s) => sum + s.minutes, 0);
}
// Its length after a step-time change: the total once every step is timed; until then, at least
// the times entered so far (so a half-timed Laundry never looks shorter than it is).
function lengthFromSteps(t, steps) {
  const all = stepsTotal(steps);
  if (all !== null) return all;
  const known = (steps || []).reduce((sum, s) => sum + (s.minutes || 0), 0);
  return known ? Math.max(t.minutes || 0, known) : t.minutes;
}
const withStepTotal = (t, steps) => ({ ...t, steps, minutes: lengthFromSteps(t, steps) });

// How much of a task is left: its length minus the steps she's ticked off (Laundry 2 hr, with
// "Wash · 30 min" done → 1½ hr), but never less than the steps still to do. null = unknown.
function minutesLeft(t) {
  const steps = t.steps || [];
  const doneMin = steps.reduce((s, x) => s + (x.done ? x.minutes || 0 : 0), 0);
  const openMin = steps.reduce((s, x) => s + (x.done ? 0 : x.minutes || 0), 0);
  if (t.minutes) return Math.max(t.minutes - doneMin, openMin, 0);
  return openMin || null;
}
// No time yet: no length at all, or a step still waiting for its time.
const needsTime = t => minutesLeft(t) === null || (t.steps || []).some(s => !s.done && !s.minutes);
// Short label like "1½ hr" or "1½ hr left" when some of it is done already.
function lengthLabel(t, fmt = formatMinutes) {
  const left = minutesLeft(t);
  if (left === null) return "";
  return fmt(left) + (t.minutes && left < t.minutes ? ` left of ${fmt(t.minutes)}` : "");
}
// A to-do from one of her Microsoft To Do lists (not one of her planner tasks copied there).
const isTodo = t => { const m = t.external && t.external.microsoft; return !!(m && (m.imported || m.pending)); };
function todoListName(t) {
  const id = t.external.microsoft.listId;
  const l = (typeof msStatus !== "undefined" && msStatus && msStatus.lists || []).find(x => x.id === id);
  return l ? l.name : "To Do";
}

// Time-sensitive tasks: 0 = just added (green) ... 1 = due / overdue (red).
function urgency(t, day) {
  if (!t.dueDate) return null;
  const total = Math.max(1, daysBetween(t.date, t.dueDate));
  const left = daysBetween(day, t.dueDate);
  if (left <= 0) return 1;
  let u = 1 - left / total;
  if (left === 1) u = Math.max(u, 0.85);
  return Math.min(1, Math.max(0, u));
}

function levelOf(t, day) {
  const u = urgency(t, day);
  if (u === null) return t.priority || "normal";
  return u < 0.34 ? "optional" : u < 0.67 ? "normal" : "important";
}

// Green (hue 130) -> yellow -> red (hue 0).
const urgencyColor = u => `hsl(${Math.round(130 * (1 - u))}, 72%, 52%)`;
const LEVEL_COLOR = { optional: "#4cc38a", normal: null, important: "#ef5a5a" };

function colorOf(t, day) {
  const u = urgency(t, day);
  return u === null ? LEVEL_COLOR[levelOf(t, day)] : urgencyColor(u);
}

function dueLabel(t, day) {
  const left = daysBetween(day, t.dueDate);
  if (left > 1) return `Due in ${left} days`;
  if (left === 1) return "Due tomorrow";
  if (left === 0) return "Due today";
  return `Overdue by ${plural(-left, "day")}`;
}

// Is the task on this day's list? Deadline tasks carry over day to day until done.
function visibleOn(t, day) {
  if (t.deleted) return false;
  if (!t.dueDate) return t.date === day;
  if (t.done) return (t.doneDate || t.date) === day;
  return day >= t.date && day <= (t.dueDate > todayKey() ? t.dueDate : todayKey());
}

const byTime = (a, b) => (a.time || "").localeCompare(b.time || "") || a.createdAt.localeCompare(b.createdAt);

function tasksFor(day) {
  return tasks.filter(t => visibleOn(t, day)).sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? -1 : 1;   // timed first, anytime last
    return byTime(a, b);
  });
}

// Chores in an efficient order: grouped by room (do all the kitchen stuff together),
// biggest room-batch first, quickest chore first within a room.
function sortChores(list) {
  const totals = {};
  for (const t of list) totals[t.area || "Anywhere"] = (totals[t.area || "Anywhere"] || 0) + (minutesLeft(t) ?? 15);
  return list.sort((a, b) => {
    const aa = a.area || "Anywhere", ba = b.area || "Anywhere";
    if (aa !== ba) {
      if (aa === "Anywhere") return 1;
      if (ba === "Anywhere") return -1;
      return totals[ba] - totals[aa] || aa.localeCompare(ba);
    }
    return (minutesLeft(a) ?? 15) - (minutesLeft(b) ?? 15);
  });
}

const doneLast = list => [...list.filter(t => !t.done), ...list.filter(t => t.done)];

function showError(msg) {
  const bar = $("error-bar");
  bar.textContent = msg;
  bar.hidden = false;
  clearTimeout(showError.t);
  // Long messages stay longer; a tap closes it.
  showError.t = setTimeout(() => (bar.hidden = true), Math.max(5000, msg.length * 70));
  bar.onclick = () => (bar.hidden = true);
}

// ---------- day view ----------
// Everything about a day's list, shared by the Day tab and the Home screen.
function planDay(day) {
  const list = tasksFor(day);
  const energy = energyFor(day);
  // Heavy jobs wait for a better day when energy is low (or it's period day 1-2),
  // unless they're due or important.
  let held = list.filter(t => holdReason(t, day, energy));
  let active = list.filter(t => !held.includes(t));
  // 🧠 More brainpower planned than she has: brain-heavy jobs that could move. With
  // "move them for me" (Settings) they go to "Can wait"; otherwise the planner suggests it.
  let bats = batteriesFor(day, active);
  const brainOver = brainOverflow(day, active, bats);
  if (brainOver.length && brainMode() === "auto") {
    energy.brainHold = new Set(brainOver.map(t => t.id));
    held = list.filter(t => holdReason(t, day, energy));
    active = list.filter(t => !held.includes(t));
    bats = batteriesFor(day, active);
  }
  // On high-energy days the heavy jobs float to the top of their group.
  const heavyFirst = (a, b) => energy.level === "high" ? (effortOf(b) === "heavy") - (effortOf(a) === "heavy") : 0;
  // Body fine but heart low: movement and quick wins first, long sit-down tasks later.
  const mindLow = mindLowBodyOk(day);
  // Her feelings: body first (Annoyed, Anxious…), quick wins (Overwhelmed…), or brain work first (Inspired…).
  const moodOrder = mindLow ? null : moodOrderOf(day);
  const annoyed = !!(moodOrder && moodOrder.move);
  const moodFirst = (a, b) => mindLow ? moodBoostScore(b) - moodBoostScore(a)
    : moodOrder ? moodOrderScore(b, day, moodOrder) - moodOrderScore(a, day, moodOrder) : 0;
  const timed = active.filter(t => t.time);
  const untimed = active.filter(t => !t.time);
  const chores = doneLast(spreadBrain(sortChores(untimed.filter(t => kindOf(t) === "chore")).sort((a, b) => moodFirst(a, b) || heavyFirst(a, b))));
  const workouts = doneLast(untimed.filter(t => kindOf(t) === "workout"));
  const others = untimed.filter(t => kindOf(t) !== "chore" && kindOf(t) !== "workout");
  const ofLevel = lvl => doneLast(spreadBrain(others.filter(t => levelOf(t, day) === lvl)
    .sort((a, b) => (urgency(b, day) || 0) - (urgency(a, day) || 0) || moodFirst(a, b) || heavyFirst(a, b) || byTime(a, b))));
  const choreMinutes = chores.filter(t => !t.done).reduce((s, t) => s + (minutesLeft(t) ?? 15), 0);
  const summary = summaryText(day, timed.filter(t => !isWorkShift(t)), ofLevel("important"), ofLevel("normal").concat(workouts), chores, ofLevel("optional"), choreMinutes)
    + (held.length ? ` ${plural(held.length, "job")} can wait for a better day.` : "");
  return { list, energy, held, active, timed, untimed, chores, workouts, ofLevel, choreMinutes, summary, mindLow, annoyed, moodOrder, bats, brainOver,
    load: physicalMinutes(active), shift: workHoursFor(day), free: freeMinutes(day), planned: plannedMinutes(active, day) };
}

// Has she checked in (feelings or body) for this day?
const checkedIn = day => !!(feelingOf(moods[day]) || bodyOf(moods[day]));

function renderDay() {
  const d = fromKey(currentDay);
  const tk = todayKey();
  $("day-weekday").textContent = d.toLocaleDateString(undefined, { weekday: "long" });
  const hol = holidayOn(currentDay);
  $("day-date").textContent = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) +
    (hol ? `  ·  ${hol.emoji} ${hol.name}` : "");
  $("day-badge").textContent =
    currentDay === tk ? "Today" :
    currentDay === addDays(tk, 1) ? "Tomorrow" :
    currentDay === addDays(tk, -1) ? "Yesterday" : "";

  // Pencil: opens the check-in. It glows until she's checked in for the day.
  const pencil = $("checkin-btn");
  pencil.hidden = currentDay > tk;
  pencil.classList.toggle("glow", !checkedIn(currentDay));
  const f = feelingOf(moods[currentDay]), b = bodyOf(moods[currentDay]);
  pencil.textContent = f || b ? `${f ? f.emoji : ""}${b ? b.emoji : ""} ✏️` : "✏️";
  pencil.title = checkedIn(currentDay) ? "Change how you're feeling" : "How are you feeling? Tap to check in";

  const p = planDay(currentDay);
  dayEnergy = p.energy;
  const { list, held, timed, untimed, chores, workouts, ofLevel, choreMinutes } = p;
  const todo = list.filter(t => !isWorkShift(t));          // work shifts aren't tasks to tick off
  const done = todo.filter(t => t.done).length;
  $("day-progress").textContent = todo.length ? `${done} of ${todo.length} done` : "";
  $("sort-plan").classList.toggle("active", sortMode === "plan");
  $("sort-time").classList.toggle("active", sortMode === "time");
  $("sort-plan").parentElement.hidden = list.length === 0;
  const et = ENERGY_TEXT[p.energy.level];
  $("energy-pill").textContent = `${et.emoji} ${et.label} energy`;
  $("energy-pill").style.setProperty("--energy", et.color);
  $("energy-pill").title = p.energy.why.join(", ");
  $("work-pill").textContent = p.shift ? `💼 Work ${shiftLabel(p.shift)}` : "🌴 Day off";
  renderBatteries(p);
  timerPlan = p;
  renderFreeTimer();

  // On today, highlight the next timed thing still to do.
  let nextId = null;
  if (currentDay === tk) {
    const now = nowLocal();
    const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const next = list.find(t => !t.done && t.time && t.time >= nowStr);
    nextId = next && next.id;
  }

  const ul = $("task-list");
  ul.innerHTML = "";
  const addRows = rows => rows.forEach(t => ul.appendChild(taskRow(t, t.id === nextId)));
  $("empty-day").hidden = list.length > 0;
  const recovery = currentDay <= tk ? recoveryFor(currentDay) : null;
  renderSuggestions(p, recovery);

  if (sortMode === "time") {
    const rest = untimed.sort((a, b) => LEVEL_RANK[levelOf(a, currentDay)] - LEVEL_RANK[levelOf(b, currentDay)]);
    addRows(timed);
    if (rest.length) { if (timed.length) sectionLabel(ul, "Anytime", ""); addRows(doneLast(rest)); }
    if (held.length) { sectionLabel(ul, "💤 Can wait for a better day", "s-held"); addRows(held); }
    return;
  }

  const moveFirst = p.mindLow || p.annoyed;
  const movement = ["🏃", p.mindLow ? "Movement · good for your mood 💛" : p.annoyed ? "Movement · helps it settle 🔥" : "Movement", workouts, "s-workout"];
  const sections = [
    ["📅", currentDay === tk ? "Today's schedule" : "Schedule", timed, "s-schedule"],
    ...(moveFirst ? [movement] : []),          // low mood or annoyed: move first
    ["🔥", "Important", ofLevel("important"), "s-important"],
    ...(moveFirst ? [] : [movement]),
    ["📝", "To do", ofLevel("normal"), "s-normal"],
    ["🧹", "Chores" + (choreMinutes ? ` · about ${formatMinutes(choreMinutes)}` : ""), chores, "s-chores"],
    ["🌿", "Optional", ofLevel("optional"), "s-optional"],
    ["💤", "Can wait for a better day", held, "s-held"],
  ];
  for (const [icon, label, rows, cls] of sections) {
    if (!rows.length) continue;
    if (cls === "s-optional" && recovery && !showOptional) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "tucked";
      btn.textContent = `🌿 ${plural(rows.length, "optional thing")} tucked away for today · show`;
      btn.addEventListener("click", () => { showOptional = true; render(); });
      li.appendChild(btn);
      ul.appendChild(li);
      continue;
    }
    sectionLabel(ul, `${icon} ${label}`, cls);
    if (cls === "s-chores") {
      let area = null;
      for (const t of rows) {
        const a = t.area || "Anywhere";
        if (a !== area && new Set(rows.map(r => r.area || "Anywhere")).size > 1) {
          const li = document.createElement("li");
          li.className = "area-label";
          li.textContent = a;
          ul.appendChild(li);
        }
        area = a;
        ul.appendChild(taskRow(t, false));
      }
    } else {
      addRows(rows);
    }
  }
}

let dayEnergy = null;

// ---------- free-time timer + endless-task warning ----------
let timerPlan = null;

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function formatHrsMin(sec) {
  const m = Math.max(0, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`;
}

function renderFreeTimer() {
  if (!timerPlan) return;
  const day = currentDay, p = timerPlan;
  const isToday = day === todayKey();
  const ft = freeTimeLeft(day, p.active);
  const box = $("free-timer");
  const sleep = sleepFor(day);
  box.classList.toggle("over", ft.seconds <= 0 && !ft.past);
  box.classList.toggle("tight", ft.seconds > 0 && ft.seconds < 30 * 60);

  if (isToday && ft.past) {
    $("ft-label").textContent = "🌙 It's past your bedtime";
    $("ft-time").textContent = "";
    $("ft-sub").textContent = "Whatever's left can wait for tomorrow. Rest up! 💛";
    $("ft-fill").style.width = "0%";
  } else {
    $("ft-label").textContent = isToday ? "⏳ Free time left today" : "⏳ Free time this day";
    $("ft-time").textContent = ft.seconds <= 0 ? "None 😣" : isToday ? formatClock(ft.seconds) : `about ${formatHrsMin(ft.seconds)}`;
    $("ft-fill").style.width = `${ft.total > 0 ? Math.max(0, Math.min(100, (ft.seconds / ft.total) * 100)) : 0}%`;
    $("ft-sub").textContent = `☀️ Up ${formatTime(sleep.wake)} · 🌙 Bed ${formatTime(sleep.bed)}` +
      (p.shift ? ` · 💼 Work ${shiftLabel(p.shift)}` : "") +
      ` · ${formatHrsMin(ft.planned)} of tasks ${isToday ? "still to do" : "planned"}`;
  }

  // Chaos meter: how much of her free time the day eats, faster when she's worn out.
  const chaos = chaosFor(day, ft);
  const shown = ft.past ? 0 : chaos.pct;
  renderChaosFlask(shown);
  renderChaosShadow(ft.past ? [] : p.active.filter(t => !t.done && !isWorkShift(t) && needsTime(t)), shown);
  $("chaos-emoji").textContent = ft.past ? "😴" : chaos.emoji;
  $("chaos-value").textContent = ft.past ? "Resting" : `${chaos.label} · ${shown}%`;
  const note = $("chaos-note");
  note.hidden = !(chaos.boost > 1 && !ft.past);
  if (!note.hidden) note.textContent = `⚡ Fills ${Math.round((chaos.boost - 1) * 100)}% faster: ${chaos.reason}.`;

  // Endless-task alert: no free time left at all (or barely any).
  const warn = $("overload");
  const spare = ft.seconds / 60;
  if (!ft.past && p.planned > 0 && spare < 0) {
    warn.className = "overload red";
    warn.textContent = `🛑 Endless-task alert! You've got about ${formatHrsMin(ft.planned)} of tasks but only ` +
      `${formatHrsMin(ft.total)} of free time${isToday ? " left" : ""}. That's a bad combo of endless tasks that will leave you ` +
      `very tired or upset. Move something to a lighter day or drop an optional one. You matter more than the list 💛`;
    warn.hidden = false;
  } else if (!ft.past && p.planned > 0 && spare < 30) {
    warn.className = "overload amber";
    warn.textContent = `⚠️ Only ${formatHrsMin(ft.seconds)} of breathing room left${isToday ? " today" : ""}. ` +
      `Try not to add anything else, and leave time to rest.`;
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }

  // The day itself catches fire when there's little or no free time.
  if (view === "day") {
    if (!ft.past && p.planned > 0 && spare < 0) setFireFloor(2, "🔥 This day is on fire! No free time at all. Something's got to give.");
    else if (!ft.past && p.planned > 0 && spare < 30) setFireFloor(1, "🔥 Barely any free time. Don't pile anything else on!");
    else setFireFloor(0);
  }
}

// ---------- chaos flask ----------
// Liquid rises with the chaos %, turning from green to red. Bubbles get more numerous and
// faster as it fills; past 50% the flask wobbles, past 75% it cracks and steams, and at 90%+
// it shakes hard. At 100% it bursts (💥) every few seconds.
function renderChaosFlask(pct) {
  const flask = $("chaos-flask");
  const liquid = $("chaos-liquid");
  liquid.style.height = `${Math.max(pct, 3)}%`;
  const colour = `hsl(${Math.round(135 * (1 - pct / 100))}, 78%, 50%)`;
  liquid.style.setProperty("--liq", colour);
  flask.style.setProperty("--liq", colour);   // the explosion splashes the same colour
  flask.dataset.stage = pct < 25 ? "0" : pct < 50 ? "1" : pct < 75 ? "2" : pct < 90 ? "3" : "4";
  flask.classList.toggle("boom", pct >= 100);

  // Only rebuild the bubbles when the amount changes enough to matter.
  const bucket = Math.round(pct / 8);
  const box = $("chaos-bubbles");
  if (box.dataset.bucket === String(bucket)) return;
  box.dataset.bucket = String(bucket);
  box.innerHTML = "";
  const count = Math.min(30, 3 + bucket * 2);
  const speed = Math.max(0.8, 3.4 - pct / 38);          // seconds per rise: faster when fuller
  for (let i = 0; i < count; i++) {
    const b = document.createElement("span");
    b.className = "bubble";
    const size = 3 + Math.random() * (4 + pct / 14);
    b.style.width = b.style.height = `${size}px`;
    b.style.left = `${8 + Math.random() * 80}%`;
    b.style.setProperty("--sway", `${Math.random() * 8 - 4}px`);
    const dur = speed * (0.7 + Math.random() * 0.6);
    b.style.animationDuration = `${dur}s, ${0.6 + Math.random() * 0.6}s`;
    b.style.animationDelay = `${-Math.random() * dur}s, ${-Math.random()}s`;
    box.appendChild(b);
  }
}

// ---------- shadow smoke ----------
// Tasks with no time are unknowns: the vial can't say how full the day really is. Shadow smoke
// curls up out of the liquid into the empty part, thicker with more of them, and at 2+ a pair
// of eyes blinks in the dark. Giving those tasks a time chases the shadows away.
let shadowKey = "";
function renderChaosShadow(untimed, pct) {
  const box = $("chaos-shadow"), note = $("chaos-shadow-note");
  const n = untimed.length;
  box.hidden = note.hidden = !n;
  box.style.bottom = `${Math.max(pct, 3)}%`;              // only the empty part above the liquid
  if (!n) { shadowKey = ""; return; }
  const level = n >= 4 ? 3 : n >= 2 ? 2 : 1;
  box.dataset.level = String(level);
  note.textContent = `🌫️ ${plural(n, "task")} ${n === 1 ? "lurks" : "lurk"} without a time`;
  note.title = "No time yet: " + untimed.map(t => t.title).join(", ") + ". Tap to give the first one a time.";
  note.onclick = () => openDialog(untimed[0]);
  if (shadowKey === `${level}`) return;                     // don't restart the smoke every minute
  shadowKey = `${level}`;
  box.innerHTML = "";
  const wisps = 4 + level * 4;
  for (let i = 0; i < wisps; i++) {
    const w = document.createElement("i");
    w.className = "wisp";
    const size = 22 + Math.random() * (18 + level * 8);
    w.style.width = `${size}px`;
    w.style.height = `${size * 1.3}px`;
    w.style.left = `${-12 + Math.random() * 60}%`;
    w.style.setProperty("--drift", `${Math.random() * 24 - 12}px`);
    w.style.setProperty("--spin", `${Math.random() * 120 - 60}deg`);
    const dur = (7 - level * 1.2) * (0.75 + Math.random() * 0.5);
    w.style.animationDuration = `${dur}s`;
    w.style.animationDelay = `${-Math.random() * dur}s`;
    box.appendChild(w);
  }
  // Something watching from the dark (two pairs when it's really murky).
  for (let e = 0; e < (level >= 3 ? 2 : level >= 2 ? 1 : 0); e++) {
    const eyes = document.createElement("b");
    eyes.className = "shadow-eyes";
    eyes.style.top = `${12 + Math.random() * 45}%`;
    eyes.style.left = `${18 + Math.random() * 30}%`;
    eyes.style.animationDelay = `${-Math.random() * 7}s, ${-Math.random() * 9}s`;
    box.appendChild(eyes);
  }
}

// ---------- fire floor ----------
// Flames along the bottom of the window when things are overloaded:
// level 1 = smouldering (cutting it close), level 2 = blazing (no free time at all).
function setFireFloor(level, text) {
  if (calmMode()) level = 0;          // calm mode: the warning text is enough, no flames
  let floor = $("fire-floor");
  if (!floor) {
    if (!level) return;
    floor = document.createElement("div");
    floor.id = "fire-floor";
    floor.setAttribute("aria-live", "polite");
    for (let i = 0; i < 30; i++) {
      const f = document.createElement("span");
      f.className = "ff-flame";
      f.textContent = "🔥";
      f.style.left = `${(i / 30) * 100 + Math.random() * 2}%`;
      f.style.fontSize = `${22 + Math.random() * 22}px`;
      f.style.animationDuration = `${0.7 + Math.random() * 0.8}s`;
      f.style.animationDelay = `${-Math.random()}s`;
      floor.appendChild(f);
    }
    for (let i = 0; i < 18; i++) {
      const e = document.createElement("span");
      e.className = "ff-ember";
      e.style.left = `${Math.random() * 100}%`;
      e.style.setProperty("--drift", `${Math.random() * 60 - 30}px`);
      e.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
      e.style.animationDelay = `${-Math.random() * 3}s`;
      floor.appendChild(e);
    }
    const label = document.createElement("div");
    label.className = "ff-label";
    floor.appendChild(label);
    document.body.appendChild(floor);
  }
  floor.hidden = !level;
  floor.dataset.level = String(level || 0);
  floor.querySelector(".ff-label").textContent = text || "";
  document.body.classList.toggle("on-fire", !!level);
}

// After saving a task, warn right away if it made the day impossible.
function warnIfOverloaded(day) {
  const p = planDay(day);
  const ft = freeTimeLeft(day, p.active);
  if (p.planned > 0 && ft.seconds < 0 && !ft.past) {
    const name = day === todayKey() ? "Today" : fromKey(day).toLocaleDateString(undefined, { weekday: "long" });
    showToast(`🛑 ${name} has no free time left now. That's an endless-task combo that'll wear you out. Consider moving something.`);
  }
}

// Tick the timer every second while today's Day tab is open.
setInterval(() => {
  if (view === "day" && currentDay === todayKey() && !document.hidden) renderFreeTimer();
}, 1000);

// 🧠 Brain and 💪 Body batteries: grey is used up (work so far + done jobs), stripes are
// still planned, color is what's left after the plan. Tap one to see why.
let batteryWhy = null;
function renderBatteries(p) {
  const box = $("batteries");
  box.innerHTML = "";
  const BATS = { brain: ["🧠", "Brain"], body: ["💪", "Body"] };
  if (!BATS[batteryWhy]) batteryWhy = null;
  for (const key of Object.keys(BATS)) {
    const b = p.bats[key], [emoji, name] = BATS[key];
    // Over the top: the bar shows the whole plan instead, so the red stripes are the extra.
    const scale = Math.max(b.cap, b.done + b.todo);
    const pct = x => Math.max(0, Math.min(100, (100 * x) / scale));
    const spent = pct(b.done), planned = Math.min(100 - spent, pct(b.todo));
    const state = b.pctLeft < 0 ? "over" : b.pctLeft < 20 ? "low" : "ok";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `battery ${key} ${state}` + (batteryWhy === key ? " open" : "");
    btn.setAttribute("aria-expanded", String(batteryWhy === key));
    const head = document.createElement("span");
    head.className = "battery-head";
    head.append(Object.assign(document.createElement("b"), { textContent: `${emoji} ${name}` }),
      document.createTextNode(b.pctLeft < 0 ? ` · over by ${-b.pctLeft}%` : ` · ${b.pctLeft}% left after today's plan`));
    const bar = document.createElement("span");
    bar.className = "battery-bar";
    const seg = (cls, w) => { const s = document.createElement("span"); s.className = cls; s.style.width = `${w}%`; bar.appendChild(s); };
    seg("bat-spent", spent);
    seg("bat-planned", planned);
    btn.append(head, bar);
    btn.addEventListener("click", () => { batteryWhy = batteryWhy === key ? null : key; renderBatteries(p); });
    box.appendChild(btn);
  }
  if (batteryWhy) {
    const b = p.bats[batteryWhy];
    const pct = x => Math.round((100 * x) / b.cap);
    const lines = batteryWhy === "brain"
      ? ["🧠 Brain battery: thinking, deciding, people and noise. Cleaning a messy room drains it even though it's easy on the body."]
      : ["💪 Body battery: physical jobs and workouts. When chores use it up, your workout gets lighter (or the chores count as it)."];
    if (b.why.length) lines.push(`Smaller today because of ${b.why.join(", ")}.`);
    if (b.work) lines.push(`Work uses about ${pct(b.work)}% of it.`);
    lines.push(`Grey = used up so far (${pct(b.done)}%) · stripes = still planned (${pct(b.todo)}%) · color = what's left.`);
    if (batteryWhy === "brain") lines.push("Rate how much brainpower a task takes in its edit window (🪶 Easy / 🌀 Some / 🧠 Lots).");
    const why = document.createElement("div");
    why.className = "battery-why";
    for (const l of lines) why.appendChild(Object.assign(document.createElement("div"), { textContent: l }));
    box.appendChild(why);
  }
}

// Brain battery over: offer to make the brain-heavy jobs that can wait Next day's problem.
// 🪶 Easy on the brain: light, quick jobs, offered when her brain battery is low, her feelings
// say thinking is hard today, or it's wind-down time. Tapping one opens Focus on it.
const QUICK_MIN = 20;
const isQuickEasy = t => !t.done && !isWorkShift(t) && kindOf(t) !== "event" && brainOf(t) === "light"
  && (minutesLeft(t) ?? t.minutes ?? 15) <= QUICK_MIN;

function easyPicksCard(p) {
  const day = currentDay, tk = todayKey();
  if (day < tk) return null;
  const f = feelingOf(moods[day] || {});
  const n = nowLocal(), nowMin = n.getHours() * 60 + n.getMinutes();
  const why = p.bats.brain.pctLeft <= 35 ? "Your brain battery is getting low"
    : f && f.mix.br <= -0.75 ? `Feeling ${f.label}`
    : day === tk && nowMin >= brainWindow(day).end ? "It's wind-down time"
    : null;
  if (!why) return null;
  const picks = p.active.filter(t => isQuickEasy(t) && !t.time)
    .sort((a, b) => (minutesLeft(a) ?? a.minutes ?? 15) - (minutesLeft(b) ?? b.minutes ?? 15)).slice(0, 4);
  if (!picks.length) return null;
  const card = document.createElement("div");
  card.className = "easy-picks";
  card.appendChild(Object.assign(document.createElement("div"), { className: "easy-head",
    textContent: `🪶 ${why}. These are quick and easy on the brain:` }));
  const ul = document.createElement("ul");
  for (const t of picks) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "link-btn";
    b.textContent = `${t.title} · ${formatMinutes(minutesLeft(t) ?? t.minutes ?? 15)}`;
    b.title = "Open it in Focus mode";
    b.addEventListener("click", () => { if (typeof openFocus === "function") openFocus(t.id); else openDialog(t); });
    li.appendChild(b);
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

function brainOverCard(p) {
  const card = document.createElement("div");
  card.className = "brain-over";
  const auto = brainMode() === "auto";
  card.appendChild(Object.assign(document.createElement("div"), { className: "brain-over-head",
    textContent: auto ? `🧠 Your brain battery was full, so ${plural(p.brainOver.length, "brain-heavy job")} moved to "Can wait" 💛`
      : "🧠 Today asks for more brainpower than you've got." }));
  if (auto) {
    card.appendChild(Object.assign(document.createElement("div"), { className: "hint-small",
      textContent: "Change this in Settings → 🔋 Brain & body." }));
    return card;
  }
  card.appendChild(Object.assign(document.createElement("div"), {
    textContent: "These could be next day's problem, so you're not running on empty:" }));
  const ul = document.createElement("ul");
  for (const t of p.brainOver) ul.appendChild(Object.assign(document.createElement("li"), { textContent: t.title }));
  card.appendChild(ul);
  const btn = document.createElement("button");
  btn.className = "g-btn primary";
  btn.textContent = p.brainOver.length > 1 ? "😴 Make them next day's problem" : "😴 Make it next day's problem";
  btn.addEventListener("click", async () => {
    const before = p.brainOver.map(t => ({ ...t }));
    const next = addDays(currentDay, 1);
    for (const t of p.brainOver) await persist({ ...t, date: next }, false);
    render();
    const when = next === addDays(todayKey(), 1) ? "tomorrow" : fromKey(next).toLocaleDateString(undefined, { weekday: "long" });
    showToast(`😴 ${plural(before.length, "brain-heavy job")} moved to ${when}. Your brain says thanks.`, "Undo",
      async () => { for (const t of before) await persist(t, false); render(); });
  });
  card.append(btn, Object.assign(document.createElement("div"), { className: "hint-small",
    textContent: "Want the planner to just do this for you? Settings → 🔋 Brain & body." }));
  return card;
}

// The planner's own suggestions, kept apart from her tasks: recovery self-care,
// cycle care tips and burnout warnings.
function renderSuggestions(p, recovery) {
  const box = $("suggest-list");
  box.innerHTML = "";
  const tk = todayKey();

  if (p.mindLow) {
    const m = document.createElement("div");
    m.className = "mood-mode";
    m.textContent = "🧠💛 Your body's ready, but your heart's having a hard day. Your list is reordered: " +
      "movement and quick wins come first (both lift your mood), and long sit-down tasks wait until later. A walk outside counts!";
    box.appendChild(m);
  }
  if (p.moodOrder) {
    const o = p.moodOrder, ways = [];
    if (o.move) ways.push("hands-on jobs and movement come first (they help it settle), and brain-heavy tasks wait until later");
    if (o.quick) ways.push((o.move ? "quick" : "Quick") + " easy wins come early, to get you going");
    if (o.brainy) ways.push("brain-heavy work moves up while your head is clear");
    const m = document.createElement("div");
    m.className = "mood-mode";
    m.textContent = `${o.brainy && !o.move && !o.quick ? "✨" : "💛"} Feeling ${o.words} today, so your list is reordered: ${ways.join("; ")}.`;
    box.appendChild(m);
  }
  if (recovery) box.appendChild(recoveryCard(recovery));
  if (p.brainOver && p.brainOver.length) box.appendChild(brainOverCard(p));
  const easy = easyPicksCard(p);
  if (easy) box.appendChild(easy);

  // Too physical on top of a shift? (Running out of time altogether is the red banner up top.)
  if (p.shift && p.load >= Math.max(60, p.free * 0.35)) {
    const w = document.createElement("div");
    w.className = "load-warning";
    w.textContent = `⚠️ You work ${shiftLabel(p.shift)} and have about ${formatMinutes(p.load)} of physical jobs on top. ` +
      `That's a recipe for burnout! Consider moving a heavy one to your day off.`;
    box.appendChild(w);
  }

  const c = cycleInfo(currentDay);
  if (c) {
    const ph = PHASES[c.phase];
    const card = document.createElement("div");
    card.className = "suggest-cycle";
    card.style.setProperty("--phase", ph.color);
    const head = document.createElement("div");
    head.className = "suggest-cycle-head";
    head.textContent = `${ph.emoji} Cycle day ${c.cycleDay} · ${ph.label}${c.projected || currentDay > tk ? " (predicted)" : ""}`;
    const ul = document.createElement("ul");
    for (const tip of [...pickSome(ph.care, 1, currentDay, "care"), ...pickSome(ph.eat, 1, currentDay, "eat"), ...pickSome(ph.doList, 1, currentDay, "do")]) {
      const li = document.createElement("li");
      li.textContent = tip;
      ul.appendChild(li);
    }
    card.append(head, ul);
    box.appendChild(card);
  }

  if (p.energy.earlyPeriod || p.energy.level === "low") {
    const n = document.createElement("div");
    n.className = "suggest-note";
    n.textContent = p.energy.earlyPeriod
      ? "🩸 Period day: skip the super physical stuff unless it's due. Heavy jobs are moved to \"Can wait\"."
      : "🪫 Low-energy day: heavy jobs are moved to \"Can wait\". Go easy on yourself.";
    box.appendChild(n);
  }
  $("suggest-card").hidden = !box.children.length;
}

function recoveryCard(rec) {
  const li = document.createElement("div");
  li.className = "recovery-card";
  const done = (moods[currentDay] || {}).recovery || [];
  const h = document.createElement("div");
  h.className = "recovery-title";
  h.textContent = "💗 Recovery first";
  const p = document.createElement("div");
  p.className = "recovery-text";
  const why = rec.reasons.length > 1 ? rec.reasons.slice(0, -1).join(", ") + " and " + rec.reasons.at(-1) : rec.reasons[0];
  p.textContent = `Today's a recovery day because ${why}. Taking care of yourself comes first.`;
  const ideas = document.createElement("div");
  ideas.className = "recovery-ideas";
  for (const idea of rec.ideas) {
    const b = document.createElement("button");
    const isDone = done.includes(idea.id);
    b.className = "recovery-idea" + (isDone ? " done" : "");
    b.innerHTML = `<span class="ri-check">${isDone ? "✓" : ""}</span>`;
    b.appendChild(document.createTextNode(idea.text));
    b.addEventListener("click", () => {
      const next = isDone ? done.filter(x => x !== idea.id) : [...done, idea.id];
      setCheckin({ recovery: next });
    });
    ideas.appendChild(b);
  }
  li.append(h, p, ideas);
  return li;
}

function sectionLabel(ul, text, cls) {
  const li = document.createElement("li");
  li.className = "section-label " + cls;
  li.textContent = text;
  ul.appendChild(li);
}

function summaryText(day, timed, important, normal, chores, optional, choreMinutes) {
  const open = l => l.filter(t => !t.done).length;
  const all = [timed, important, normal, chores, optional].flat();
  if (!all.length) return "Nothing planned yet.";
  if (!open(all)) return "Everything's done. Nice work! 🎉";
  const parts = [];
  if (open(timed)) parts.push(plural(open(timed), "thing") + " on the schedule");
  if (open(important)) parts.push(open(important) + " important");
  if (open(normal)) parts.push(plural(open(normal), "to-do"));
  if (open(chores)) parts.push(plural(open(chores), "chore") + ` (about ${formatMinutes(choreMinutes)})`);
  if (open(optional)) parts.push(open(optional) + " optional");
  const last = parts.pop();
  const lead = day === todayKey() ? "Here's today: " : `Here's ${fromKey(day).toLocaleDateString(undefined, { weekday: "long" })}: `;
  return lead + (parts.length ? parts.join(", ") + " and " + last : last) + ".";
}

function taskRow(t, isNext) {
  const day = currentDay;
  const level = levelOf(t, day);
  const li = document.createElement("li");
  li.className = `task lvl-${level}` + (t.done ? " done" : "") + (isNext ? " next" : "");
  const color = colorOf(t, day);
  if (color) li.style.setProperty("--lvl", color);
  li.title = "Click to edit";

  const check = document.createElement("button");
  check.className = "check-btn";
  check.textContent = t.done ? "✓" : "";
  check.title = t.done ? "Mark as not done" : "Mark as done";
  check.addEventListener("click", e => { e.stopPropagation(); toggleDone(t, li); });

  const time = document.createElement("div");
  time.className = "time" + (t.time ? "" : " anytime");
  time.textContent = t.time ? formatTime(t.time) : "";   // untimed rows stay clean
  const ends = endTimeOf(t);
  if (ends) time.appendChild(Object.assign(document.createElement("span"), { className: "time-end", textContent: `to ${formatTime(ends)}` }));

  const body = document.createElement("div");
  body.className = "body";
  const title = document.createElement("div");
  title.className = "title";
  const titleText = document.createElement("span");
  titleText.className = "title-text";
  titleText.textContent = t.title;
  title.appendChild(titleText);
  body.appendChild(title);

  const chips = [];
  if (t.dueDate && !t.done) chips.push(["chip due", dueLabel(t, day), color]);
  if (kindOf(t) === "chore") {
    const where = t.area && t.area !== "Anywhere" ? ` · ${t.area}` : "";
    chips.push(["chip", `🧹 ${t.minutesGuess ? "≈ " : ""}${lengthLabel(t, m => formatHrsMin(m * 60)) || formatMinutes(15)}${where}`]);
  }
  if (kindOf(t) === "workout" && t.minutes) chips.push(["chip", `🏃 ${formatMinutes(t.minutes)}`]);
  if ((kindOf(t) === "task" || kindOf(t) === "event") && minutesLeft(t) !== null) {
    chips.push(["chip", `⏱ ${t.minutesGuess ? "≈ " : ""}${lengthLabel(t, m => formatHrsMin(m * 60))}`]);
  }
  if (isWorkShift(t)) {
    chips.push(["chip work-shift-chip", "💼 Work shift · counted as work, not a task"]);
    li.classList.add("work-shift");
  } else if (t.time && !t.done && atWork(day, t.time)) {
    const shift = workHoursFor(day);
    chips.push(["chip clash", "💼 During work" + (shift ? ` (${shiftLabel(shift)})` : "")]);
  }
  if (!t.dueDate && level === "important" && !t.done) chips.push(["chip imp", "Important"]);
  if (!t.dueDate && level === "optional" && !t.done) chips.push(["chip opt", "Optional"]);
  if (mindLowBodyOk(day) && moodBoostScore(t) >= 2) chips.push(["chip mood", "💛 Mood boost"]);
  else {
    const o = moodOrderOf(day);
    if (o && o.move && burnOffScore(t, day) >= 2) chips.push(["chip mood", "🔥 Burns it off"]);
    else if (o && o.quick && quickWinScore(t) >= 2) chips.push(["chip mood", "⚡ Quick win"]);
    else if (o && o.brainy && brainOf(t) === "heavy" && !t.done) chips.push(["chip mood", "✨ Clear-head job"]);
  }
  if (t.done && t.skipped) chips.push(["chip opt", "⏭️ Skipped (caught up)"]);
  const g = t.external && t.external.google;
  if (g && g.imported) chips.push(["chip gcal", "📆 Google"]);
  if (isTodo(t)) chips.push(["chip mstodo", "✔️ " + todoListName(t)]);
  const hold = dayEnergy && holdReason(t, day, dayEnergy);
  const risk = !hold && burnoutRisk(t, day);
  if (hold) chips.push(["chip held", "💤 " + hold]);
  else if (risk) {
    chips.push(["chip burnout" + (risk.level === "high" ? " high" : ""),
      `⚠️ Beware: physical${risk.minutes ? " · " + formatMinutes(risk.minutes) : ""} on a workday. May cause burnout!`]);
    li.classList.add("risk");
  } else if (effortOf(t) === "heavy" && !t.done) {
    chips.push(dayEnergy && dayEnergy.level === "high" ? ["chip good-day", "💪 Good day for this"] : ["chip", "🏋️ Heavy"]);
  }
  // 🧠 Brain-heavy jobs, people time, and brain jobs outside her thinking hours.
  if (!t.done && !isWorkShift(t)) {
    if (isSocial(t)) chips.push(["chip brain", `🫂 People time · ${SOCIAL_QUIET} min quiet after`]);
    else if (brainOf(t) === "heavy" && hold !== BRAIN_HOLD) chips.push(["chip brain", "🧠 Brain-heavy"]);
    else if (isQuickEasy(t)) chips.push(["chip brain-light", "⚡ Quick & easy"]);
    else if (brainOf(t) === "light" && kindOf(t) !== "event") chips.push(["chip brain-light", "🪶 Brain-light"]);
    const bt = brainTiming(t, day);
    if (bt && !isSocial(t)) chips.push(["chip brain-time", bt.when === "early"
      ? (t.time ? "🌅 Soon after waking: brains need time to boot" : `🌅 Best after ${formatTime(bt.until)}`)
      : (t.time ? "🌙 Close to bedtime: could keep your brain buzzing" : "🌙 Wind-down time: maybe next day's problem?")]);
  }
  if (chips.length) {
    const meta = document.createElement("div");
    meta.className = "meta";
    for (const [cls, text, c] of chips) {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      if (c) s.style.setProperty("--chip", c);
      meta.appendChild(s);
    }
    body.appendChild(meta);
  }
  // Notes that only say how long it takes ("2 hours", from To Do) are already shown as the ⏱ / 🧹 chip.
  const justLength = /^\s*(?:(?:half an?|\d+(?:\.\d+)?|an?|one)\s*(?:hours?|hrs?|h)\b)?\s*(?:and\s*)?(?:\d+\s*(?:minutes?|mins?|m)\b)?\s*$/i;
  if (t.notes && !justLength.test(t.notes)) {
    const notes = document.createElement("div");
    notes.className = "notes";
    notes.textContent = t.notes;
    body.appendChild(notes);
  }
  if (t.steps && t.steps.length) body.appendChild(stepList(t));

  li.append(check, time, body);
  if (isNext) {
    const pill = document.createElement("span");
    pill.className = "next-pill";
    pill.textContent = "Up next";
    li.appendChild(pill);
  }

  // Row actions: move to a better day, swap a workout, delete.
  const actions = document.createElement("div");
  actions.className = "row-actions";
  const action = (cls, text, title, fn) => {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = text;
    b.title = title;
    b.addEventListener("click", e => { e.stopPropagation(); if (!celebrating) fn(); });
    actions.appendChild(b);
  };
  if (hold || (risk && !t.dueDate && t.priority !== "important")) {
    // Next day that suits a job like this (for a burnout risk: the next day off).
    let target = hold === BRAIN_HOLD ? brainRoomDay(t, day) : hold ? betterDayFor(t, day) : nextDayOff(day);
    if (t.dueDate && target > t.dueDate) target = t.dueDate;
    action("move-btn", "Move to " + fromKey(target).toLocaleDateString(undefined, { weekday: "short" }),
      "Move to " + fromKey(target).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
      () => persist({ ...t, date: target }));
  }
  if (kindOf(t) === "workout" && !t.done) action("icon-btn", "🔄", "Change workout", () => openSwap(t));
  if (!t.done && !isWorkShift(t) && (["chore", "task"].includes(kindOf(t)) || isTodo(t))) {
    action("move-btn next-day", "😴 Next day's problem", "Move this to the next day", () => nextDaysProblem(t));
    action("move-btn next-day", "📅 Pick a day", "Move this to a day you pick", () => pickDayFor(t));
  }
  action("icon-btn trash", "🗑️", "Delete this task", () => deleteTask(t, li));
  li.appendChild(actions);

  if (t.notes) li.title = t.notes;   // full notes on hover; the row shows the first line
  li.addEventListener("click", () => { if (!celebrating) openDialog(t); });
  return li;
}

// ---------- Calendar: a quick look at a day (without leaving the Calendar tab) ----------
function openDayPeek(key) {
  let dlg = $("peek-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "peek-dialog";
    dlg.className = "peek-dialog";
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // tap outside to close
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = "";
  const d = fromKey(key);
  const head = el("div", "peek-head");
  const title = el("div", "peek-title");
  title.append(el("div", "peek-weekday", key === todayKey() ? "Today" : d.toLocaleDateString(undefined, { weekday: "long" })),
    el("div", "peek-date", d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })));
  const close = el("button", "focus-close", "✕");
  close.title = "Close";
  close.addEventListener("click", () => dlg.close());
  head.append(title, close);
  dlg.appendChild(head);

  // The shape of the day: holiday, work, energy, cycle, workout, free time.
  const facts = el("div", "peek-facts");
  const fact = text => facts.appendChild(el("span", "peek-fact", text));
  const hol = holidayOn(key);
  if (hol) fact(`${hol.emoji} ${hol.name}`);
  const shift = workHoursFor(key);
  fact(shift ? `💼 Work ${shiftLabel(shift)}` : "🌴 Day off");
  try { const e = energyFor(key); fact(`🔋 ${e.level[0].toUpperCase() + e.level.slice(1)} energy`); } catch {}
  const ci = cycleInfo(key);
  if (ci) fact(`🌸 Cycle day ${ci.cycleDay}`);
  const wo = workoutMarker(key, todayKey());
  if (wo) fact(`${wo.emoji} ${wo.title.replace("Planned workout: ", "")}`);
  try {
    const ft = freeTimeLeft(key, planDay(key).active);
    fact(ft.seconds <= 0 ? "😣 No free time" : `⏳ About ${formatHrsMin(ft.seconds)} free`);
  } catch {}
  dlg.appendChild(facts);

  // What's on: timed things first, then anytime; deadlines on their due date.
  const list = tasks.filter(t => !t.deleted && (t.dueDate ? t.dueDate === key : t.date === key))
    .sort((a, b) => (!a.time !== !b.time ? (a.time ? -1 : 1) : byTime(a, b)));
  const ul = el("ul", "peek-list");
  if (!list.length) ul.appendChild(el("li", "peek-empty", "Nothing planned yet. A free day! 🌿"));
  for (const t of list) {
    const li = el("li", "peek-item" + (t.done ? " done" : ""));
    li.appendChild(el("span", "peek-time", t.dueDate ? "⏰ due" : t.time ? formatTime(t.time) : "Anytime"));
    const name = el("span", "peek-name", (isWorkShift(t) ? "💼 " : kindOf(t) === "chore" ? "🧹 " : kindOf(t) === "workout" ? "🏃 " : "") + t.title);
    if (minutesLeft(t) && !isWorkShift(t)) name.appendChild(el("span", "peek-len", ` · ${lengthLabel(t, m => formatHrsMin(m * 60))}`));
    li.appendChild(name);
    ul.appendChild(li);
  }
  dlg.appendChild(ul);

  const actions = el("div", "peek-actions");
  const go = el("button", "g-btn primary", "📋 Go to that day");
  go.addEventListener("click", () => { dlg.close(); currentDay = key; showView("day"); });
  const add = el("button", "g-btn", "+ Add a task");
  add.addEventListener("click", () => { dlg.close(); currentDay = key; openDialog(null); });
  actions.append(go, add);
  dlg.appendChild(actions);
  dlg.showModal();
}

// Sub-checkboxes for a task's steps (from Microsoft To Do). Ticking one syncs back to To Do.
// Each step can have its own length (⏱): a "?" means it still needs one.
const STEP_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function stepsLeftLabel(t) {
  const open = t.steps.filter(s => !s.done);
  if (!open.length) return "all steps done";
  const known = open.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const unknown = open.some(s => !s.minutes);
  if (!known) return unknown ? "times? tap ⏱" : "";
  return `≈ ${formatHrsMin(known * 60)}${unknown ? " + ?" : ""} left`;
}

// Names to match on: "Wash (30 min)" and "wash" are the same step; "Laundry" is "laundry".
const nameKey = s => (s || "").toLowerCase()
  .replace(/\b(?:half an?|\d+(?:\.\d+)?|an?|one)\s*(?:hours?|hrs?|h)\b|\b\d+\s*(?:minutes?|mins?|m)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

// She set a step's time: fill it in on her other open copies of the same task that don't
// have one yet (e.g. next week's Laundry). New copies from To Do get it from the sync.
function rememberStepTime(t, s, minutes) {
  for (const o of tasks) {
    if (o.id === t.id || o.deleted || o.done || nameKey(o.title) !== nameKey(t.title) || !o.steps) continue;
    if (!o.steps.some(x => !x.minutes && nameKey(x.title) === nameKey(s.title))) continue;
    persist(withStepTotal(o, o.steps.map(x => (!x.minutes && nameKey(x.title) === nameKey(s.title) ? { ...x, minutes } : x))), false);
  }
}

// How she had a task with this name last time (to fill in a new one the same way): each detail
// comes from the most recent copy that has it, so a fresh copy without a length doesn't hide it.
function lastTaskNamed(title, exceptId) {
  const key = nameKey(title);
  if (!key) return null;
  const all = tasks.filter(o => o.id !== exceptId && !o.deleted && nameKey(o.title) === key)
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
  if (!all.length) return null;
  const pick = field => (all.find(o => o[field]) || {})[field];
  return { ...all[0], minutes: pick("minutes"), effort: pick("effort"), brain: pick("brain"), area: pick("area"), id: all[0].id };
}

function stepList(t) {
  const ul = document.createElement("ul");
  ul.className = "steps";
  const done = t.steps.filter(s => s.done).length;
  const left = stepsLeftLabel(t);
  ul.dataset.progress = `${done} of ${t.steps.length}${left ? " · " + left : ""}`;
  const save = steps => persist(withStepTotal(t, steps));     // the task's length follows its steps
  for (const s of t.steps) {
    const li = document.createElement("li");
    li.className = "step-row";
    const label = document.createElement("label");
    label.className = "step" + (s.done ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!s.done;
    cb.addEventListener("change", () => save(t.steps.map(x => (x.id === s.id ? { ...x, done: cb.checked } : x))));
    label.append(cb, document.createTextNode(s.title));
    label.addEventListener("click", e => e.stopPropagation());     // don't open the edit window

    // How long this step takes: a little button that turns into a picker.
    const time = document.createElement("button");
    time.type = "button";
    time.className = "step-time" + (s.minutes ? "" : " unknown");
    time.textContent = s.minutes ? `⏱ ${formatMinutes(s.minutes)}` : "⏱ ?";
    time.title = s.minutes ? "How long this step takes (tap to change)" : "How long does this step take? Tap to set it";
    time.addEventListener("click", e => {
      e.stopPropagation();
      const pick = document.createElement("select");
      pick.className = "step-time-pick";
      pick.add(new Option("? not sure", ""));
      for (const m of STEP_MINUTES) pick.add(new Option(formatMinutes(m), m));
      if (s.minutes && !STEP_MINUTES.includes(s.minutes)) pick.add(new Option(formatMinutes(s.minutes), s.minutes));
      pick.value = s.minutes || "";
      pick.addEventListener("click", ev => ev.stopPropagation());
      pick.addEventListener("change", () => {
        const minutes = pick.value ? Number(pick.value) : null;
        save(t.steps.map(x => (x.id === s.id ? { ...x, minutes } : x)));
        if (minutes) rememberStepTime(t, s, minutes);
      });
      pick.addEventListener("blur", () => { if (pick.isConnected) pick.replaceWith(time); });
      time.replaceWith(pick);
      pick.focus();
      try { pick.showPicker(); } catch {}
    });
    li.append(label, time);
    ul.appendChild(li);
  }
  return ul;
}

// "Next day's problem": push a chore / to-do to the day after the one being looked at.
function nextDaysProblem(t) {
  const from = t.date && t.date > currentDay ? t.date : currentDay;
  const next = addDays(from, 1);
  const before = { ...t };
  persist({ ...t, date: next });
  const when = next === addDays(todayKey(), 1) ? "tomorrow" : fromKey(next).toLocaleDateString(undefined, { weekday: "long" });
  showToast(`😴 "${t.title}" is ${when}'s problem now.`, "Undo", () => persist(before));
}

// "Pick a day": a small chooser with the next week's days as one-tap buttons, and a date box
// for anything later. (A hidden date picker didn't always hand the day back on her phone.)
function pickDayFor(t) {
  let dlg = $("pick-day-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "pick-day-dialog";
    dlg.className = "pick-day-dialog";
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // tap outside to close
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = "";
  const tk = todayKey();
  const move = day => {
    dlg.close();
    if (!day || day === t.date) return;
    const before = { ...t };
    persist({ ...t, date: day });
    const when = day === tk ? "today" : day === addDays(tk, 1) ? "tomorrow"
      : fromKey(day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    showToast(`📅 "${t.title}" moved to ${when}.`, "Undo", () => persist(before));
  };

  dlg.appendChild(el("h3", "pick-day-title", `📅 Move "${t.title}" to…`));
  const grid = el("div", "pick-day-grid");
  for (let i = 0; i <= 7; i++) {
    const day = addDays(tk, i);
    if (day === t.date) continue;
    const d = fromKey(day);
    const b = el("button", "pick-day-btn");
    b.type = "button";
    b.append(el("b", "", i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" })),
      el("span", "", d.toLocaleDateString(undefined, { month: "short", day: "numeric" })));
    b.addEventListener("click", () => move(day));
    grid.appendChild(b);
  }
  dlg.appendChild(grid);

  const row = el("div", "pick-day-later");
  row.appendChild(el("span", "", "Later:"));
  const input = el("input");
  input.type = "date";
  input.min = tk;
  input.value = addDays(tk, 8);
  const go = el("button", "g-btn primary", "Move");
  go.type = "button";
  go.addEventListener("click", () => move(input.value));
  row.append(input, go);
  dlg.appendChild(row);
  const cancel = el("button", "link-btn", "Never mind");
  cancel.type = "button";
  cancel.addEventListener("click", () => dlg.close());
  dlg.appendChild(cancel);
  dlg.showModal();
}

// Set a task row on fire: flames lick up, it chars, crumbles to ash and is gone.
function burnRow(li) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  li.classList.add("burning");
  const fire = document.createElement("div");
  fire.className = "fire";
  const w = li.offsetWidth;
  for (let i = 0; i < 14; i++) {
    const f = document.createElement("span");
    f.className = "flame";
    f.textContent = "🔥";
    f.style.left = `${(i / 14) * w + Math.random() * 20 - 10}px`;
    f.style.fontSize = `${18 + Math.random() * 16}px`;
    f.style.animationDelay = `${Math.random() * 0.35}s`;
    fire.appendChild(f);
  }
  for (let i = 0; i < 12; i++) {
    const e = document.createElement("span");
    e.className = "ember";
    e.style.left = `${Math.random() * w}px`;
    e.style.setProperty("--drift", `${Math.random() * 40 - 20}px`);
    e.style.animationDelay = `${0.2 + Math.random() * 0.6}s`;
    fire.appendChild(e);
  }
  const smoke = document.createElement("span");
  smoke.className = "smoke";
  smoke.textContent = "💨";
  fire.appendChild(smoke);
  li.appendChild(fire);
  return new Promise(resolve => setTimeout(() => {
    // Collapse the gap the ashes leave behind.
    const h = li.offsetHeight;
    li.animate([{ height: h + "px", marginBottom: "0px" }, { height: "0px", marginBottom: "-6px", paddingTop: "0px", paddingBottom: "0px" }],
      { duration: 220, easing: "ease-in", fill: "forwards" }).onfinish = resolve;
  }, 1150));
}

// Delete straight from the row (in a blaze of glory), with a few seconds to undo.
async function deleteTask(t, li) {
  if (li && !calmMode()) {             // (calm mode: no fire, it just goes)
    celebrating = true;           // hold re-renders until the fire is out
    await burnRow(li);
    celebrating = false;
  }
  try {
    await Store.remove(t.id);
    t.deleted = true;
  } catch {
    return showError("Couldn't delete. Try closing and reopening the planner.");
  }
  render();
  const fromGoogle = t.external && t.external.google && t.external.google.imported;
  const fromTodo = t.external && t.external.microsoft && t.external.microsoft.imported;
  showToast(fromGoogle ? `🗑️ Hid "${t.title}" here (it's still in your Google Calendar)`
    : fromTodo ? `🗑️ Hid "${t.title}" here (it's still in Microsoft To Do)` : `🗑️ Deleted "${t.title}"`,
    "Undo", () => persist({ ...t, deleted: false }));
  scheduleSyncs();
}

// After a change, let Google Calendar / To Do catch up a little later.
function scheduleSyncs() {
  if (typeof scheduleGoogleSync === "function") scheduleGoogleSync();
  if (typeof scheduleMicrosoftSync === "function") scheduleMicrosoftSync();
}

function showToast(text, actionLabel, onAction) {
  const toast = $("toast");
  toast.innerHTML = "";
  toast.appendChild(document.createTextNode(text));
  if (actionLabel) {
    const b = document.createElement("button");
    b.textContent = actionLabel;
    b.addEventListener("click", () => { toast.hidden = true; onAction(); });
    toast.appendChild(b);
  }
  toast.hidden = false;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => (toast.hidden = true), 6000);
}

// ---------- month view ----------
let showWorkDays = false;   // calendar "💼 Work days" toggle (remembered on this device)
try { showWorkDays = localStorage.getItem("arpPlanner.showWork") === "1"; } catch {}

function renderMonth() {
  planCache = {};   // plans depend on check-ins and settings, so rebuild each draw
  const monthHeat = { none: 0, tight: 0 };
  $("work-toggle").classList.toggle("on", showWorkDays);
  $("work-legend").hidden = !showWorkDays;
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  $("month-title").textContent = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = $("month-grid");
  grid.innerHTML = "";
  const base = new Date(2024, 0, 7); // a Sunday
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = d.toLocaleDateString(undefined, { weekday: "short" });
    grid.appendChild(h);
  }

  const start = new Date(y, m, 1);
  start.setDate(1 - start.getDay());          // back up to Sunday
  const tk = todayKey();
  const weeks = Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = toKey(d);
    const cell = document.createElement("button");
    cell.className = "cell" + (d.getMonth() !== m ? " other" : "") + (key === tk ? " today" : "");

    const top = document.createElement("span");
    top.className = "cell-top";
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = d.getDate();
    top.appendChild(num);

    // ❗ when something is due that day.
    const dueHere = tasks.filter(t => !t.deleted && !t.done && t.dueDate === key);
    if (dueHere.length) {
      const bang = document.createElement("span");
      bang.className = "cell-due";
      bang.textContent = "❗";
      bang.title = "Due: " + dueHere.map(t => t.title).join(", ");
      top.appendChild(bang);
    }

    // 🛑 when a day (today or later) has more planned than free time.
    if (key >= tk) {
      const dp = planDay(key);
      const spare = freeTimeLeft(key, dp.active).seconds;
      if (dp.planned > 0 && spare < 0) {
        const stop = document.createElement("span");
        stop.className = "cell-due";
        stop.textContent = "🛑";
        stop.title = "No free time left this day: too many tasks";
        top.appendChild(stop);
      }
      // Tally this month's remaining days for the "month on fire" check.
      if (d.getMonth() === m && dp.planned > 0) {
        if (spare < 0) monthHeat.none++;
        else if (spare < 30 * 60) monthHeat.tight++;
      }
    }

    // Holidays tint the whole day.
    const hol = holidayOn(key);
    if (hol) {
      cell.classList.add("holiday");
      cell.style.setProperty("--hol", hol.color);
    }

    // Work-days view: workdays blue, days off green.
    if (showWorkDays) {
      const shift = workHoursFor(key);
      cell.classList.add(shift ? "workday" : "offday");
      cell.appendChild(Object.assign(document.createElement("span"), {
        className: "work-tag", textContent: shift ? `💼 ${shortTime(shift.start)}–${shortTime(shift.end)}` : "🌴 Off",
      }));
    }

    // Workout marker: ✅ when a workout was done, otherwise the planned focus (today on).
    const fit = workoutMarker(key, tk);
    if (fit) {
      const f = document.createElement("span");
      f.className = "cell-fit" + (fit.planned ? " planned" : "");
      f.textContent = fit.emoji;
      f.title = fit.title;
      top.appendChild(f);
    }
    const feel = feelingOf(moods[key]), body = bodyOf(moods[key]);
    if (feel || body) {
      const e = document.createElement("span");
      e.className = "cell-mood";
      e.textContent = (feel ? feel.emoji : "") + (body ? body.emoji : "");
      e.title = [feel && "Feeling: " + feel.label, body && "Body: " + body.label].filter(Boolean).join(" · ");
      top.appendChild(e);
    }
    cell.appendChild(top);
    if (hol) cell.appendChild(Object.assign(document.createElement("span"), { className: "hol-name", textContent: `${hol.emoji} ${hol.name}` }));

    // Cycle phase stripe along the bottom of the cell (dashed = predicted).
    const ci = cycleInfo(key);
    if (ci) {
      cell.classList.add("has-phase");
      if (ci.projected || key > tk) cell.classList.add("predicted");
      cell.style.setProperty("--phase", PHASES[ci.phase].color);
    }

    // In the calendar, deadline tasks show on their due date (not every day they carry over).
    const list = tasks.filter(t => !t.deleted && (t.dueDate ? t.dueDate === key : t.date === key))
      .sort((a, b) => (!a.time !== !b.time ? (a.time ? -1 : 1) : byTime(a, b)));
    for (const t of list.slice(0, 3)) {
      const p = document.createElement("span");
      p.className = "peek" + (t.done ? " done" : "");
      p.textContent = (burnoutRisk(t, key) ? "⚠️ " : "") + (t.dueDate ? "⏰ " : t.time ? formatTime(t.time) + " " : "") +
        (isTodo(t) ? "✔️ " : "") + t.title;
      if (isTodo(t)) p.classList.add("todo");
      const c = t.dueDate ? null : LEVEL_COLOR[levelOf(t, key)];
      if (t.dueDate) p.classList.add("due");
      if (c) p.style.setProperty("--dot", c);
      cell.appendChild(p);
    }
    if (list.length > 3) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${list.length - 3} more`;
      cell.appendChild(more);
    }
    cell.title = (hol ? `${hol.emoji} ${hol.name} · ` : "") + (dueHere.length ? `❗ ${dueHere.length} due · ` : "") +
      (list.length ? plural(list.length, "task") : "No tasks") +
      (ci ? ` · Cycle day ${ci.cycleDay}, ${PHASES[ci.phase].label.toLowerCase()}` : "");
    cell.addEventListener("click", () => openDayPeek(key));      // a quick look; "Go to that day" opens it
    grid.appendChild(cell);
  }

  const legend = $("phase-legend");
  legend.hidden = !(cycle.starts || []).length;
  legend.innerHTML = "";
  for (const p of Object.values(PHASES)) {
    const s = document.createElement("span");
    s.style.setProperty("--phase", p.color);
    s.textContent = `${p.emoji} ${p.short}`;
    legend.appendChild(s);
  }
  legend.appendChild(Object.assign(document.createElement("em"), { textContent: "Dashed = predicted" }));

  // A month with a steady lack of free time sets the bottom of the calendar on fire.
  const hot = monthHeat.none + monthHeat.tight;
  const level = monthHeat.none >= 5 || hot >= 8 ? 2 : monthHeat.none >= 2 || hot >= 4 ? 1 : 0;
  const parts = [monthHeat.none && plural(monthHeat.none, "day") + " with no free time",
    monthHeat.tight && `${monthHeat.tight} more cutting it close`].filter(Boolean).join(", ");
  setFireFloor(level, level === 2
    ? `🔥 This month is on fire! ${parts}. Spread things out before you burn out.`
    : `🔥 Things are heating up: ${parts}. Leave some days lighter.`);

  const fitLegend = $("fit-legend");
  const cats = goalCats();
  fitLegend.hidden = !cats.length;
  fitLegend.textContent = "Workouts: " + cats.map(c => `${CAT_INFO[c].emoji} ${CAT_INFO[c].label}`).join(" · ") +
    " · ✅ Workout done" + (prof("goals").includes("pt") ? " · 😴 Rest before PT test · 🏁 PT test day" : "") +
    " · ⚠️ Physical job on a workday";
}

// Planned workout focus per day, cached per week while the calendar draws.
let planCache = {};
function workoutMarker(key, tk) {
  const done = tasks.some(t => !t.deleted && t.done && kindOf(t) === "workout" && (t.doneDate || t.date) === key);
  if (done) return { emoji: "✅", title: "Workout done!" };
  if (key < tk || !goalCats().length) return null;
  const left = ptDaysLeft(key);
  if (left === 0) return { emoji: "🏁", title: "PT test day!" };
  if (left === 1) return { emoji: "😴", title: "Rest day before the PT test", planned: true };
  const ws = addDays(key, -fromKey(key).getDay());
  if (!planCache[ws]) planCache[ws] = Object.fromEntries(weekPlan(ws).map(p => [p.day, p.cat]));
  const cat = planCache[ws][key];
  return cat ? { emoji: CAT_INFO[cat].emoji, title: `Planned workout: ${CAT_INFO[cat].label}`, planned: true } : null;
}

// ---------- views ----------
let view = "home";               // the app opens on the Home screen
function showView(v) {
  view = v;
  if (v === "home") currentDay = todayKey();
  if (v === "todo") currentDay = todayKey();      // ticking off / chips there are about today
  for (const name of ["home", "day", "month", "todo", "recap", "settings"]) {
    $(name + "-view").hidden = v !== name;
    $("tab-" + name).classList.toggle("active", v === name);
  }
  if (v === "month") {
    monthCursor = fromKey(currentDay);
    monthCursor.setDate(1);
  }
  render();
}

function render() {
  brainByName = null;              // brainpower she rated by name: re-read from the latest tasks
  if (view !== "day" && view !== "month") setFireFloor(0);
  if (view === "home") renderHome();
  else if (view === "day") { renderDay(); renderSidebar(); renderFitIn(); renderAssistant(); }
  else if (view === "month") renderMonth();
  else if (view === "todo") renderTodo();
  else if (view === "settings") {
    renderAppearance();
    renderTimeZone();
    renderGoogleSettings(); renderMicrosoftSettings(); renderHealthSettings();   // (her phone signs in with paste-back)
    if (STANDALONE) renderPhoneApp(); else if (ON_PC) renderPhoneSettings(); else renderPcOnlyNotes();
    renderCycleSettings();
    renderBrainSettings();
    renderAiSettings();
    renderFitness();
  }
  else renderRecap();
  if ($("checkin-dialog").open) renderCheckin();
  if ($("focus-dialog") && $("focus-dialog").open) renderFocus();
}

// ---------- Settings: each section opens and closes (instead of one long page) ----------
const OPEN_SECTIONS_KEY = "arpPlanner.openSettings";
let openSections = [];
try { openSections = JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY)) || []; } catch {}

function sectionKey(card) {
  return card.querySelector(":scope > h3").textContent.replace(/[^A-Za-z ]/g, "").trim();
}

function setSectionOpen(card, open) {
  card.classList.toggle("open", open);
  card.querySelector(":scope > h3").setAttribute("aria-expanded", String(open));
  const key = sectionKey(card);
  openSections = open ? [...new Set([...openSections, key])] : openSections.filter(k => k !== key);
  try { localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(openSections)); } catch {}
}

(function setupSettingsSections() {
  for (const card of document.querySelectorAll("#settings-view > .fit-card")) {
    const h = card.querySelector(":scope > h3");
    card.classList.add("section");
    h.classList.add("section-head");
    h.setAttribute("role", "button");
    h.tabIndex = 0;
    const chevron = document.createElement("span");      // (el() isn't loaded yet at this point)
    chevron.className = "section-chevron";
    chevron.textContent = "▾";
    h.appendChild(chevron);
    const toggle = () => setSectionOpen(card, !card.classList.contains("open"));
    h.addEventListener("click", toggle);
    h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    setSectionOpen(card, openSections.includes(sectionKey(card)));
  }
})();

// Jump to one Settings section and open it (e.g. "Set up your cycle in Settings").
function openSettingsSection(boxId) {
  showView("settings");
  const card = $(boxId) && $(boxId).closest(".fit-card");
  if (!card) return;
  setSectionOpen(card, true);
  card.scrollIntoView({ behavior: calmMode() ? "auto" : "smooth", block: "start" });
}

// ---------- Settings → Time zone ----------
const TIME_ZONES = [
  ["America/Los_Angeles", "🌲 Pacific: Washington, Oregon, California"],
  ["America/Denver", "⛰️ Mountain: Colorado, Utah"],
  ["America/Phoenix", "🌵 Arizona"],
  ["America/Chicago", "🌾 Central: Texas, Illinois"],
  ["America/New_York", "🗽 Eastern: New York, Florida"],
  ["America/Anchorage", "🏔️ Alaska"],
  ["Pacific/Honolulu", "🌺 Hawaii"],
  ["Asia/Tokyo", "🗾 Japan"],
  ["Europe/London", "🇬🇧 UK"],
];

function renderTimeZone() {
  const box = $("tz-settings");
  if (!box) return;
  box.innerHTML = "";
  box.appendChild(el("p", "hint-small", "Her days, her clock: \"today\", the free-time timer, and Google and To Do times all use this zone, on the PC and on her phone."));
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sel = el("select", "tz-select");
  sel.add(new Option(`This device's own clock (${here})`, ""));
  for (const [id, label] of TIME_ZONES) sel.add(new Option(label, id));
  const cur = plannerZone() || "";
  if (cur && !TIME_ZONES.some(([id]) => id === cur)) sel.add(new Option(cur, cur));
  sel.value = cur;
  sel.addEventListener("change", async () => {
    await saveProfile({ timeZone: sel.value || null });
    currentDay = todayKey();
    render();
    showToast(`🕒 Using ${sel.value ? sel.options[sel.selectedIndex].text : "this device's clock"}. Updating Google and To Do times…`);
    if (typeof syncGoogle === "function") syncGoogle(false);
    if (typeof syncMicrosoft === "function") syncMicrosoft(false);
  });
  box.appendChild(sel);
  const now = nowLocal();
  box.appendChild(el("p", "tz-now", `It's ${formatTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`)} on ` +
    `${now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} for her.`));

  // 12-hour (3:00 PM) or 24-hour (15:00) clock.
  const row = el("div", "clock-row");
  row.appendChild(el("span", "clock-label", "Clock"));
  const seg = el("div", "sort-toggle");
  for (const [on, text] of [[false, "12-hour · 3:00 PM"], [true, "24-hour · 15:00"]]) {
    const b = el("button", "sort-btn" + (use24() === on ? " active" : ""), text);
    b.type = "button";
    b.addEventListener("click", async () => {
      await saveProfile({ clock24: on });
      if (use24() !== on) showError("The clock setting didn't save. Close the planner and open it again.");
      render();
    });
    seg.appendChild(b);
  }
  row.appendChild(seg);
  box.appendChild(row);
}

// 🔋 Brain & body: what happens when the brain battery runs out (her choice).
function renderBrainSettings() {
  const box = $("brain-settings");
  if (!box) return;
  box.innerHTML = "";
  box.appendChild(el("p", "hint-small", "Two batteries on the Day tab: 💪 Body for physical jobs and workouts, 🧠 Brain for " +
    "thinking, deciding, people and noise. Work, sleep, your check-in and your cycle all change how full they start. " +
    "Brain-heavy jobs are kept apart, and are best between 2 hours after you wake and 2 hours before bed."));
  const row = el("div", "clock-row");
  row.appendChild(el("span", "clock-label", "When the 🧠 Brain battery runs out"));
  const seg = el("div", "sort-toggle");
  for (const [mode, text] of [["suggest", "💡 Suggest what to move"], ["auto", "🤖 Move them for me"]]) {
    const b = el("button", "sort-btn" + (brainMode() === mode ? " active" : ""), text);
    b.type = "button";
    b.addEventListener("click", async () => { await saveProfile({ brainEmpty: mode }); render(); });
    seg.appendChild(b);
  }
  row.appendChild(seg);
  box.appendChild(row);
  box.appendChild(el("p", "hint-small", brainMode() === "auto"
    ? "Brain-heavy jobs that aren't due or important go to \"Can wait\" by themselves, with a button to move them to a day with room."
    : "You'll see which brain-heavy jobs could wait, and one tap makes them next day's problem."));
}

function setSort(mode) {
  sortMode = mode;
  try { localStorage.setItem("dailyPlanner.sort", mode); } catch {}
  render();
}

// ---------- editing ----------
// Time picker: Hour dropdown ("Anytime" or 1-12 with AM/PM, or 00-23 on the 24-hour clock),
// Minute (5-minute steps). Start ("f-") and end ("f-end-") times use the same dropdowns.
let pickerClock = null;          // which clock the hour dropdowns are built for
function buildHourOptions() {
  if (pickerClock === use24()) return;
  pickerClock = use24();
  for (const [p, none] of [["f-", "Anytime"], ["f-end-", "—"]]) {
    const sel = $(p + "hour");
    sel.innerHTML = "";
    sel.add(new Option(none, ""));
    if (pickerClock) for (let h = 0; h < 24; h++) sel.add(new Option(pad(h), h));
    else for (let h = 1; h <= 12; h++) sel.add(new Option(h, h));
    $(p + "ampm").hidden = pickerClock;
  }
}

(function buildFields() {
  const add = (sel, value, text) => sel.add(new Option(text, value));
  buildHourOptions();
  for (const p of ["f-", "f-end-"]) {
    for (let m = 0; m < 60; m += 5) add($(p + "minute"), pad(m), pad(m));
  }
  add($("f-minutes"), "", "How long? (not sure)");
  for (const m of CHORE_MINUTES) add($("f-minutes"), m, "Takes " + formatMinutes(m));
  for (const a of CHORE_AREAS) add($("f-area"), a, a === "Anywhere" ? "Anywhere in the house" : a);
})();

function updateTimeEnabled() {
  for (const p of ["f-", "f-end-"]) {
    const off = !$(p + "hour").value;
    $(p + "minute").disabled = off;
    $(p + "ampm").disabled = off;
  }
  $("f-end-hour").disabled = !$("f-hour").value;   // no end time without a start time
}

function setTriple(p, time) {
  if (!time) {
    $(p + "hour").value = "";
    $(p + "minute").value = "00";
    $(p + "ampm").value = "AM";
  } else {
    const [h, m] = time.split(":").map(Number);
    $(p + "hour").value = String(use24() ? h : ((h + 11) % 12) + 1);
    if (![...$(p + "minute").options].some(o => o.value === pad(m))) {
      $(p + "minute").add(new Option(pad(m), pad(m)));   // keep odd minutes (e.g. from sync)
    }
    $(p + "minute").value = pad(m);
    $(p + "ampm").value = h < 12 ? "AM" : "PM";
  }
  updateTimeEnabled();
}

function readTriple(p) {
  if (!$(p + "hour").value) return null;
  if (use24()) return `${pad(Number($(p + "hour").value))}:${$(p + "minute").value}`;
  let h = Number($(p + "hour").value) % 12;
  if ($(p + "ampm").value === "PM") h += 12;
  return `${pad(h)}:${$(p + "minute").value}`;
}

const setTimeFields = time => setTriple("f-", time);
const readTimeFields = () => readTriple("f-");

// "HH:MM" plus some minutes, wrapping past midnight.
function addMinutesTo(time, mins) {
  const t = (toMin(time) + mins) % (24 * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
const endTimeOf = t => (t.time && t.minutes ? addMinutesTo(t.time, t.minutes) : null);

// Duration dropdown: add an exact option when an end time gives an odd length (e.g. 75 min).
function setDuration(mins) {
  const sel = $("f-minutes");
  if (mins && ![...sel.options].some(o => o.value === String(mins))) {
    sel.add(new Option("Takes " + formatHrsMin(mins * 60), mins));
  }
  sel.value = mins ? String(mins) : "";
}

// Keep start, end and duration in step: a duration sets the end; an end sets the duration.
function syncEndFromDuration() {
  const start = readTimeFields(), mins = Number($("f-minutes").value);
  setTriple("f-end-", start && mins ? addMinutesTo(start, mins) : null);
}
function syncDurationFromEnd() {
  const start = readTimeFields(), end = readTriple("f-end-");
  if (!start || !end) return;
  let mins = toMin(end) - toMin(start);
  if (mins <= 0) mins += 24 * 60;
  setDuration(mins);
}

// Segmented buttons (kind, importance).
function setSeg(id, value) {
  for (const b of $(id).querySelectorAll("button")) b.classList.toggle("active", b.dataset.value === value);
}
const getSeg = id => ($(id).querySelector("button.active") || {}).dataset?.value;

function updateDialogVisibility() {
  const kind = getSeg("f-kind");
  $("task-form").classList.toggle("is-chore", kind === "chore");
  $("task-form").classList.toggle("is-workout", kind === "workout");
  $("task-form").classList.toggle("is-task", kind === "task");
  $("task-form").classList.toggle("is-event", kind === "event");
  $("details-label").textContent = kind === "chore" ? "Details" : "How long will this take?";
  const hasDue = $("f-has-due").checked;
  $("due-row").hidden = !hasDue;
  $("f-priority").hidden = hasDue;
  $("f-title").placeholder =
    kind === "event" ? "e.g. Dentist appointment" :
    kind === "chore" ? "e.g. Unload the dishwasher" :
    kind === "workout" ? "e.g. Primal squats + stretch" : "e.g. Pick up groceries";
}

function openDialog(task) {
  editing = task || null;
  const day = task ? task.date || todayKey() : currentDay;    // a to-do may have no day yet
  $("dialog-title").textContent = task ? "Edit task" : "Add a task";
  $("dialog-day").textContent = task && !task.date ? "No day yet (from To Do)" : fromKey(day)
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  $("f-title").value = task ? task.title : "";
  $("f-notes").value = task ? task.notes || "" : "";
  buildHourOptions();               // the clock setting may have changed since last time
  setTimeFields(task ? task.time : null);
  setSeg("f-kind", task ? kindOf(task) : "task");
  setSeg("f-priority", task ? task.priority || "normal" : "normal");
  setSeg("f-effort", task ? effortOf(task) : "light");
  effortTouched = !!task;
  setSeg("f-brain", task ? brainOf(task) : "medium");
  brainTouched = !!(task && (task.brain || rememberedBrain(task)));
  setDuration(task ? task.minutes || null : 15);
  // A task whose steps have times: its length is their total, set from the steps themselves.
  const fromSteps = task && stepsTotal(task.steps) !== null;
  $("f-minutes").disabled = fromSteps;
  $("f-minutes").title = fromSteps ? "Added up from its sub-tasks. Change the sub-task times to change this." : "";
  $("f-steps-note").hidden = !fromSteps;
  setTriple("f-end-", task ? endTimeOf(task) : null);
  $("f-area").value = task && task.area || "Anywhere";
  $("f-has-due").checked = !!(task && task.dueDate);
  $("f-due").min = day;
  $("f-due").value = task && task.dueDate || addDays(day, 7);
  updateDialogVisibility();
  $("f-remembered").hidden = true;
  rememberedFrom = null;
  $("delete-task").hidden = !task;
  delete $("delete-task").dataset.armed;
  $("delete-task").textContent = "Delete";
  $("task-dialog").showModal();
  $("f-title").focus();
}

// Adding a task she's done before ("Laundry")? Fill it in the way she had it last time.
let rememberedFrom = null;
function fillFromMemory() {
  if (editing) return;                               // only for new tasks
  const prev = lastTaskNamed($("f-title").value);
  if (!prev || prev.id === rememberedFrom) return;
  rememberedFrom = prev.id;
  setSeg("f-kind", kindOf(prev) === "event" && !prev.time ? "task" : kindOf(prev));
  if (prev.minutes) setDuration(prev.minutes);
  if (prev.effort) { setSeg("f-effort", prev.effort); effortTouched = true; }
  else if (!effortTouched) setSeg("f-effort", { chore: "medium", workout: "medium" }[kindOf(prev)] || "light");
  if (prev.brain) { setSeg("f-brain", prev.brain); brainTouched = true; }
  if (prev.area) $("f-area").value = prev.area;
  if (prev.priority) setSeg("f-priority", prev.priority);
  updateDialogVisibility();
  const bits = [{ chore: "🧹 chore", workout: "🏃 workout", event: "📅 event" }[kindOf(prev)],
    prev.minutes && `⏱ ${formatHrsMin(prev.minutes * 60)}`, prev.area && prev.area !== "Anywhere" && prev.area].filter(Boolean);
  $("f-remembered").textContent = `💡 Filled in from last time${bits.length ? ": " + bits.join(" · ") : ""}. Change anything you like.`;
  $("f-remembered").hidden = false;
}
$("f-title").addEventListener("change", fillFromMemory);
// Until she picks a brainpower herself, guess it from the name as she types.
let brainTouched = false;
function guessBrainInDialog() {
  if (!brainTouched) setSeg("f-brain", guessBrain({ title: $("f-title").value, kind: getSeg("f-kind") || "task", time: readTimeFields() }));
}
$("f-title").addEventListener("input", () => {
  guessBrainInDialog();
  if (lastTaskNamed($("f-title").value)) fillFromMemory();
  else { $("f-remembered").hidden = true; rememberedFrom = null; }   // a new name: keep what's there, drop the note
});

async function saveFromDialog() {
  const title = $("f-title").value.trim();
  if (!title) return;
  const base = editing || { id: newId(), date: currentDay, done: false, createdAt: new Date().toISOString(), external: {} };
  const kind = getSeg("f-kind") || "task";
  let due = $("f-has-due").checked ? $("f-due").value || null : null;
  if (due && base.date && due < base.date) due = base.date;
  const task = {
    ...base,
    kind,
    title,
    notes: $("f-notes").value.trim(),
    time: readTimeFields(),
    priority: getSeg("f-priority") || "normal",
    dueDate: due,
    minutes: $("f-minutes").value ? Number($("f-minutes").value) : null,
    area: kind === "chore" ? $("f-area").value : null,
    effort: getSeg("f-effort") || "light",
    brain: getSeg("f-brain") || "medium",
  };
  await persist(task);
  if (task.date) warnIfOverloaded(task.date);
}

// by: "her" (anything she does on screen) or "claude" (the Claude helper). When she moves a task
// herself it's marked (herMove), so Claude's automatic re-plans leave it where she put it; when she
// sets a length herself it's no longer a guess.
async function persist(task, rerender = true, { by = "her" } = {}) {
  const old = tasks.find(t => t.id === task.id);
  if (by === "her" && old) {
    if ((old.date || null) !== (task.date || null) || (old.time || null) !== (task.time || null)) task = { ...task, herMove: new Date().toISOString() };
    if (old.minutesGuess && old.minutes !== task.minutes) task = { ...task, minutesGuess: false };
  }
  try {
    const saved = await Store.put(task);
    const i = tasks.findIndex(t => t.id === saved.id);
    if (i >= 0) tasks[i] = saved; else tasks.push(saved);
    scheduleSyncs();
  } catch {
    showError("Couldn't save. Is the planner still running? Try closing and reopening it.");
  }
  if (rerender) render();
}

let celebrating = false;   // an animal is crossing out a task; hold re-renders

async function toggleDone(t, li) {
  if (celebrating) return;
  const updated = { ...t, done: !t.done, doneDate: t.done ? null : currentDay };
  if (updated.done && brainOf(t) === "heavy" && !isWorkShift(t)) {
    setTimeout(() => showToast("🧠 Big brain one done! A 10-minute recharge before the next thing? 💛", "Start break", startBrainBreak), 50);
  }
  if (!updated.done || !li || calmMode()) return persist(updated);   // calm mode: just a quiet ✓
  celebrating = true;
  li.classList.add("finishing");
  li.querySelector(".check-btn").textContent = "✓";
  await Promise.all([persist(updated, false), playFinish(li)]);
  celebrating = false;
  render();
}

async function deleteEditing() {
  if (!editing) return;
  const btn = $("delete-task");
  if (!btn.dataset.armed) {          // first click asks, second click deletes
    btn.dataset.armed = "1";
    btn.textContent = "Click again to delete";
    return;
  }
  try {
    await Store.remove(editing.id);
    editing.deleted = true;
  } catch {
    showError("Couldn't delete. Try closing and reopening the planner.");
  }
  $("task-dialog").close();
  render();
}

// ---------- wiring ----------
// Print / Save as PDF: the browser's print dialog has "Save as PDF" as a printer.
for (const b of document.querySelectorAll("[data-print]")) b.addEventListener("click", () => window.print());

$("work-toggle").addEventListener("click", () => {
  showWorkDays = !showWorkDays;
  try { localStorage.setItem("arpPlanner.showWork", showWorkDays ? "1" : "0"); } catch {}
  render();
});

$("tab-home").addEventListener("click", () => showView("home"));
$("tab-day").addEventListener("click", () => showView("day"));
$("tab-settings").addEventListener("click", () => showView("settings"));
$("tab-month").addEventListener("click", () => showView("month"));
// Calendar legend: hidden until she asks for it (remembered on this device).
function setLegendOpen(open) {
  $("legend-box").hidden = !open;
  $("legend-btn").setAttribute("aria-expanded", String(open));
  $("legend-btn").classList.toggle("open", open);
  try { localStorage.setItem("arpPlanner.legend", open ? "1" : "0"); } catch {}
}
$("legend-btn").addEventListener("click", () => setLegendOpen($("legend-box").hidden));
try { setLegendOpen(localStorage.getItem("arpPlanner.legend") === "1"); } catch { setLegendOpen(false); }
$("tab-todo").addEventListener("click", () => showView("todo"));
$("tab-recap").addEventListener("click", () => { recapAnchor = todayKey(); showView("recap"); });
const goDay = day => { currentDay = day; showOptional = false; render(); };
$("prev-day").addEventListener("click", () => goDay(addDays(currentDay, -1)));
$("next-day").addEventListener("click", () => goDay(addDays(currentDay, 1)));
$("today-btn").addEventListener("click", () => goDay(todayKey()));
$("prev-month").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() - 1); render(); });
$("next-month").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() + 1); render(); });
$("this-month").addEventListener("click", () => { monthCursor = nowLocal(); monthCursor.setDate(1); render(); });
$("sort-plan").addEventListener("click", () => setSort("plan"));
$("sort-time").addEventListener("click", () => setSort("time"));
$("add-task").addEventListener("click", () => openDialog(null));
$("cancel-task").addEventListener("click", () => $("task-dialog").close());
$("delete-task").addEventListener("click", deleteEditing);
let effortTouched = false;   // until she picks an effort herself, follow the kind's default
for (const id of ["f-kind", "f-priority", "f-effort", "f-brain"]) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    setSeg(id, b.dataset.value);
    if (id === "f-effort") effortTouched = true;
    if (id === "f-brain") brainTouched = true;
    if (id === "f-kind" && !effortTouched) setSeg("f-effort", { chore: "medium", workout: "medium" }[b.dataset.value] || "light");
    if (id === "f-kind") guessBrainInDialog();
    updateDialogVisibility();
  });
}
$("f-has-due").addEventListener("change", updateDialogVisibility);
$("f-hour").addEventListener("change", e => {
  const wasAnytime = $("f-minute").disabled;
  updateTimeEnabled();
  // Sensible AM/PM guess when a time is first picked: 7-11 morning, 12-6 afternoon.
  const h = Number(e.target.value);
  if (h && wasAnytime && !use24()) $("f-ampm").value = h >= 7 && h <= 11 ? "AM" : "PM";
  syncEndFromDuration();
});
for (const id of ["f-minute", "f-ampm", "f-minutes"]) $(id).addEventListener("change", syncEndFromDuration);
for (const id of ["f-end-hour", "f-end-minute", "f-end-ampm"]) {
  $(id).addEventListener("change", () => {
    updateTimeEnabled();
    // First pick of an end hour: guess AM/PM so the end lands after the start.
    if (id === "f-end-hour" && !use24() && readTriple("f-end-") && readTimeFields()) {
      const start = toMin(readTimeFields());
      const asAm = toMin(readTriple("f-end-").replace(/^\d+/, h => pad(Number(h) % 12)));
      $("f-end-ampm").value = asAm > start ? "AM" : "PM";
    }
    syncDurationFromEnd();
  });
}
$("task-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("task-dialog").close();
  await saveFromDialog();
});

document.addEventListener("keydown", e => {
  if ($("task-dialog").open || view !== "day") return;
  if (e.key === "ArrowLeft") $("prev-day").click();
  if (e.key === "ArrowRight") $("next-day").click();
});

// Keep "Up next" and "Today" fresh if the window stays open (incl. past midnight).
let lastToday = todayKey();
setInterval(() => {
  const tk = todayKey();
  if (tk !== lastToday && currentDay === lastToday) currentDay = tk;
  lastToday = tk;
  applyTheme();   // "Automatic" theme follows the real season
  renderQuietly();
}, 60 * 1000);

// Tell the local server we're alive so it shuts down after the window closes.
if (Store === ApiStore) {
  const pageId = newId();
  // The reply carries a "build" stamp. When the planner gets updated it changes, and this page
  // reloads itself to pick up the new version (waiting until she isn't typing or editing).
  let build = null, updateWaiting = false, dataStamp = null;
  const reloadWhenSafe = () => {
    if (celebrating || userIsEditing() || document.querySelector("dialog[open]")) return;
    location.reload();
  };
  const beat = async () => {
    try {
      const r = await (await fetch("/api/heartbeat?page=" + pageId, { method: "POST" })).json();
      if (r.build && build && r.build !== build) updateWaiting = true;
      if (r.build && !build) build = r.build;
      if (updateWaiting) reloadWhenSafe();
      // Her phone app's changes arrive through Drive (drive.py): show them.
      if (r.data && dataStamp && r.data !== dataStamp && !userIsEditing() && !celebrating) reloadFromStore();
      if (r.data) dataStamp = r.data;
    } catch {}
  };
  beat();
  setInterval(beat, 20 * 1000);
  // A phone may have slept through the update: check as soon as it's looked at again.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  addEventListener("pagehide", () => navigator.sendBeacon("/api/bye?page=" + pageId));
} else if (STANDALONE && "serviceWorker" in navigator) {
  // The phone app: sw.js keeps it working offline. A newly published version downloads in the
  // background and is swapped in (a quick reload) once she isn't typing or in a dialog.
  let reg = null, reloading = false;
  const hadVersion = !!navigator.serviceWorker.controller;     // (first visit: nothing to swap out)
  const swapWhenSafe = () => {
    if (!reg || !reg.waiting || celebrating || userIsEditing() || document.querySelector("dialog[open]")) return;
    reg.waiting.postMessage("update");
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadVersion) return;
    reloading = true;
    try { sessionStorage.setItem("arpUpdated", "1"); } catch {}
    location.reload();
  });
  try {
    if (sessionStorage.getItem("arpUpdated")) {
      sessionStorage.removeItem("arpUpdated");
      setTimeout(() => showToast("✨ The planner just updated to its newest version."), 800);
    }
  } catch {}
  navigator.serviceWorker.register("sw.js").then(r => {
    reg = r;
    r.addEventListener("updatefound", () => {
      const w = r.installing;
      if (w && navigator.serviceWorker.controller) showToast("✨ Downloading a planner update… it swaps in by itself in a moment.");
      w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) swapWhenSafe(); });
    });
    swapWhenSafe();
  }).catch(() => {});
  setInterval(swapWhenSafe, 20 * 1000);
  // Look for a new version whenever she comes back to the app.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && reg) reg.update().catch(() => {}); });
}

// Background redraws (a sync finished, her Drive copy came in) wait until she hasn't touched the
// screen for a moment: a redraw in the middle of a tap swallows the tap, and it feels frozen.
let lastTouch = 0;
addEventListener("pointerdown", () => { lastTouch = Date.now(); }, true);
addEventListener("keydown", () => { lastTouch = Date.now(); }, true);
function renderQuietly() {
  clearTimeout(renderQuietly.t);
  const wait = 1200 - (Date.now() - lastTouch);
  if (wait > 0) { renderQuietly.t = setTimeout(renderQuietly, wait + 50); return; }
  if (celebrating || $("task-dialog").open || userIsEditing()) { renderQuietly.t = setTimeout(renderQuietly, 2000); return; }
  render();
}

// Data changed underneath the page (her Drive copy merged in, or a sync ran): show it.
async function reloadFromStore() {
  const data = await Store.load();
  ({ tasks, moods } = data);
  if (data.cycle) cycle = data.cycle;
  profile = data.profile || {};
  applyTheme();
  renderQuietly();
}

// The first draw waits until every script on the page has run (a slow file, like the animation
// player, could otherwise leave the screen half-drawn until the next refresh).
const pageReady = document.readyState === "loading"
  ? new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true })) : Promise.resolve();

(async function init() {
  try {
    const loading = Store.load();
    await pageReady;
    const data = await loading;
    ({ tasks, moods } = data);
    if (data.cycle) cycle = data.cycle;
    profile = data.profile || {};
    // "Today" was worked out before her time zone was known: work it out again on her clock.
    currentDay = todayKey();
    monthCursor = fromKey(currentDay);
    monthCursor.setDate(1);
    applyTheme();   // her saved look (light/dark + season)
  } catch {
    showError("Couldn't load your tasks. Try closing and reopening the planner.");
  }
  render();
})();
