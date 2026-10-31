// ARP Planner UI: a day view (default) and a month calendar.

// ---------- date helpers (dates are local "YYYY-MM-DD" strings) ----------
const pad = n => String(n).padStart(2, "0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
// "Now" for this screen (Settings → Time Zone): a Date whose local fields (getHours, getDate...)
// read as wall-clock time there. Every device shows HER time (her home zone, Pacific if unset)
// unless this device picked 🗾 Tokyo (Logan's PC). Task times are always her times either way.
function plannerZone() {
  try { return (profile && profile.timeZone) || null; } catch { return null; }   // (profile isn't declared yet at first)
}
const HER_DEFAULT_ZONE = "America/Los_Angeles";
const LOGAN_ZONE = "Asia/Tokyo";
function viewZone() {                                 // this device only: "her" or "tokyo"
  try { return localStorage.getItem("arpPlanner.viewZone") === "tokyo" ? "tokyo" : "her"; } catch { return "her"; }
}
function nowLocal() {
  const zone = viewZone() === "tokyo" ? LOGAN_ZONE : plannerZone() || HER_DEFAULT_ZONE;
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
  return tasks.filter(t => visibleOn(t, day) && !isDayNote(t)).sort((a, b) => {      // (LEAVE / DRILL are notes on the day, above the list)
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

// ✋ Her own order for a day's untimed things: hold a row on the Day tab, drag it, drop it on the
// bar (within its section). Kept as one list of ids per day in profile.dayOrder (synced, last
// two weeks). Each section keeps its place; her order only reshuffles the rows inside it. Focus
// mode follows it too, and the Claude buttons (easy wins first / by area) fill it in.
const myOrderOf = day => (profile.dayOrder && profile.dayOrder[day]) || null;
function byMyOrder(list, day) {
  const order = myOrderOf(day);
  if (!order || !order.length) return list;
  const at = new Map(order.map((id, i) => [id, i]));
  const slots = [], ranked = [];
  list.forEach((t, i) => { if (at.has(t.id)) { slots.push(i); ranked.push(t); } });
  ranked.sort((a, b) => at.get(a.id) - at.get(b.id));
  const out = [...list];
  slots.forEach((s, k) => { out[s] = ranked[k]; });
  return out;
}
// ids: some tasks in their new order. They take the place the first of them had (or go at the end).
function saveMyOrder(day, ids, { replace = false } = {}) {
  const old = replace ? [] : (myOrderOf(day) || []), set = new Set(ids);
  const first = old.findIndex(id => set.has(id));
  const rest = old.filter(id => !set.has(id));
  const at = first < 0 ? rest.length : old.slice(0, first).filter(id => !set.has(id)).length;
  const cutoff = addDays(todayKey(), -14);
  const all = Object.fromEntries(Object.entries(profile.dayOrder || {}).filter(([d]) => d >= cutoff));
  all[day] = [...rest.slice(0, at), ...ids, ...rest.slice(at)];
  profile = { ...profile, dayOrder: all };
  pushProfile();
}
const localStamp = () => { const n = nowLocal(); return `${toKey(n)}T${pad(n.getHours())}:${pad(n.getMinutes())}`; };
const weekStartOf = day => addDays(day, -fromKey(day).getDay());     // weeks start on Sunday (like the Recap)

// Little marks on days, for the Recap (🔥 total chaos, unfinished tasks). Kept about a year.
function markDays(kind, days) {
  const m = profile.dayMarks || {}, have = new Set(m[kind] || []);
  const add = days.filter(d => !have.has(d));
  if (!add.length) return;
  const cutoff = addDays(todayKey(), -400);
  profile = { ...profile, dayMarks: { ...m, [kind]: [...have, ...add].filter(d => d >= cutoff).sort() } };
  pushProfile();
}

// Before the 🌏 Time Zone setting, Logan's PC ran on Tokyo's clock, so on Oct 25, 2026 (Tokyo) it
// treated her Oct 25 as "today" half a day early and marked it 🔥 total chaos (a Coat Rack and a
// Volcano on a day that hadn't started). Clear those once, on whichever device opens first.
function fixTokyoMarks() {
  const m = profile.dayMarks;
  if (!m || (m.fixed || []).includes("tokyo-1025")) return;
  const drop = list => (list || []).filter(d => d !== "2026-10-25");
  profile = { ...profile, dayMarks: { ...m, fire: drop(m.fire), chaos90: drop(m.chaos90), fixed: [...(m.fixed || []), "tokyo-1025"] } };
  pushProfile();
}

// 🔁 Unfinished tasks and chores roll on to today by themselves. Appointments (anything with a
// time), workouts, deadline items (they already stay until done), repeating to-dos (they have
// ⏭️ Catch up) and Google events stay where they are.
const canRoll = t => !t.deleted && !t.done && !!t.date && !t.dueDate && !t.time && ["task", "chore"].includes(kindOf(t))
  && !isWorkShift(t) && !(typeof repeatsOf === "function" && repeatsOf(t)) && !(t.external && t.external.google && t.external.google.imported);
let rolling = false;
async function rollOverUnfinished() {
  if (rolling || !tasks.length) return;
  rolling = true;
  try {
    const tk = todayKey();
    const late = tasks.filter(t => canRoll(t) && t.date < tk && t.date >= addDays(tk, -14));   // (very old leftovers stay put)
    const days = new Set();
    for (const t of late) {
      for (let d = t.date; d < tk; d = addDays(d, 1)) if (!isSickDay(d)) days.add(d);
      await persist({ ...t, date: tk, rolledFrom: t.rolledFrom || t.date }, false, { by: "planner" });
    }
    if (days.size) markDays("unfinished", [...days]);
    // New week: last week's finish times are let go (so the phone never fills up with them).
    const week = weekStartOf(tk);
    for (const t of tasks.filter(t => t.doneAt && t.doneAt.slice(0, 10) < week)) await persist({ ...t, doneAt: null }, false, { by: "planner" });
    if (late.length) {
      render();
      showToast(`🔁 ${plural(late.length, "unfinished thing")} rolled over to today. No stress, ${late.length === 1 ? "it" : "they"} just came along 💛`);
    }
  } catch {} finally { rolling = false; }
}

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
  const joy = doneLast(untimed.filter(t => isJoy(t)));
  const others = untimed.filter(t => kindOf(t) !== "chore" && kindOf(t) !== "workout" && !isJoy(t));
  const ofLevel = lvl => doneLast(spreadBrain(others.filter(t => levelOf(t, day) === lvl)
    .sort((a, b) => (urgency(b, day) || 0) - (urgency(a, day) || 0) || moodFirst(a, b) || heavyFirst(a, b) || byTime(a, b))));
  const choreMinutes = chores.filter(t => !t.done).reduce((s, t) => s + (minutesLeft(t) ?? 15), 0);
  const summary = summaryText(day, timed.filter(t => !isWorkShift(t)), ofLevel("important"), ofLevel("normal").concat(workouts), chores, ofLevel("optional"), choreMinutes)
    + (held.length ? ` ${plural(held.length, "job")} can wait for a better day.` : "");
  return { list, energy, held, active, timed, untimed, chores, workouts, joy, ofLevel, choreMinutes, summary, mindLow, annoyed, moodOrder, bats, brainOver,
    load: physicalMinutes(active), shift: workHoursFor(day), free: freeMinutes(day), planned: plannedMinutes(active, day) };
}

// A big coloured banner under the day buttons, so it's always obvious which day she's looking at.
function renderDayBanner(day, tk) {
  const b = $("day-banner");
  const n = daysBetween(tk, day);
  const when = n === 0 ? "TODAY" : n === 1 ? "TOMORROW" : n === -1 ? "YESTERDAY"
    : n > 0 ? `${n} DAYS FROM NOW` : `${-n} DAYS AGO`;
  b.dataset.when = n === 0 ? "today" : n > 0 ? (n === 1 ? "tomorrow" : "future") : "past";
  b.textContent = `${n === 0 ? "📍" : n > 0 ? "🔜" : "⏪"} You're looking at ${when} · ` +
    fromKey(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// Has she checked in (feelings or body) for this day?
const checkedIn = day => !!(feelingOf(moods[day]) || bodyOf(moods[day]));

function renderDay() {
  const d = fromKey(currentDay);
  const tk = todayKey();
  $("day-weekday").textContent = d.toLocaleDateString(undefined, { weekday: "long" });
  const hol = holidayOn(currentDay);
  $("day-date").textContent = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) +
    (hol ? `  ·  ${holLabel(hol)}` : "");
  renderDayBanner(currentDay, tk);
  $("day-badge").textContent =
    currentDay === tk ? "Today" :
    currentDay === addDays(tk, 1) ? "Tomorrow" :
    currentDay === addDays(tk, -1) ? "Yesterday" : "";
  $("day-badge").classList.toggle("not-today", currentDay !== tk);   // grey: she's not looking at today

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
  $("work-pill").textContent = p.shift ? `💼 Work ${shiftLabel(p.shift)}` : vacationOn(currentDay) ? "🏖️ Vacation day" : "🌴 Day off";
  renderDayNotes(currentDay);
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
  const doneRows = [];                     // finished ones fold away under "✅ Completed" (still counted)
  const keep = rows => rows.filter(t => t.done ? (doneRows.includes(t) || doneRows.push(t), false) : true);   // (work shifts too)
  const addRows = rows => keep(rows).forEach(t => ul.appendChild(taskRow(t, t.id === nextId)));
  $("empty-day").hidden = list.length > 0;
  const recovery = currentDay <= tk ? recoveryFor(currentDay) : null;
  renderSuggestions(p, recovery);

  if (sortMode === "time") {
    const rest = byMyOrder(untimed.sort((a, b) => LEVEL_RANK[levelOf(a, currentDay)] - LEVEL_RANK[levelOf(b, currentDay)]), currentDay);
    addRows(timed);
    if (rest.length) { if (timed.length) sectionLabel(ul, "Anytime", ""); addRows(doneLast(rest)); }
    const heldOpen = keep(held);
    if (heldOpen.length && !sectionLabel(ul, "💤 Can wait for a better day", "s-held", heldOpen.length)) addRows(heldOpen);
    tagSections(ul);
    addCompleted(ul, doneRows);
    syncNowGlow();
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
    ["🌈", "Rejuvenation · fills you back up", p.joy, "s-joy"],
    ["🌿", "Optional", ofLevel("optional"), "s-optional"],
    ["💤", "Can wait for a better day", held, "s-held"],
  ];
  for (const [icon, label, all, cls] of sections) {
    const rows = cls === "s-schedule" ? keep(all) : byMyOrder(keep(all), currentDay);
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
    if (sectionLabel(ul, `${icon} ${label}`, cls, rows.length)) continue;     // folded: just the heading
    const ordered = (myOrderOf(currentDay) || []).some(id => rows.some(t => t.id === id));
    if (cls === "s-chores" && !ordered) {                 // (in her own order: no room headings)
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
  tagSections(ul);
  addCompleted(ul, doneRows);
  syncNowGlow();
}

// ---------- folding the Day page ----------
// Each heading on the Day page folds its part away (remembered on this device): the task
// sections, "Ideas & suggestions" and the cards under it. Folds pop in and out (see foldAnim).
const DAY_FOLDS_KEY = "arpPlanner.dayFolds";
let dayFolds = new Set();
try { dayFolds = new Set(JSON.parse(localStorage.getItem(DAY_FOLDS_KEY) || "[]")); } catch {}
const saveDayFolds = () => { try { localStorage.setItem(DAY_FOLDS_KEY, JSON.stringify([...dayFolds])); } catch {} };
const motionOk = () => !calmMode() && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const POP_IN = [{ opacity: 0, transform: "translateY(-8px) scale(.96)" }, { opacity: 1, transform: "none" }];
function popIn(elms) {
  if (!motionOk()) return;
  const anims = elms.map((e, i) => e.animate(POP_IN, { duration: 280, delay: Math.min(i * 25, 200), easing: "cubic-bezier(.2,.8,.3,1.25)", fill: "backwards" }));
  setTimeout(() => anims.forEach(a => { try { a.finish(); } catch {} }), 700);   // never leave anything see-through
}
function popOut(elms, then) {
  if (!motionOk() || !elms.length) return then();
  let done = false;
  const once = () => { if (!done) { done = true; then(); anims.forEach(a => a.cancel()); } };   // (cancel: nothing stays faded)
  const anims = elms.map(e => e.animate([...POP_IN].reverse(), { duration: 170, easing: "ease-in", fill: "forwards" }));
  Promise.all(anims.map(a => a.finished)).then(once, once);
  setTimeout(once, 260);                         // (a hidden or busy screen can stall animations)
}
// Folding cards (Settings, Home, the Day page's cards): open pops the insides in; closing pops them out first.
function foldAnim(card, open, apply) {
  const insides = () => [...card.children].filter(c => !(c.tagName === "H3" || c.matches(".section-head, .fold-head")) && !c.hidden);
  if (open) { apply(); popIn(insides()); } else popOut(insides(), apply);
}
// Rows belong to the foldable heading above them (so a fold can animate just those).
function tagSections(ul) {
  let sec = "";
  for (const li of ul.children) {
    if (li.classList.contains("section-label")) sec = li.classList.contains("foldable") ? li.dataset.sec : "";
    else if (sec) li.dataset.sec = sec;
  }
}
const secRows = sec => [...document.querySelectorAll(`#task-list > [data-sec="${sec}"]`)];
function foldDaySection(sec) {
  const closing = !dayFolds.has(sec);
  const apply = () => { if (closing) dayFolds.add(sec); else dayFolds.delete(sec); saveDayFolds(); render(); if (!closing) popIn(secRows(sec)); };
  if (closing) popOut(secRows(sec), apply); else apply();
}

// "💡 Ideas & suggestions" and the cards under it.
function setIdeasFolded(folded) {
  $("day-view").classList.toggle("ideas-folded", folded);
  $("tips-divider").setAttribute("aria-expanded", String(!folded));
}
(function setupDayFolds() {
  const div = $("tips-divider"), span = div.querySelector("span");
  span.setAttribute("role", "button");
  span.tabIndex = 0;
  span.appendChild(Object.assign(document.createElement("span"), { className: "section-chevron", textContent: "▾" }));
  const below = () => [$("fitin-card"), $("suggest-card"), ...(matchMedia("(max-width: 960px)").matches ? [document.querySelector(".day-side")] : [])].filter(e => e && !e.hidden);
  const toggle = () => {
    const folding = !dayFolds.has("ideas");
    const apply = () => { if (folding) dayFolds.add("ideas"); else dayFolds.delete("ideas"); saveDayFolds(); setIdeasFolded(folding); if (!folding) popIn(below()); };
    if (folding) popOut(below(), apply); else apply();
  };
  span.addEventListener("click", toggle);
  span.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  setIdeasFolded(dayFolds.has("ideas"));

  // "Collapse all / Expand all" at the top of the Day page: every task section, the ideas and the
  // cards under them (the Completed dropdown too).
  const bar = $("day-collapse");
  const cards = ["fitin-card", "suggest-card", "activity-card"];
  const setAll = folded => {
    const secs = [...document.querySelectorAll("#task-list .section-label.foldable")].map(l => l.dataset.sec);
    const rows = [...document.querySelectorAll("#task-list > [data-sec]:not(.section-label)"), ...below(), ...cards.map(id => $(id)).filter(c => c && !c.hidden)];
    const apply = () => {
      if (folded) { for (const k of [...secs, "ideas", ...cards]) dayFolds.add(k); completedOpen = false; }
      else { dayFolds.clear(); }
      try { localStorage.setItem("arpPlanner.completedOpen", completedOpen ? "1" : "0"); } catch {}
      saveDayFolds();
      setIdeasFolded(dayFolds.has("ideas"));
      for (const id of cards) { const c = $(id); if (c) { c.classList.toggle("card-folded", dayFolds.has(id)); c.querySelector(".fold-head")?.setAttribute("aria-expanded", String(!dayFolds.has(id))); } }
      render();
      if (!folded) popIn([...document.querySelectorAll("#task-list > li"), ...below()]);
    };
    if (folded) popOut(rows, apply); else apply();
  };
  const a = document.createElement("button"), b = document.createElement("button");
  a.className = b.className = "link-btn";
  a.textContent = "▸ Collapse all";
  b.textContent = "▾ Expand all";
  a.addEventListener("click", () => setAll(true));
  b.addEventListener("click", () => setAll(false));
  bar.append(a, b);
  for (const [id, headSel] of [["fitin-card", ".fitin-head"], ["suggest-card", ":scope > h3"], ["activity-card", ":scope > h3"]]) {
    const card = $(id), head = card && card.querySelector(headSel);
    if (!head) continue;
    head.classList.add("fold-head");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.appendChild(Object.assign(document.createElement("span"), { className: "section-chevron", textContent: "▾" }));
    const set = open => { card.classList.toggle("card-folded", !open); head.setAttribute("aria-expanded", String(open));
      if (open) dayFolds.delete(id); else dayFolds.add(id); saveDayFolds(); };
    const toggle = e => { if (e.target.closest("button:not(.fold-head)")) return; const open = card.classList.contains("card-folded"); foldAnim(card, open, () => set(open)); };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } });
    card.classList.toggle("card-folded", dayFolds.has(id));
    head.setAttribute("aria-expanded", String(!dayFolds.has(id)));
  }
})();

let completedOpen = false;
try { completedOpen = localStorage.getItem("arpPlanner.completedOpen") === "1"; } catch {}
function addCompleted(ul, rows) {
  if (!rows.length) return;
  const li = document.createElement("li");
  li.className = "completed-fold";
  const b = el("button", "completed-toggle" + (completedOpen ? " open" : ""), `✅ Completed · ${rows.length}`);
  b.appendChild(el("span", "section-chevron", "▾"));
  b.setAttribute("aria-expanded", String(completedOpen));
  b.addEventListener("click", () => {
    const apply = () => {
      completedOpen = !completedOpen;
      try { localStorage.setItem("arpPlanner.completedOpen", completedOpen ? "1" : "0"); } catch {}
      render();
      if (completedOpen) popIn(secRows("completed"));
    };
    if (completedOpen) popOut(secRows("completed"), apply); else apply();
  });
  li.appendChild(b);
  ul.appendChild(li);
  if (completedOpen) rows.forEach(t => { const r = taskRow(t, false); r.dataset.sec = "completed"; ul.appendChild(r); });
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

// 🔥 A day with no free time left: a different silly warning each time the app opens.
const FIRE_LINES = [
  "🔥 This day is on fire! No free time at all. Molly has started doing the smoke alarm noise and honestly? Valid.",
  "🔥 Zero free time detected. Molly says \"BURD\" in a very concerned voice. Something's got to give.",
  "🔥 Your schedule is a dumpster fire, and the dumpster is also on fire. Move a thing or two? 💛",
  "🔥 Molly has called the fire department. She did it in the voice of the microwave. BEEP BEEP BEEP. Free up some time!",
  "🔥 Breaking news: local planner bursts into flames. Witnesses describe the day as \"a lot.\" Drop something optional.",
  "🔥 Molly looked at today's list, said \"Rude,\" and flew off to sit on the curtain rod. Lighten it up?",
  "🔥 Not even a 5-minute nap fits in today. The chaos vial is filing for overtime pay.",
  "🔥 The floor is lava. The day is lava. Everything is lava. Push one thing to tomorrow 🧯",
  "🔥 Molly is shouting \"HELLO?\" in Logan's voice at the calendar. It does not answer. It's too busy being on fire.",
  "🔥 You've planned more than a day can hold. Even the demon is impressed, and he LIVES in fire. 😈",
  "🔥 Free time: 0. Tasks: yes. Molly: screaming. Maybe give something to next week?",
  "🔥 This day has more plans than Molly has opinions (and she has a LOT of opinions). Something's got to give.",
  "🔥 Somewhere, a tiny firefighter is looking at this day and quietly putting the hose down. Move a task, save a firefighter.",
  "🔥 Molly has fluffed up to twice her size, which in bird means \"absolutely not.\" Too much today!",
  "🔥 Today is not a to-do list, it's a bonfire. Roast a marshmallow, then move something to a lighter day 🍡",
];
const FIRE_LINE = (() => {
  let last = -1;
  try { last = Number(localStorage.getItem("arpPlanner.fireLine") ?? -1); } catch {}
  let i = Math.floor(Math.random() * FIRE_LINES.length);
  if (i === last) i = (i + 1) % FIRE_LINES.length;       // never the same one twice in a row
  try { localStorage.setItem("arpPlanner.fireLine", String(i)); } catch {}
  return FIRE_LINES[i];
})();

// The line under the free-time timer: each part is a little link to where it's set
// (Sleep, Work, Care Time in Settings; the tasks jump down to the list). Only redrawn when the
// words change, so a tap never lands on a line that's being replaced.
function setFtSub(parts) {
  const box = $("ft-sub"), key = JSON.stringify(parts);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren();
  parts.forEach(([text, target], i) => {
    if (i) box.append(" · ");
    const b = el("button", "ft-link", text);
    b.type = "button";
    b.title = target.startsWith("#") ? "Jump to your list" : "Open this in Settings";
    b.addEventListener("click", () => {
      if (target.startsWith("#")) document.querySelector(target).scrollIntoView({ behavior: calmMode() ? "auto" : "smooth", block: "start" });
      else openSettingsSection(target);
    });
    box.appendChild(b);
  });
}

let n0 = 0;                                   // the minute the "now" glow was last checked
function renderFreeTimer() {
  if (!timerPlan) return;
  const day = currentDay, p = timerPlan;
  const isToday = day === todayKey();
  const ft = freeTimeLeft(day, p.active);
  if (isToday && !ft.past && ft.seconds < 0 && ft.awakeLeft <= BOOT_WINDOW && viewZone() === "her" && !isBooted(day) && !isSickDay(day)) bootTheRest(day);
  const locked = isBooted(day);                 // 🔒 the rest of the day went to tomorrow
  const sick = !locked && isSickDay(day);       // 🤒 a sick day: the vial rests, nothing counts against her
  const box = $("free-timer");
  const sleep = sleepFor(day);
  box.classList.toggle("over", ft.seconds <= 0 && !ft.past);
  box.classList.toggle("tight", ft.seconds > 0 && ft.seconds < 30 * 60);

  if (isToday && ft.past) {
    $("ft-label").textContent = "🌙 It's past your bedtime";
    $("ft-time").textContent = "";
    $("ft-sub").textContent = "Whatever's left can wait for tomorrow. Rest up! 💛";
    delete $("ft-sub").dataset.key;
    $("ft-fill").style.width = "0%";
  } else {
    $("ft-label").textContent = isToday ? "⏳ Free time left today" : "⏳ Free time this day";
    $("ft-time").textContent = ft.seconds <= 0 ? "None 😣" : isToday ? formatClock(ft.seconds) : `about ${formatHrsMin(ft.seconds)}`;
    $("ft-fill").style.width = `${ft.total > 0 ? Math.max(0, Math.min(100, (ft.seconds / ft.total) * 100)) : 0}%`;
    setFtSub([
      [`☀️ Up ${formatTime(sleep.wake)}`, "sleep-hours"], [`🌙 Bed ${formatTime(sleep.bed)}`, "sleep-hours"],
      ...(p.shift ? [[`💼 Work ${shiftLabel(p.shift)}`, "work-hours"]] : []),
      ...(ft.care >= 60 ? [[`🧼 ${formatHrsMin(ft.care)} care${isToday ? " ahead" : ""}`, "care-settings"]] : []),
      [`${formatHrsMin(ft.planned)} of tasks ${isToday ? "still to do" : "planned"}`, "#task-list"],
    ]);
  }

  // Chaos meter: how much of her free time the day eats, faster when she's worn out.
  const chaos = chaosFor(day, ft);
  const off = ft.past || locked || sick;         // no effects while resting, while it's locked, or on a sick day
  const shown = off ? 0 : chaos.pct;
  const joyDone = joyDoneFor(day);
  renderChaosFlask(shown, off ? 0 : joyDone.frac);
  renderVialLock(locked);
  if (typeof renderComeback === "function") renderComeback(day);
  renderDoneFlask(day, p);
  renderDumbbell(!off && p.workouts.some(t => !t.done));
  renderStudy(!off && p.list.some(t => !t.done && !t.deleted && isStudy(t)));
  renderNowEmoji(isToday && !off ? nowTaskEmoji(day, p) : null);
  if (isToday && n0 !== (n0 = Math.floor(Date.now() / 60000))) {                // once a minute: move the "now" glow
    for (const li of document.querySelectorAll("#task-list .task[data-id]")) {
      const t = tasks.find(x => x.id === li.dataset.id);
      if (t) { li.classList.toggle("now", isHappeningNow(t, day)); li.classList.toggle("now-at-work", duringWorkNow(t, day)); }
    }
    syncNowGlow();
  }
  renderChaosShadow(off ? [] : p.active.filter(t => !t.done && !isWorkShift(t) && needsTime(t)), shown);
  // (Only a screen on HER clock marks days: a Tokyo view's "today" is a different day.)
  fixTokyoMarks();
  if (isToday && !off && viewZone() === "her" && chaos.pct >= 100) markDays("fire", [day]);
  if (isToday && !off && viewZone() === "her" && chaos.pct >= 90) markDays("chaos90", [day]);       // (for the push-back check)
  // 🌋 The second 100% chaos day in a row: the vial won't stop erupting.
  setVolcano(!off && chaos.pct >= 100 && ((profile.dayMarks || {}).fire || []).includes(addDays(day, -1)));
  renderStatusFx(day, off);
  if (typeof renderAwards === "function") renderAwards(day, off);
  const fx = off ? {} : vialFx(day);
  setChaosFace(locked ? "🥺" : sick ? "🤒" : Date.now() < flaskPoke.demonUntil ? "😈" : ft.past ? "😴" : fx.win ? "ori" : fx.faint ? "😵‍💫" : chaos.emoji);
  $("chaos-value").textContent = locked ? "🔒 Locked till tomorrow" : sick ? "🛌 Sick day · resting" : ft.past ? "Resting" : `${chaos.label} · ${shown}%`;
  const fxNote = $("chaos-fx-note"), mins = u => Math.max(1, Math.ceil((u - Date.now()) / 60000));
  const fxText = fx.win ? `🏆 Victory glow · ${mins(fx.win)} min` : fx.faint ? `😵‍💫 Still a little dizzy · ${mins(fx.faint)} min` : "";
  const mindText = fx.mindful ? `🧘 Mindful · ${mins(fx.mindful)} min` : "";
  const fxAll = [fxText, mindText].filter(Boolean).join("  ");
  fxNote.hidden = off || !fxAll;
  if (!fxNote.hidden) setTapNote(fxNote, (fx.win ? "🏆" : fx.faint ? "😵‍💫" : "") + (fx.mindful ? "🧘" : ""), fxAll);
  const note = $("chaos-note");
  note.hidden = !(chaos.boost > 1 && !off);
  if (!note.hidden) setTapNote(note, "⚡", `⚡ Fills ${Math.round((chaos.boost - 1) * 100)}% faster: ${chaos.reason}.`);
  $("chaos-flask").closest(".meter").title = "How much of your free time the day uses up" + (chaos.work ? ` (work counts about ${chaos.work}%)` : "");
  const joyNote = $("chaos-joy-note");
  joyNote.hidden = off || !chaos.joy.minutes;
  if (!joyNote.hidden) setTapNote(joyNote, "🌈", joyDone.minutes
    ? `🌈 ${formatMinutes(joyDone.minutes)} of joy is calming the chaos` + (chaos.joy.minutes >= 30 ? " (it can't boil over today) 💖" : " 💖")
    : `🌈 ${formatMinutes(chaos.joy.minutes)} of joy planned. Do it and the vial blooms 🌸`);

  // Endless-task alert: no free time left at all (or barely any).
  const warn = $("overload");
  const spare = ft.seconds / 60;
  if (locked) {
    warn.className = "overload soft";
    warn.textContent = "🌙 There wasn't enough day left, so the rest of the list moved to tomorrow and the joy bits were " +
      "cleared. The chaos vial is chained up till morning (its effects wore off), and the Order vial is having a little cry. " +
      "That's okay. Tomorrow's a fresh start 💛";
    warn.hidden = false;
  } else if (sick) {
    warn.className = "overload soft";
    warn.textContent = "🤒 Sick day. Resting is the whole job today, and taking a sick break is respecting your body. " +
      "The chaos vial is off and nothing left undone counts against you. Fluids, blankets, feel better 💛";
    warn.hidden = false;
  } else if (!ft.past && p.planned > 0 && spare < 0) {
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
    if (locked || sick) setFireFloor(0);
    else if (!ft.past && p.planned > 0 && spare < 0) setFireFloor(2, FIRE_LINE);
    else if (!ft.past && p.planned > 0 && spare < 30) setFireFloor(1, "🔥 Barely any free time. Don't pile anything else on!");
    else setFireFloor(0);
  }
}

// ---------- 🧹 exact duplicates: one copy goes ----------
// Two tasks on the same day that match in every detail she can see (title, time, notes, kind,
// priority, deadline, length, steps, done…) are a sync hiccup, not two plans. The copy linked to
// To Do or Google (or else the oldest) stays and the others are removed (soft-deleted, like any
// delete). A removed copy that shares the keeper's To Do item or Google event lets go of the link
// first, so removing it can never delete the one that stays.
const DUP_FIELDS = ["date", "time", "title", "notes", "kind", "priority", "dueDate", "minutes", "area", "effort", "brain",
  "workout", "done", "emoji", "spanEnd", "skipped"];
const dupKey = t => JSON.stringify([...DUP_FIELDS.map(k => k === "title" || k === "notes" ? (t[k] || "").trim() : t[k] ?? null),
  (t.steps || []).map(s => [(s.title || "").trim(), !!s.done, s.minutes || null])]);
const linkOf = (t, k) => ((t.external || {})[k] || null);
const linkId = (t, k) => { const m = linkOf(t, k); return m && (m.taskId || m.eventId || m.id) || null; };
let dedupeTimer = null, deduping = false;
function scheduleDedupe() {
  clearTimeout(dedupeTimer);
  dedupeTimer = setTimeout(() => { removeDuplicates().catch(() => {}); }, 2500);
}
async function removeDuplicates() {
  if (deduping || !tasks.length) return;
  deduping = true;
  try {
    const groups = new Map();
    for (const t of tasks) {
      if (t.deleted || !t.date || !(t.title || "").trim()) continue;
      if (encodeURIComponent(t.id) !== t.id) continue;       // (odd ids don't save cleanly on the PC: leave them be)
      const k = dupKey(t);
      groups.set(k, [...(groups.get(k) || []), t]);
    }
    let removed = 0;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const score = t => (linkOf(t, "microsoft") ? 2 : 0) + (linkOf(t, "google") ? 2 : 0);
      list.sort((a, b) => score(b) - score(a) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const [keep, ...extra] = list;
      for (const t of extra) {
        const external = { ...(t.external || {}) };
        for (const k of ["microsoft", "google"]) if (external[k] && (!linkId(t, k) || linkId(t, k) === linkId(keep, k))) delete external[k];
        await persist({ ...t, external, deleted: true }, false, { by: "planner" });
        removed++;
      }
    }
    if (removed) {
      render();
      scheduleSyncs();
      showToast(`🧹 Tidied up ${plural(removed, "duplicate")} (exact copies of the same thing on the same day).`);
    }
  } finally { deduping = false; }
}

// ---------- 🔒 out of day: the rest goes to tomorrow ----------
// In her evening (the last few hours before bed), once what's left can't possibly fit before bed,
// everything still undone hops to tomorrow by itself, joy bits are cleared, and the day is marked
// "booted": the chaos vial gets chained and padlocked (all its effects gone) and the Order vial
// stays empty and cries (one tap: a sad dubstep tune). Appointments, work and Google events stay.
// Only on a screen showing HER clock, so Logan's Tokyo view never moves anything.
const BOOT_WINDOW = 180;                         // minutes before bed when it can happen
const isBooted = day => ((profile.dayMarks || {}).booted || []).includes(day);
let booting = false;
async function bootTheRest(day) {
  if (booting) return;
  const left = tasksFor(day).filter(t => !t.done && !t.deleted && !isWorkShift(t) && kindOf(t) !== "event"
    && !(t.external && t.external.google && t.external.google.imported));
  if (!left.length) return;
  booting = true;
  try {
    const joy = left.filter(t => kindOf(t) === "joy"), move = left.filter(t => kindOf(t) !== "joy");
    const next = addDays(day, 1);
    markDays("booted", [day]);
    for (const t of move) await persist({ ...t, date: next, bootedFrom: day }, false);
    for (const t of joy) { try { await Store.remove(t.id); t.deleted = true; } catch {} }
    render();
    scheduleSyncs();
    const said = [move.length && `${plural(move.length, "thing")} moved to tomorrow`, joy.length && `${plural(joy.length, "joy bit")} cleared`].filter(Boolean);
    showToast(`🌙 Out of day! ${said.join(" and ")}. Rest up 💛`, "Undo", async () => {
      const m = profile.dayMarks || {};
      profile = { ...profile, dayMarks: { ...m, booted: (m.booted || []).filter(d => d !== day) } };
      pushProfile();
      for (const t of move) await persist({ ...t }, false);
      for (const t of joy) await persist({ ...t, deleted: false }, false);
      render();
    });
  } finally { booting = false; }
}

// ---------- 🤒 sick day: everything that can wait goes to lighter days ----------
// When she checks in as Sick (today or a day ahead), the planner asks first, then spreads what can
// wait over the next lighter days. Events, appointments (anything with a time), work, deadlines,
// joy bits, repeating chores and Google events stay put. A sick day also rests the chaos vial and
// never counts as "unfinished" or gets booted.
const isSickDay = day => { const b = typeof bodyOf === "function" && bodyOf(moods[day]); return !!(b && b.id === "sick"); };
const canRestOff = t => !t.done && !t.deleted && !t.time && !t.dueDate && !isWorkShift(t) && !["event", "joy"].includes(kindOf(t))
  && !(typeof repeatsOf === "function" && repeatsOf(t)) && !(t.external && t.external.google && t.external.google.imported);
// The next lighter day (both batteries at least 40% left, not another sick day), or tomorrow.
function restDayFor(day) {
  for (let i = 1; i <= 10; i++) {
    const d = addDays(day, i);
    if (isSickDay(d)) continue;
    try { const b = batteriesFor(d); if (b.brain.pctLeft >= 40 && b.body.pctLeft >= 40) return d; } catch {}
  }
  return addDays(day, 1);
}
function offerSickDay(day) {
  const move = tasksFor(day).filter(canRestOff);
  if (!move.length) return;
  const dlg = smallDialog("sick-ask");
  dlg.appendChild(el("h3", "", "🤒 Sick day? Let's clear the way"));
  dlg.appendChild(el("p", "", `Taking a sick break is respecting your body. Want me to move ${plural(move.length, "thing")} that can wait ` +
    `to lighter days, so ${day === todayKey() ? "today" : dayName(day)} is just for resting?`));
  dlg.appendChild(el("p", "hint-small", "Events, appointments, work, deadlines, joy bits and repeating chores stay where they are."));
  const btns = el("div", "peek-actions");
  const yes = el("button", "g-btn primary", "🛌 Yes, move them");
  yes.addEventListener("click", () => { dlg.close(); restOff(day, move); });
  const no = el("button", "link-btn", "Not now, keep my list");
  no.addEventListener("click", () => dlg.close());
  btns.append(yes, no);
  dlg.appendChild(btns);
  dlg.showModal();
  buzz(8);
}
async function restOff(day, move) {
  const where = new Map();
  for (const t of move) {
    const to = restDayFor(day);
    where.set(to, (where.get(to) || 0) + 1);
    await persist({ ...t, date: to }, false);
  }
  render();
  scheduleSyncs();
  const days = [...where.keys()].sort().map(d => dayName(d));
  showToast(`🛌 ${plural(move.length, "thing")} moved to ${days.length > 2 ? "a few lighter days" : days.join(" and ")}. Just rest now 💛`, "Undo", async () => {
    for (const t of move) await persist({ ...t }, false);
    render();
    scheduleSyncs();
  });
}

// Checked once a minute too, so it happens whichever tab she's on.
function checkOutOfDay() {
  const d = todayKey();
  if (!tasks.length || viewZone() !== "her" || isBooted(d) || isSickDay(d)) return;
  const ft = freeTimeLeft(d, planDay(d).active);
  if (!ft.past && ft.seconds < 0 && ft.awakeLeft <= BOOT_WINDOW) bootTheRest(d);
}
setInterval(() => { try { checkOutOfDay(); } catch {} }, 60000);

// The chains and padlock wrapped around the chaos vial.
function renderVialLock(on) {
  const flask = $("chaos-flask");
  flask.classList.toggle("locked", on);
  let lock = flask.querySelector(".vial-lock");
  if (!on) { if (lock) lock.remove(); return; }
  if (lock) return;
  lock = el("div", "vial-lock");
  lock.setAttribute("aria-hidden", "true");
  const links = Array.from({ length: 12 }, (_, i) => i % 2
    ? `<rect x="${i * 10 + 1}" y="2.5" width="12" height="3" rx="1.5"/>`
    : `<rect x="${i * 10}" y="0" width="14" height="8" rx="4" fill="none" stroke-width="2.4"/>`).join("");
  const chain = c => `<svg class="chain ${c}" viewBox="0 0 124 8" preserveAspectRatio="none">${links}</svg>`;
  lock.innerHTML = chain("c1") + chain("c2") + chain("c3") +
    `<svg class="padlock" viewBox="0 0 40 46"><path d="M10 20 V13 a10 10 0 0 1 20 0 V20" fill="none" stroke="#9aa3ad" stroke-width="5"/>` +
    `<rect x="4" y="19" width="32" height="25" rx="5" fill="#d4a93a" stroke="#8a6a1c" stroke-width="2"/>` +
    `<circle cx="20" cy="29" r="3.5" fill="#5a4410"/><rect x="18.5" y="30" width="3" height="8" rx="1.5" fill="#5a4410"/></svg>`;
  flask.appendChild(lock);
}

// ---------- chaos flask ----------
// Liquid rises with the chaos %, turning from green to red. Bubbles get more numerous and
// faster as it fills; past 50% the flask wobbles, past 75% it cracks and steams, and at 90%+
// it shakes hard. At 100% it bursts (💥) every few seconds.
// joy (0-1): rejuvenation on this day. It blends a pink "love" layer into the goop, slows the
// bubbles, floats hearts up out of the flask, and grows a flowering vine up its side.
function renderChaosFlask(realPct, joy = 0) {
  const flask = $("chaos-flask");
  const liquid = $("chaos-liquid");
  lastFlask = { pct: realPct, joy };
  // While she's poking it, it shows a jumpier level for a few seconds (see pokeFlask).
  const pct = Date.now() < flaskPoke.until ? flaskPoke.pct : realPct;
  liquid.style.height = `${Math.max(pct, 3)}%`;
  // Short visual treats (an hour each; they never change the real numbers): 🏆 gold after winning an
  // adventure, 😵‍💫 dizzy after fainting in one, 🧘 teal after some time with the Fidgets.
  const fx = vialFx(currentDay);
  const base = `hsl(${Math.round(135 * (1 - pct / 100))}, 78%, 50%)`;
  const colour = fx.win ? `color-mix(in srgb, ${base} 22%, #ffc83a)` : fx.faint ? `color-mix(in srgb, ${base} 40%, #a07cff)`
    : fx.mindful ? `color-mix(in srgb, ${base} 30%, #19c2b0)` : base;
  flask.dataset.fx = fx.win ? "gold" : fx.faint ? "dizzy" : "";
  flask.classList.toggle("mindful", !!fx.mindful);
  liquid.style.setProperty("--liq", colour);
  liquid.style.setProperty("--joy", `${Math.round(joy * 70)}%`);
  flask.style.setProperty("--liq", colour);   // the explosion splashes the same colour
  flask.dataset.stage = pct < 25 ? "0" : pct < 50 ? "1" : pct < 75 ? "2" : pct < 90 ? "3" : "4";
  if (joy >= 0.25 && flask.dataset.stage > "1") flask.dataset.stage = String(Number(flask.dataset.stage) - 1);   // calmer
  flask.classList.toggle("boom", realPct >= 100 && !flaskPoke.erupting);
  flask.classList.toggle("joyful", joy > 0);
  renderJoyBits(joy);

  // Only rebuild the bubbles when the amount changes enough to matter.
  const bucket = Math.round(pct / 8) + "-" + Math.round(joy * 4);
  const box = $("chaos-bubbles");
  if (box.dataset.bucket === String(bucket)) return;
  box.dataset.bucket = String(bucket);
  box.innerHTML = "";
  const count = Math.min(30, 3 + Math.round(pct / 8) * 2);
  const speed = Math.max(0.8, 3.4 - pct / 38) * (1 + joy);          // seconds per rise: faster when fuller, calmer with joy
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

// The little notes under the chaos vial show just their emoji; a tap shows the words (tap again to hide).
function setTapNote(n, emoji, text) {
  if (!n.dataset.tap) {
    n.dataset.tap = "1";
    n.classList.add("tap-note");
    n.setAttribute("role", "button");
    n.tabIndex = 0;
    const flip = () => {
      n.classList.toggle("open");
      n.textContent = n.classList.contains("open") ? n.dataset.full : n.dataset.emoji;
      clearTimeout(n._t);
      if (n.classList.contains("open")) n._t = setTimeout(() => { n.classList.remove("open"); n.textContent = n.dataset.emoji; }, 9000);
    };
    n.addEventListener("click", flip);
    n.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  }
  n.dataset.full = text;
  n.dataset.emoji = emoji;
  n.title = text;
  n.setAttribute("aria-label", text);
  const show = n.classList.contains("open") ? text : emoji;
  if (n.textContent !== show) n.textContent = show;
}

// The face under the chaos vial: an emoji, or Ori himself after an adventure win.
function setChaosFace(face) {
  const box = $("chaos-emoji");
  if (box.dataset.face === face) return;
  box.dataset.face = face;
  if (face === "ori") {
    const img = el("img", "ori-face");
    img.src = `ori/ori-${vialFx().ori || 1}.webp`;
    img.alt = "Ori";
    img.onerror = () => { box.textContent = "🐈"; };
    box.replaceChildren(img);
  } else box.textContent = face;
}

// Short vial effects, kept on this device: { day, mindful, win, faint } = the day they're for and
// when each one ends. They belong to the day she earned them: at midnight (her clock) they're gone,
// even if the hour isn't up, and they only show when she's looking at that day.
const VIAL_FX_KEY = "arpPlanner.vialFx";
function vialFx(viewing) {
  let fx = {};
  try { fx = JSON.parse(localStorage.getItem(VIAL_FX_KEY) || "{}") || {}; } catch {}
  const tk = todayKey();
  if ((fx.day && fx.day !== tk) || (viewing && viewing !== tk)) return {};
  const now = Date.now(), out = { ori: fx.ori, day: fx.day };
  for (const k of ["mindful", "win", "faint"]) if (fx[k] > now) out[k] = fx[k];
  return out;
}
// 💪👑🍃 Status effects for the day (they stack, and all their animations play together):
//   💪 Pumped up: a workout done (the vial wears a sweatband and flicks off sweat drops)
//   👑 Champion: an adventure won (a bobbing crown, plus a star orbiting it for each extra win)
//   🍃 Zen: the fidget goal reached (leaves drifting around the vial, more each time)
//   🦜 Molly: 5 minutes of Flappy Molly (she perches on the vial, bobs, and says things; red
//      tail feathers float down for each extra 5 minutes)
// Workouts come from her tasks; wins and zen are kept on this device for a week.
const STATUS_KEY = "arpPlanner.status";
function statusLog() { try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}") || {}; } catch { return {}; } }
function addStatus(kind) {
  const log = statusLog(), d = todayKey();
  log[d] = { ...(log[d] || {}), [kind]: ((log[d] || {})[kind] || 0) + 1 };
  for (const k of Object.keys(log)) if (k < addDays(d, -7)) delete log[k];
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(log)); } catch {}
  try { if (timerPlan) renderFreeTimer(); } catch {}
}
function statusFor(day) {
  const s = statusLog()[day] || {};
  const workout = tasks.filter(t => !t.deleted && t.done && kindOf(t) === "workout" && (t.doneDate || t.date) === day).length;
  return { workout, hero: s.hero || 0, zen: s.zen || 0, molly: s.molly || 0 };
}
function renderStatusFx(day, off) {
  const flask = $("chaos-flask"), st = off ? { workout: 0, hero: 0, zen: 0, molly: 0 } : statusFor(day);
  flask.classList.toggle("st-workout", st.workout > 0);
  flask.classList.toggle("st-hero", st.hero > 0);
  flask.classList.toggle("st-zen", st.zen > 0);
  flask.classList.toggle("st-molly", st.molly > 0);
  let box = flask.querySelector(".status-fx");
  if (!box) { box = el("div", "status-fx"); box.setAttribute("aria-hidden", "true"); flask.appendChild(box); }
  const drops = Math.min(st.workout, 3), stars = Math.min(Math.max(st.hero - 1, 0), 3), leaves = st.zen ? Math.min(st.zen + 1, 6) : 0;
  const feathers = Math.min(Math.max(st.molly - 1, 0), 3);
  const key = `${drops}-${st.hero ? 1 : 0}-${stars}-${leaves}-${st.molly ? 1 : 0}-${feathers}-${calmMode() ? 1 : 0}`;
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = "";
    for (let i = 0; i < drops; i++) {
      const d = el("span", "st-drop", "💦");
      d.style.animationDelay = `${i * .8}s`;
      d.style.setProperty("--side", i % 2 ? "1" : "-1");
      box.appendChild(d);
    }
    if (st.hero) box.appendChild(el("span", "st-crown", "👑"));
    for (let i = 0; i < stars; i++) { const s = el("span", "st-star", "⭐"); s.style.animationDelay = `${-i * (3 / Math.max(stars, 1))}s`; box.appendChild(s); }
    for (let i = 0; i < leaves; i++) { const l = el("span", "st-leaf", i % 3 === 2 ? "🌿" : "🍃"); l.style.animationDelay = `${-i * (8 / leaves)}s`; box.appendChild(l); }
    if (st.molly) {
      const m = el("span", "st-parrot");
      m.innerHTML = MOLLY_SVG;
      const say = el("span", "st-say", MOLLY_SAYS[Math.floor(Math.random() * MOLLY_SAYS.length)]);
      m.appendChild(say);
      box.appendChild(m);
      for (let i = 0; i < feathers; i++) { const f = el("span", "st-feather"); f.style.animationDelay = `${-i * 1.4}s`; f.style.left = `${20 + i * 25}%`; box.appendChild(f); }
    }
  }
  const note = $("chaos-status"), parts = [];
  if (st.workout) parts.push([`💪${st.workout > 1 ? "⁠" + st.workout : ""}`, `💪 Pumped up: ${plural(st.workout, "workout")} done today (sweatband on!)`]);
  if (st.hero) parts.push([`👑${st.hero > 1 ? "⁠" + st.hero : ""}`, `👑 Champion: ${plural(st.hero, "adventure")} won today`]);
  if (st.zen) parts.push([`🍃${st.zen > 1 ? "⁠" + st.zen : ""}`, `🍃 Zen: fidget goal reached ${st.zen}× today`]);
  if (st.molly) parts.push([`🦜${st.molly > 1 ? "⁠" + st.molly : ""}`, `🦜 Molly moved in: ${formatMinutes(st.molly * 5)} of Flappy Molly today`]);
  note.hidden = true;            // (the 🏅 effects list covers these now: tap an orbiting effect or the arrow)
  if (parts.length) setTapNote(note, parts.map(p => p[0]).join(" "), parts.map(p => p[1]).join("  "));
}

// Molly herself (grey, pale face, red tail, very opinionated), perched on the chaos vial.
const MOLLY_SVG = `<svg viewBox="0 0 40 34" aria-hidden="true"><path d="M7 21 L0 29 L4 31 L11 24Z" fill="#d7263d"/>
  <ellipse cx="18" cy="20" rx="11" ry="9" fill="#9aa1a9"/><ellipse cx="14" cy="21" rx="7" ry="5" fill="#7c838b"/>
  <circle cx="27" cy="11" r="7" fill="#a7adb4"/><circle cx="29" cy="11" r="4" fill="#eef0f2"/><circle cx="29.6" cy="10.4" r="1.5" fill="#111"/>
  <path d="M33 10.5 Q39.5 11.5 35.6 17 L33 14Z" fill="#222"/><path d="M15 28 v4 M21 28 v4" stroke="#555" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const MOLLY_SAYS = ["BURD!", "Hello!", "BEEP BEEP", "Rude.", "*microwave*", "Seed?", "Pretty bird!", "*smoke alarm*"];

function setVialFx(kind, minutes = 60) {
  const fx = vialFx();
  fx.day = todayKey();
  fx[kind] = Date.now() + minutes * 60000;
  if (kind === "win") { delete fx.faint; fx.ori = 1 + Math.floor(Math.random() * (typeof PET_PICS === "object" && PET_PICS.ori || 40)); }
  if (kind === "faint") delete fx.win;
  try { localStorage.setItem(VIAL_FX_KEY, JSON.stringify(fx)); } catch {}
  if (lastFlask) { try { renderChaosFlask(lastFlask.pct, lastFlask.joy); } catch {} }
}

// ---------- ✨ the Done vial ----------
// Fills with soft gold-and-lavender light as the day's things get ticked off. The fuller it is, the
// calmer and more magical it gets; at 100% it glows with a heavenly aura and an angel appears.
const doneState = { pct: -1, key: "", taps: [], until: 0, blessing: false };
function renderDoneFlask(day, p) {
  const items = p.list.filter(t => !t.deleted && !isWorkShift(t));
  const done = items.filter(t => t.done).length;
  const sad = isBooted(day);                         // the rest went to tomorrow: it stays empty and cries
  const sniffle = !sad && typeof comebackPending === "function" && comebackPending(day)    // the morning after: still a bit sad
    && items.some(t => !t.done);
  const pct = sad ? 0 : items.length ? Math.round((done / items.length) * 100) : 0;
  const flask = $("done-flask"), liquid = $("done-liquid");
  flask.classList.toggle("sad", sad);
  flask.classList.toggle("sniffle", sniffle);
  flask.dataset.skin = (typeof collectionOf === "function" && collectionOf().skin) || "";
  renderSadVial(sad || sniffle);
  liquid.style.height = `${Math.max(pct, items.length ? 3 : 0)}%`;
  const zen = pct / 100;
  flask.style.setProperty("--zen", zen.toFixed(2));
  flask.dataset.zen = pct >= 100 ? "4" : pct >= 75 ? "3" : pct >= 50 ? "2" : pct >= 25 ? "1" : "0";
  flask.classList.toggle("blessed", pct >= 100 && items.length > 0);
  $("done-emoji").textContent = sad ? "😭" : isSickDay(day) && pct < 100 ? "🛌" : !items.length ? "🕊️" : pct >= 100 ? "😇" : pct >= 75 ? "🥰" : pct >= 50 ? "😊" : pct >= 25 ? "🙂" : "🌱";
  $("done-value").textContent = sad ? "😢 Rest moved on" : items.length ? `${done} of ${items.length} · ${pct}%` : "Nothing yet";
  const key = `${Math.round(pct / 10)}`;
  if (doneState.key !== key) {                       // sparkles drifting up through the light
    doneState.key = key;
    const box = $("done-sparkles");
    box.innerHTML = "";
    const n = Math.round(2 + zen * 12);
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.textContent = ["✦", "✧", "·", "✦", "⋆"][i % 5];
      s.style.left = `${8 + Math.random() * 78}%`;
      s.style.fontSize = `${7 + Math.random() * 7}px`;
      const dur = 4 + Math.random() * 3 + zen * 2;        // calmer (slower) the fuller it gets
      s.style.animationDuration = `${dur}s`;
      s.style.animationDelay = `${-Math.random() * dur}s`;
      box.appendChild(s);
    }
  }
  const feathers = flask.querySelector(".done-feathers");
  if (pct >= 100 && !feathers.childElementCount) {
    for (let i = 0; i < 6; i++) {
      const f = document.createElement("span");
      f.textContent = i % 2 ? "🪶" : "✨";
      f.style.left = `${-40 + Math.random() * 130}%`;
      f.style.animationDelay = `${-Math.random() * 6}s`;
      f.style.animationDuration = `${5 + Math.random() * 3}s`;
      feathers.appendChild(f);
    }
  } else if (pct < 100) feathers.innerHTML = "";
  setHeaven(day === todayKey() && pct >= 100 && items.length > 0);
  doneState.pct = pct;
}

// 😢 The sad Order vial: a crying face on the glass with tears rolling down. One tap: it sobs out
// a whole sad dubstep tune (a tap while it's crying does nothing).
function renderSadVial(on) {
  const flask = $("done-flask");
  let face = flask.querySelector(".sad-face");
  if (!on) { if (face) face.remove(); return; }
  if (face) return;
  face = el("div", "sad-face");
  face.setAttribute("aria-hidden", "true");
  face.innerHTML = `<svg viewBox="0 0 40 30"><path d="M7 10 L15 6 M33 10 L25 6" stroke="#3b3b55" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M9 14 q4 -4 8 0 M23 14 q4 -4 8 0" stroke="#3b3b55" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M13 26 q7 -8 14 0" stroke="#3b3b55" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>` +
    `<span class="tear t1"></span><span class="tear t2"></span><span class="tear t3"></span><span class="tear t4"></span>`;
  flask.appendChild(face);
}
let sadCrying = false;
function sadVialCry() {
  if (sadCrying) return;
  sadCrying = true;
  const flask = $("done-flask");
  flask.classList.add("sobbing");
  buzz([40, 80, 40, 80, 120]);
  const secs = typeof playSadDub === "function" ? playSadDub() : 4;
  const label = el("div", "song-name", "🎵 Sad Wub (original, crying dubstep)");
  flask.appendChild(label);
  const drips = setInterval(() => {                 // big tears splash out while it plays
    const d = el("span", "sad-drop", "💧");
    d.style.left = `${15 + Math.random() * 70}%`;
    flask.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }, 260);
  setTimeout(() => { clearInterval(drips); label.remove(); flask.classList.remove("sobbing"); sadCrying = false; }, secs * 1000);
}

// Tapping it: a gentle wobble and a bell chime (higher the faster she taps). Full and tapped
// quickly: a blessing bursts out (sparkles, feathers and hearts drifting up and down).
function pokeDone() {
  const flask = $("done-flask");
  if (flask.classList.contains("sad")) return sadVialCry();
  if (doneState.blessing) return;
  const now = Date.now();
  doneState.taps = doneState.taps.filter(t => now - t < 2000);
  doneState.taps.push(now);
  const n = doneState.taps.length, power = calmMode() ? .1 : Math.min(1, n / 8);
  flask.style.setProperty("--poke", (.25 + power * .9).toFixed(2));
  flask.classList.remove("poked");
  void flask.offsetWidth;
  flask.classList.add("poked");
  buzz(Math.round(6 + power * 16));
  const tune = typeof playSongNote === "function" ? playSongNote() : null;
  if (tune) showSongPlaying(tune);
  flask.classList.remove("glimmer");
  void flask.offsetWidth;
  flask.classList.add("glimmer");
  if (!calmMode() && doneState.pct >= 100) blessFlask();          // full: one tap does it
}
// While she taps out a song: angel wings sprout from the vial and the screen's edges glow gold.
let songTimer = null;
function showSongPlaying(tune) {
  const flask = $("done-flask");
  if (!flask.querySelector(".done-wings")) {
    const w = document.createElement("div");
    w.className = "done-wings";
    const wing = side => `<svg class="dw ${side}" viewBox="0 0 60 70" aria-hidden="true"><path d="M58 30 C40 2 6 0 2 18 C14 16 20 22 8 30 C22 30 26 36 12 44 C26 44 32 50 22 58 C40 58 54 48 58 30 Z"
      fill="#fffdf6" stroke="#f0d68f" stroke-width="1.6"/><path d="M50 30 C38 14 22 10 12 16 M50 34 C38 28 26 30 18 36 M50 38 C40 40 32 46 28 52" stroke="#eadfbf" stroke-width="1.2" fill="none"/></svg>`;
    w.innerHTML = wing("l") + wing("r");
    flask.appendChild(w);
  }
  let aura = $("golden-aura");
  if (!aura) {
    aura = document.createElement("div");
    aura.id = "golden-aura";
    aura.setAttribute("aria-hidden", "true");
    document.body.appendChild(aura);
  }
  let label = flask.querySelector(".song-name");
  if (!label) { label = document.createElement("div"); label.className = "song-name"; flask.appendChild(label); }
  label.textContent = `🎵 ${tune.name}`;
  flask.classList.add("singing");
  aura.classList.add("on");
  const note = document.createElement("span");                // a little note floats up
  note.className = "song-note";
  note.textContent = ["♪", "♫", "♩", "♬"][tune.at % 4];
  note.style.left = `${20 + Math.random() * 60}%`;
  flask.appendChild(note);
  setTimeout(() => note.remove(), 1600);
  clearTimeout(songTimer);
  songTimer = setTimeout(() => { flask.classList.remove("singing"); aura.classList.remove("on"); }, 2200);
}

function blessFlask() {
  const flask = $("done-flask");
  doneState.blessing = true;
  doneState.taps = [];
  if (typeof playBlessing === "function") playBlessing();
  buzz([20, 60, 20, 60, 40, 120, 80]);
  const r = flask.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 10;
  for (let i = 0; i < 40; i++) {
    const b = document.createElement("span");
    b.className = "bless-bit";
    b.textContent = ["✨", "🪶", "💛", "⭐", "🤍", "✦"][i % 6];
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.fontSize = `${12 + Math.random() * 14}px`;
    document.body.appendChild(b);
    const dx = (Math.random() - .5) * 380, up = 140 + Math.random() * 240, dur = 2600 + Math.random() * 1600;
    b.animate([{ transform: "translate(-50%, 0) scale(.4)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * .5}px), ${-up}px) scale(1.1)`, opacity: 1, offset: .35 },
      { transform: `translate(calc(-50% + ${dx}px), ${innerHeight * .5 - y + Math.random() * 200}px) rotate(${Math.random() * 120 - 60}deg) scale(.9)`, opacity: 0 }],
      { duration: dur, easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = () => b.remove();
  }
  const word = document.createElement("div");
  word.className = "bless-word";
  word.textContent = "✨ Blessed! ✨";
  Object.assign(word.style, { left: `${x}px`, top: `${y - 40}px` });
  document.body.appendChild(word);
  setTimeout(() => word.remove(), 2400);
  flask.classList.add("blessing");
  setTimeout(() => { flask.classList.remove("blessing"); doneState.blessing = false; }, 2600);
  showToast("😇 Every single thing done. You're glowing. ✨");
}
$("done-flask").addEventListener("pointerdown", e => { e.preventDefault(); pokeDone(); });

// 💖 Everything on today's list done: a big love note from Logan, and the whole app bursts like
// the Order vial does (once a day).
function maybeCelebrateAllDone() {
  if (celebrating) return setTimeout(maybeCelebrateAllDone, 300);         // let the animal finish first
  const day = todayKey();
  const items = planDay(day).list.filter(t => !t.deleted && !isWorkShift(t));
  if (!items.length || items.some(t => !t.done) || isBooted(day)) return;
  try { if (localStorage.getItem("arpPlanner.allDone") === day) return; localStorage.setItem("arpPlanner.allDone", day); } catch {}
  celebrateAllDone();
}
function burstFrom(x, y, count, bits, spread = 380) {
  for (let i = 0; i < count; i++) {
    const b = document.createElement("span");
    b.className = "bless-bit";
    b.textContent = bits[i % bits.length];
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.fontSize = `${14 + Math.random() * 18}px`;
    document.body.appendChild(b);
    const dx = (Math.random() - .5) * spread, up = 120 + Math.random() * 260, dur = 2400 + Math.random() * 1600;
    b.animate([{ transform: "translate(-50%, 0) scale(.4)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * .5}px), ${-up}px) scale(1.15)`, opacity: 1, offset: .35 },
      { transform: `translate(calc(-50% + ${dx}px), ${innerHeight * .6 - y + Math.random() * 220}px) rotate(${Math.random() * 140 - 70}deg) scale(.9)`, opacity: 0 }],
      { duration: dur, easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = () => b.remove();
  }
}
function celebrateAllDone() {
  const pop = el("div", "love-pop");
  pop.setAttribute("role", "alert");
  pop.append(el("div", "love-text", "GOOD JOB ARP,  LOGAN LOVES YOOOOU!!! ❤️ ❤️ ❤️"), el("div", "love-sub", "Tap to close"));
  const close = () => { pop.classList.add("leaving"); setTimeout(() => pop.remove(), 450); };
  pop.addEventListener("click", close);
  document.body.appendChild(pop);
  setTimeout(close, 7000);
  if (calmMode()) return;                                   // calm mode: the note, no fireworks
  if (typeof playBlessing === "function") playBlessing();
  buzz([30, 60, 30, 60, 60, 120, 120]);
  const flash = el("div", "love-flash");
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1800);
  document.body.classList.add("love-burst");
  setTimeout(() => document.body.classList.remove("love-burst"), 1400);
  const hearts = ["❤️", "💖", "✨", "💛", "⭐", "💕", "🪶", "🤍"];
  if (view === "day") { try { blessFlask(); } catch {} }
  for (let k = 0; k < 7; k++) setTimeout(() => burstFrom(innerWidth * (.1 + Math.random() * .8), innerHeight * (.2 + Math.random() * .6), 22, hearts, 460), k * 220);
}

// ---------- 😇 the angel (everything done today) ----------
const ANGEL_LINES = ["Good job! 💛", "You did ALL of it! ✨", "So proud of you, Ariel 🥹", "Look at you go! 🌟", "Every. Single. Task. 👑",
  "Rest now. You earned it 🕊️", "Gold star day ⭐", "Your future self says thank you 💌", "That was amazing 💖", "Take a bow! 🎀",
  "You're doing wonderfully 🌷", "Peace achieved ☁️"];
function setHeaven(on) {
  let floor = $("heaven-floor");
  if (!on) { if (floor) floor.hidden = true; document.body.classList.remove("in-heaven"); return; }
  if (!floor) {
    floor = document.createElement("div");
    floor.id = "heaven-floor";
    floor.setAttribute("aria-live", "polite");
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("span");
      c.className = "hv-cloud";
      c.textContent = "☁️";
      c.style.left = `${i * 12 - 4 + Math.random() * 4}%`;
      c.style.fontSize = `${34 + Math.random() * 26}px`;
      c.style.animationDelay = `${-Math.random() * 8}s`;
      floor.appendChild(c);
    }
    const angel = document.createElement("div");
    angel.className = "hv-angel";
    angel.innerHTML = `<div class="hv-float"><svg viewBox="0 0 80 80" aria-hidden="true">
      <ellipse cx="40" cy="9" rx="15" ry="4.5" fill="none" stroke="#ffd76b" stroke-width="3.2"/>
      <path class="hv-wing" d="M26 42 Q2 26 6 52 Q14 48 24 54 Z" fill="#fffdf6" stroke="#e6dcc5" stroke-width="1"/>
      <path class="hv-wing r" d="M54 42 Q78 26 74 52 Q66 48 56 54 Z" fill="#fffdf6" stroke="#e6dcc5" stroke-width="1"/>
      <path d="M26 46 Q40 38 54 46 L60 76 Q40 82 20 76 Z" fill="#f4eefc" stroke="#d8cdee" stroke-width="1"/>
      <circle cx="40" cy="30" r="15" fill="#ffe2cc"/>
      <path d="M26 26 Q30 13 40 15 Q52 13 54 27 Q48 20 40 21 Q32 20 26 26 Z" fill="#c98b4c"/>
      <path d="M33 30 q2 -2.5 4 0 M43 30 q2 -2.5 4 0" stroke="#3a2a22" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M35 36 Q40 41 45 36" stroke="#c0505f" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="31" cy="35" rx="3" ry="2" fill="#ffb3c1"/><ellipse cx="49" cy="35" rx="3" ry="2" fill="#ffb3c1"/>
    </svg><span class="hv-say"></span></div>`;
    floor.appendChild(angel);
    const say = angel.querySelector(".hv-say");
    let i = 0;
    const talk = () => { say.textContent = ANGEL_LINES[i++ % ANGEL_LINES.length]; say.classList.remove("pop"); void say.offsetWidth; say.classList.add("pop"); };
    talk();
    setInterval(() => { if (!floor.hidden) talk(); }, 3600);
    document.body.appendChild(floor);
  }
  floor.hidden = false;
  document.body.classList.add("in-heaven");
}

// ---------- poking the vial ----------
// Tap it and it shakes; tap faster and it goes wilder, and the goop flashes up to the next chaos
// colour for a few seconds. On a chaotic day (75%+), enough fast taps make it erupt like a volcano.
const flaskPoke = { taps: [], until: 0, pct: 0, erupting: false, t: null, demonUntil: 0 };
let lastFlask = { pct: 0, joy: 0 };
const buzz = ms => { try { if (fidgetPrefs().buzz && navigator.vibrate) navigator.vibrate(ms); } catch {} };

function pokeFlask() {
  const flask = $("chaos-flask");
  if (flaskPoke.erupting) return;
  const now = Date.now();
  flaskPoke.taps = flaskPoke.taps.filter(t => now - t < 2000);
  flaskPoke.taps.push(now);
  const n = flaskPoke.taps.length, power = calmMode() ? 0.15 : Math.min(1, n / 10);
  flask.style.setProperty("--poke", (0.35 + power * 1.4).toFixed(2));
  flask.classList.remove("poked");
  void flask.offsetWidth;
  flask.classList.add("poked");
  buzz(Math.round(8 + power * 35));
  if (typeof playVialTink === "function") playVialTink(power);
  if (calmMode()) return;                                   // calm mode: just a gentle wobble
  const real = lastFlask.pct;
  if (real >= 90 || (real >= 75 && n >= 8)) return eruptFlask();      // on fire: it's full, one tap does it
  const next = [25, 50, 75, 90, 100].find(x => x > real) ?? 100;
  flaskPoke.pct = Math.min(99, Math.max(next + 2, real + 12 + power * 45));
  flaskPoke.until = now + 3000;
  renderChaosFlask(real, lastFlask.joy);
  clearTimeout(flaskPoke.t);
  flaskPoke.t = setTimeout(() => renderChaosFlask(lastFlask.pct, lastFlask.joy), 3050);
}

// After the eruption: a demon pops out of the vial cackling, the chaos face turns 😈 for two seconds,
// and glowing demon eyes take over the background before it all fades back to her theme.
function demonTakeover() {
  const flask = $("chaos-flask");
  flaskPoke.demonUntil = Date.now() + 2000;
  setChaosFace("😈");
  setTimeout(() => { if (Date.now() >= flaskPoke.demonUntil) render(); }, 2050);
  const pop = document.createElement("div");
  pop.className = "vial-demon";
  pop.innerHTML = makeImp().innerHTML;                        // the same little demon as the fire floor
  const say = pop.querySelector(".imp-say");
  if (say) { say.textContent = "Mwahahaha!"; say.classList.add("pop"); }
  const r = flask.getBoundingClientRect();
  Object.assign(pop.style, { left: `${r.left + r.width / 2 - 36}px`, top: `${r.top - 30}px` });
  document.body.appendChild(pop);
  setTimeout(() => pop.classList.add("leaving"), 2000);
  setTimeout(() => pop.remove(), 2600);
  if (typeof playCackle === "function") playCackle();
  let eyes = $("demon-eyes");
  if (!eyes) {
    eyes = document.createElement("div");
    eyes.id = "demon-eyes";
    eyes.setAttribute("aria-hidden", "true");
    document.body.prepend(eyes);
  }
  eyes.innerHTML = "";
  for (let i = 0; i < 26; i++) {
    const e = document.createElement("span");
    e.className = "d-eyes";
    e.style.left = `${Math.random() * 94}vw`;
    e.style.top = `${Math.random() * 92}vh`;
    e.style.setProperty("--s", (.6 + Math.random() * 1.1).toFixed(2));
    e.style.animationDelay = `${Math.random() * 1.4}s, ${Math.random() * .6}s`;
    eyes.appendChild(e);
  }
  document.body.classList.add("demon-takeover");
  eyes.classList.add("on");
  setTimeout(() => { eyes.classList.remove("on"); document.body.classList.remove("demon-takeover"); }, 2000);
}

function eruptFlask() {
  const flask = $("chaos-flask");
  flaskPoke.erupting = true;
  flaskPoke.taps = [];
  flask.classList.remove("poked");
  flask.classList.add("erupting");
  buzz([40, 30, 40, 30, 60, 30, 90, 40, 250]);
  if (typeof playEruption === "function") playEruption();
  setTimeout(demonTakeover, 900);
  const colour = getComputedStyle($("chaos-liquid")).getPropertyValue("--liq") || "hsl(10, 78%, 50%)";
  setTimeout(() => {
    flask.classList.remove("erupting");
    const r = flask.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + 6;
    const cap = flask.querySelector(".flask-cap");
    cap.animate([{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-140px) rotate(200deg)", offset: .45 },
      { transform: "translateY(0) rotate(360deg)" }], { duration: 1500, easing: "cubic-bezier(.3,.7,.5,1)" });
    for (let i = 0; i < 46; i++) {                         // lava!
      const b = document.createElement("span");
      b.className = "lava-blob";
      const size = 7 + Math.random() * 14;
      Object.assign(b.style, { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px` });
      b.style.setProperty("--c", colour);
      document.body.appendChild(b);
      const dx = (Math.random() - .5) * 340, up = 160 + Math.random() * 260, dur = 1300 + Math.random() * 900;
      b.animate([{ transform: "translate(0,0) scale(.6)", opacity: 1 },
        { transform: `translate(${dx * .55}px, ${-up}px) scale(1.15)`, opacity: 1, offset: .38 },
        { transform: `translate(${dx}px, ${innerHeight - y + 40}px) scale(.8)`, opacity: .2 }],
        { duration: dur, easing: "cubic-bezier(.2,.6,.6,1)" }).onfinish = () => b.remove();
    }
    const word = document.createElement("div");
    word.className = "erupt-word";
    word.textContent = "🌋 KABOOM!";
    Object.assign(word.style, { left: `${x}px`, top: `${y - 40}px` });
    document.body.appendChild(word);
    setTimeout(() => word.remove(), 1800);
    // The vial empties… then fills back up to where the day really is.
    flaskPoke.pct = 4;
    flaskPoke.until = Date.now() + 2200;
    renderChaosFlask(lastFlask.pct, lastFlask.joy);
    setTimeout(() => { flaskPoke.erupting = false; renderChaosFlask(lastFlask.pct, lastFlask.joy); }, 2300);
    showToast("🌋 You made it erupt! Chaos released. Feel a little better? 😆");
  }, 900);
}
$("chaos-flask").addEventListener("pointerdown", e => { e.preventDefault(); pokeFlask(); });

// Is she in the middle of this one right now? (Today, timed, and the clock is inside its slot.)
// Something happening right now while she's at work (an appointment in the middle of her shift):
// it glows in step with the work shift's glow, in work blue mixed with her theme's colour.
function duringWorkNow(t, day) {
  if (isWorkShift(t) || !isHappeningNow(t, day)) return false;
  const n = nowLocal();
  return atWork(day, `${pad(n.getHours())}:${pad(n.getMinutes())}`);
}
// Every "now" glow pulses on the same beat (they share one clock), so the work shift and whatever
// is happening during it breathe together.
function syncNowGlow() {
  const delay = `-${(Date.now() % 2600) / 1000}s`;
  for (const li of document.querySelectorAll("#task-list .task.now, .home-card.has-now")) li.style.animationDelay = delay;
}

function isHappeningNow(t, day) {
  if (t.done || t.deleted || !t.time || day !== todayKey() || t.date !== day) return false;
  const n = nowLocal(), m = n.getHours() * 60 + n.getMinutes(), s = toMin(t.time);
  return m >= s && m < s + (isWorkShift(t) ? shiftMinutes(workHoursFor(day) || { start: t.time, end: t.time }) || t.minutes || 480 : (minutesLeft(t) ?? t.minutes ?? 30));
}

// Right now: the emoji of whatever she's in the middle of (a timed task, or her work shift).
function nowTaskEmoji(day, p) {
  const n = nowLocal(), m = n.getHours() * 60 + n.getMinutes();
  const cur = p.list.filter(t => !t.done && !t.deleted && t.time && t.date === day)
    .filter(t => { const s = toMin(t.time); return m >= s && m < s + (minutesLeft(t) ?? t.minutes ?? 30); })
    .sort((a, b) => (isWorkShift(a) - isWorkShift(b)) || b.time.localeCompare(a.time));     // the most specific first
  if (cur.length) return { emoji: emojiOf(cur[0]), title: cur[0].title };
  if (atWork(day, `${pad(n.getHours())}:${pad(n.getMinutes())}`)) return { emoji: "💼", title: "Work" };
  return null;
}
function renderNowEmoji(now) {
  const flask = $("chaos-flask");
  let f = flask.querySelector(".flask-now");
  if (!now) { if (f) f.remove(); return; }
  if (!f) {
    f = document.createElement("div");
    f.className = "flask-now";
    flask.appendChild(f);
  }
  if (f.textContent !== now.emoji) f.textContent = now.emoji;
  f.title = "Right now: " + now.title;
}

// Study day: the vial glows softly (it's learning!) and a graduation cap floats around it.
const isStudy = t => /\b(stud(y|ying|ies)|homework|exam|quiz|lecture|course ?work|learn(ing)?|revis(e|ion|ing)|flash ?cards)\b/i.test(t.title || "");
function renderStudy(show) {
  const flask = $("chaos-flask");
  flask.classList.toggle("studying", show);
  let cap = flask.querySelector(".flask-cap-grad");
  if (!show) { if (cap) cap.remove(); return; }
  if (cap) return;
  cap = document.createElement("div");
  cap.className = "flask-cap-grad";
  cap.title = "Study time 🎓";
  cap.innerHTML = `<svg viewBox="0 0 64 44" aria-hidden="true">
    <path d="M14 20 v12 q18 10 36 0 v-12" fill="#2a2f45"/>
    <path d="M32 4 L62 16 L32 28 L2 16 Z" fill="#363c58" stroke="#5a6386" stroke-width="1.5"/>
    <circle cx="32" cy="16" r="2.6" fill="#f2c14e"/>
    <path d="M32 16 Q46 20 52 24 L52 34" stroke="#f2c14e" stroke-width="2.2" fill="none"/>
    <path d="M49 34 l3 8 l3 -8 z" fill="#f2c14e"/></svg><i class="spark s1">✨</i><i class="spark s2">✨</i>`;
  flask.appendChild(cap);
}

// Workout day: a little dumbbell floats and bobs around the vial until the workout is done.
function renderDumbbell(show) {
  const side = $("chaos-flask");
  let bell = side.querySelector(".flask-bell");
  if (!show) { if (bell) bell.remove(); return; }
  if (bell) return;
  bell = document.createElement("div");
  bell.className = "flask-bell";
  bell.title = "Workout today 💪";
  bell.innerHTML = `<svg viewBox="0 0 64 28" aria-hidden="true">
    <rect x="14" y="11" width="36" height="6" rx="3" fill="#c7ccd6"/>
    <rect x="6" y="3" width="9" height="22" rx="3" fill="#5a63f0"/><rect x="0" y="7" width="7" height="14" rx="2.5" fill="#7b83ff"/>
    <rect x="49" y="3" width="9" height="22" rx="3" fill="#5a63f0"/><rect x="57" y="7" width="7" height="14" rx="2.5" fill="#7b83ff"/>
    <rect x="16" y="12" width="32" height="1.6" rx=".8" fill="#fff" opacity=".6"/></svg>`;
  side.appendChild(bell);
}

// Hearts drifting up out of the flask, and a vine that climbs higher (and flowers) with more joy.
let joyKey = "";
function renderJoyBits(joy) {
  const flask = $("chaos-flask");
  let hearts = flask.querySelector(".joy-hearts"), vine = flask.querySelector(".joy-vine");
  if (!hearts) {
    hearts = document.createElement("div");
    hearts.className = "joy-hearts";
    vine = document.createElement("div");
    vine.className = "joy-vine";
    vine.innerHTML = `<svg viewBox="0 0 24 270" preserveAspectRatio="none" aria-hidden="true">
      <path d="M12 270 C2 240 22 220 12 190 C2 160 22 140 12 110 C2 80 22 60 12 30 C8 18 12 8 12 0" fill="none" stroke="#5fc46a" stroke-width="3" stroke-linecap="round"/>
      <path d="M12 230 q-10 -6 -12 -14 q10 2 12 14 M12 170 q10 -6 12 -14 q-10 2 -12 14 M12 110 q-10 -6 -12 -14 q10 2 12 14 M12 50 q10 -6 12 -14 q-10 2 -12 14" fill="#4cae5a"/>
    </svg><span class="vf" style="bottom:22%">🌸</span><span class="vf" style="bottom:48%">🌼</span><span class="vf" style="bottom:72%">🌸</span><span class="vf" style="bottom:94%">🌷</span>`;
    flask.append(hearts, vine);
  }
  vine.style.setProperty("--grow", `${Math.round(joy * 100)}%`);
  vine.dataset.flowers = String(Math.round(joy * 4));
  const key = String(Math.round(joy * 6));
  if (key === joyKey) return;
  joyKey = key;
  hearts.innerHTML = "";
  if (calmMode()) return;
  const n = Math.round(joy * 6);
  for (let i = 0; i < n; i++) {
    const h = document.createElement("span");
    h.textContent = ["💖", "💕", "❤️", "💗"][i % 4];
    h.style.left = `${15 + Math.random() * 60}%`;
    h.style.animationDuration = `${3.5 + Math.random() * 2.5}s`;
    h.style.animationDelay = `${-Math.random() * 5}s`;
    h.style.fontSize = `${11 + Math.random() * 7}px`;
    hearts.appendChild(h);
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
    floor.appendChild(makeImp());
    for (let i = 0; i < 3; i++) floor.appendChild(makeCoatRack(i));     // 🧥 they followed you here too
    document.body.appendChild(floor);
  }
  floor.hidden = !level;
  floor.dataset.level = String(level || 0);
  floor.querySelector(".ff-label").textContent = text || "";
  document.body.classList.toggle("on-fire", !!level);
}

// 🧥 The Coat Rack. It follows you around. It is always a little closer than before. Eventually, it
// attacks. (Logan and Ariel's long-running joke.) A wooden hat stand with a coat and a bowler hat,
// and two small glowing eyes under the brim.
const COAT_RACK_SVG = `<svg viewBox="0 0 60 120" aria-hidden="true">
  <path d="M30 100 L13 117 M30 100 L47 117 M30 100 L30 118" stroke="#5e3a20" stroke-width="4" stroke-linecap="round"/>
  <rect x="27.5" y="16" width="5" height="88" rx="2.5" fill="#7a4a2a"/><rect x="28.5" y="16" width="1.6" height="88" fill="#9a6440" opacity=".7"/>
  <path d="M30 30 Q17 29 14 20 M30 30 Q43 29 46 20 M30 44 Q19 44 16 36 M30 44 Q41 44 44 36" stroke="#7a4a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="14" cy="19" r="2.4" fill="#5e3a20"/><circle cx="46" cy="19" r="2.4" fill="#5e3a20"/>
  <path d="M15 21 Q7 44 9 70 L25 70 Q24 46 19 23 Z" fill="#8c2f39"/><path d="M15 21 Q11 40 12 66" stroke="#6d1f29" stroke-width="1.5" fill="none"/>
  <circle cx="18" cy="40" r="1.3" fill="#e8c46a"/><circle cx="18" cy="50" r="1.3" fill="#e8c46a"/>
  <path d="M44 22 Q50 30 46 38 Q41 32 44 22" fill="#d6a640"/>
  <ellipse cx="30" cy="14" rx="14" ry="3.2" fill="#26262e"/><path d="M20 14 Q20 1 30 1 Q40 1 40 14 Z" fill="#33333d"/>
  <rect x="20" y="10" width="20" height="2.4" fill="#8c2f39"/>
  <ellipse class="cr-eye" cx="26" cy="18.5" rx="1.8" ry="1.3" fill="#ffe46b"/><ellipse class="cr-eye" cx="34" cy="18.5" rx="1.8" ry="1.3" fill="#ffe46b"/>
</svg>`;
const COAT_RACK_LINES = ["*creak*", "👀", "I'm right behind you", "Need a coat hung?", "Don't turn around", "I live here now", "*creeeak*", "Hold still…"];
function makeCoatRack(i) {
  const box = document.createElement("div");
  box.className = "ff-rack";
  // They lurk at the edges (two on the left, one on the right), clear of the warning in the middle.
  box.style.setProperty("--start", ["1.5%", "7%", "calc(98% - 26px)"][i % 3]);
  if (i % 3 === 2) box.classList.add("side-r");
  box.style.animationDuration = `${11 + i * 3}s`;
  box.style.animationDelay = `${-i * 2.5}s`;
  box.innerHTML = `<div class="rack-bob">${COAT_RACK_SVG}</div><span class="imp-say rack-say"></span>`;
  const say = box.querySelector(".rack-say");
  let n = i * 3;
  const talk = () => { say.textContent = COAT_RACK_LINES[n++ % COAT_RACK_LINES.length]; say.classList.remove("pop"); void say.offsetWidth; say.classList.add("pop"); };
  setTimeout(talk, 1200 + i * 1100);
  const tick = setInterval(() => {
    if (!box.isConnected) { clearInterval(tick); return; }
    if (!box.closest("[hidden]")) talk();
  }, 4100 + i * 700);
  return box;
}

// A little whimsical demon who bounces along the flames, cackling, when the day is fully on fire.
const IMP_LINES = ["I win!!! I win!!!", "hehehe 😈", "I win!!! I win!!!", "WHEEE!", "I win!!! I win!!!", "*cackles*", "I win!!! I win!!!", "toasty! 🔥"];
function makeImp() {
  const box = document.createElement("div");
  box.className = "ff-imp";
  box.innerHTML = `<div class="imp-hop"><svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M18 14 L13 1 L25 11 Z M46 14 L51 1 L39 11 Z" fill="#f6d36b"/>
    <path class="imp-wing" d="M12 30 Q-2 18 2 38 Q8 34 14 38 Z" fill="#7a2a8a"/>
    <path class="imp-wing r" d="M52 30 Q66 18 62 38 Q56 34 50 38 Z" fill="#7a2a8a"/>
    <path d="M44 50 Q58 56 60 46 Q62 42 58 44" stroke="#c2304a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M57 41 l5 1 l-3 4 z" fill="#c2304a"/>
    <ellipse cx="32" cy="36" rx="20" ry="21" fill="#e2445e"/>
    <ellipse cx="32" cy="42" rx="12" ry="11" fill="#f37a8c" opacity=".55"/>
    <ellipse cx="24" cy="30" rx="5" ry="6" fill="#fff"/><ellipse cx="40" cy="30" rx="5" ry="6" fill="#fff"/>
    <circle cx="25" cy="31" r="2.6" fill="#1b0f1a"/><circle cx="39" cy="31" r="2.6" fill="#1b0f1a"/>
    <path d="M18 23 l9 3 M46 23 l-9 3" stroke="#7a1430" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M21 40 Q32 54 43 40 Z" fill="#5a0f22"/>
    <path d="M24 41 l2 4 l2 -4 M36 41 l2 4 l2 -4" fill="#fff"/>
    <path d="M27 49 Q32 46 37 49 Q32 52 27 49" fill="#ff8fa3"/>
    <path d="M22 56 l-2 6 M42 56 l2 6" stroke="#c2304a" stroke-width="4" stroke-linecap="round"/>
  </svg><span class="imp-say"></span></div>`;
  const say = box.querySelector(".imp-say");
  let i = 0;                                                  // starts with "I win!!! I win!!!"
  const talk = () => { say.textContent = IMP_LINES[i++ % IMP_LINES.length]; say.classList.remove("pop"); void say.offsetWidth; say.classList.add("pop"); };
  talk();
  const tick = setInterval(() => {
    if (!box.isConnected) { clearInterval(tick); return; }      // (a copy used for the vial demon never joins the page)
    if (!box.closest("[hidden]")) talk();
  }, 3200);
  return box;
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

// A heading in the Day list. With a count, it folds its section (returns true when folded).
function sectionLabel(ul, text, cls, count) {
  const li = document.createElement("li");
  li.className = "section-label " + cls;
  li.textContent = text;
  ul.appendChild(li);
  if (count === undefined || !cls) return false;
  const folded = dayFolds.has(cls);
  li.classList.add("foldable");
  li.classList.toggle("folded", folded);
  li.dataset.sec = cls;
  if (folded) li.appendChild(el("span", "fold-count", ` · ${count}`));
  li.appendChild(el("span", "section-chevron", "▾"));
  li.setAttribute("role", "button");
  li.tabIndex = 0;
  li.setAttribute("aria-expanded", String(!folded));
  li.addEventListener("click", () => foldDaySection(cls));
  li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); foldDaySection(cls); } });
  return folded;
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
  li.className = `task lvl-${level}` + (t.done ? " done" : "") + (isNext ? " next" : "") + (isHappeningNow(t, day) ? " now" : "") + (duringWorkNow(t, day) ? " now-at-work" : "");
  li.dataset.id = t.id;
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
  const boss = typeof bossChip === "function" && bossChip(t);
  if (boss) chips.unshift(boss);
  const cb = typeof comebackChip === "function" && comebackChip(t, day);
  if (cb) chips.unshift(cb);
  if (mindLowBodyOk(day) && moodBoostScore(t) >= 2) chips.push(["chip mood", "💛 Mood boost"]);
  else {
    const o = moodOrderOf(day);
    if (o && o.move && burnOffScore(t, day) >= 2) chips.push(["chip mood", "🔥 Burns it off"]);
    else if (o && o.quick && quickWinScore(t) >= 2) chips.push(["chip mood", "⚡ Quick win"]);
    else if (o && o.brainy && brainOf(t) === "heavy" && !t.done) chips.push(["chip mood", "✨ Clear-head job"]);
  }
  if (t.done && t.skipped) chips.push(["chip opt", "⏭️ Skipped (caught up)"]);
  if (t.rolledFrom && !t.done && t.date && t.rolledFrom < t.date)
    chips.push(["chip opt", `🔁 Rolled over from ${fromKey(t.rolledFrom).toLocaleDateString(undefined, { weekday: "short" })}`]);
  if (t.done && t.doneAt) chips.push(["chip opt", `⏰ Done ${formatTime(t.doneAt.slice(11, 16))}`]);
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
    for (const [cls, text, c, tip] of chips) {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      if (tip) s.title = tip;
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
  if (hol) fact(holLabel(hol));
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
  const work = el("button", "g-btn peek-work", "💼 Go to Work Helper");
  work.addEventListener("click", () => { dlg.close(); showView("work"); workDay = key; renderWorkHelper(); });
  actions.append(go, add, work);
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

// 📌 Notes on the day (not tasks): 🏖️ vacation (a LEAVE event) and 🪖 DRILL events. Tap one to open it.
function renderDayNotes(day) {
  const box = $("day-notes");
  if (!box) return;
  box.innerHTML = "";
  const fmt = d => fromKey(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const notes = [
    ...leavesOn(day).map(t => [`🏖️ Vacation day · ${t.title}` + (leaveEnd(t) > t.date ? ` (${fmt(t.date)}–${fmt(leaveEnd(t))})` : ""), t, "leave"]),
    ...tasks.filter(t => isDrill(t) && day >= t.date && day <= leaveEnd(t)).sort(byTime)
      .map(t => [`🪖 ${t.title}` + (t.time ? ` · ${formatTime(t.time)}${t.minutes ? `–${formatTime(addMinutesTo(t.time, t.minutes))}` : ""}` : ""), t, "drill"]),
  ];
  box.hidden = !notes.length;
  for (const [text, t, cls] of notes) {
    const b = el("button", "day-note " + cls, text);
    b.type = "button";
    b.title = "A note on the day (not a task). Tap to see it.";
    b.addEventListener("click", () => openDialog(t));
    box.appendChild(b);
  }
}

// "Next day's problem": push a chore / to-do to the day after the one being looked at.
// …and on its way out, the task gets either zapped by a laser 🛸 or flattened by a bulldozer 🚜.
async function nextDaysProblem(t) {
  const from = t.date && t.date > currentDay ? t.date : currentDay;
  const next = addDays(from, 1);
  const before = { ...t };
  const li = document.querySelector(`#task-list li[data-id="${t.id}"]`);
  if (li && motionOk() && !celebrating) {
    celebrating = true;                               // (no redraws mid-demolition)
    try { await (Math.random() < .5 ? laserTask(li) : bulldozeTask(li)); } catch {} finally { celebrating = false; }
  }
  persist({ ...t, date: next });
  const when = next === addDays(todayKey(), 1) ? "tomorrow" : fromKey(next).toLocaleDateString(undefined, { weekday: "long" });
  showToast(`😴 "${t.title}" is ${when}'s problem now.`, "Undo", () => persist(before));
}

// 🌋 Volcano mode: lava blobs spurt out of the top non-stop, smoke billows, the cap rattles and the
// whole vial glows like magma. (Only on the second full chaos day in a row.)
function setVolcano(on) {
  const flask = $("chaos-flask");
  if (calmMode()) on = false;
  flask.classList.toggle("volcano", on);
  let v = flask.querySelector(".volcano-fx");
  if (!on) { if (v) v.remove(); return; }
  if (v) return;
  v = el("div", "volcano-fx");
  v.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 14; i++) {
    const b = el("span", "lava");
    b.style.setProperty("--dx", `${Math.round((Math.random() * 2 - 1) * 46)}px`);
    b.style.setProperty("--up", `${50 + Math.round(Math.random() * 50)}px`);
    b.style.setProperty("--s", `${5 + Math.random() * 7}px`);
    b.style.animationDuration = `${1 + Math.random() * .7}s`;
    b.style.animationDelay = `${-Math.random() * 1.6}s`;
    v.appendChild(b);
  }
  for (let i = 0; i < 4; i++) {
    const s = el("span", "volcano-smoke", "💨");
    s.style.animationDelay = `${-i * .8}s`;
    s.style.setProperty("--sx", `${(i % 2 ? 1 : -1) * (6 + i * 4)}px`);
    v.appendChild(s);
  }
  v.appendChild(el("span", "volcano-tag", "🌋"));
  flask.appendChild(v);
}

// A finished-with demolition: resolves when it's over (a timer, too, so a hidden screen can't stall it).
const demoDone = (ms, cleanup) => new Promise(res => setTimeout(() => { try { cleanup(); } catch {} res(); }, ms));
function fxAt(cls, text, r, x, y) {
  const e = el("div", cls, text || "");
  Object.assign(e.style, { left: `${x}px`, top: `${y}px` });
  document.body.appendChild(e);
  return e;
}
// 🛸 A little UFO swoops in from the left, charges up, and fires a laser across the task: it flashes
// white, crackles and fizzles away into sparks.
function laserTask(li) {
  const r = li.getBoundingClientRect(), cy = r.top + r.height / 2;
  const ufo = fxAt("zap-ufo", "🛸", r, r.left - 6, cy);
  const beam = fxAt("zap-beam", "", r, r.left + 22, cy);
  beam.style.setProperty("--w", `${Math.max(40, r.width - 30)}px`);
  li.classList.add("zap-target");
  if (typeof playLaser === "function") setTimeout(playLaser, 380);
  setTimeout(() => { buzz([15, 20, 15, 20, 40]); li.classList.add("zapped"); }, 560);
  setTimeout(() => { try { burstFrom(r.left + r.width * .55, cy, 16, ["✨", "⚡", "💥", "✦"], 260); } catch {} }, 700);
  return demoDone(1350, () => { ufo.remove(); beam.remove(); });
}
// 🚜 A bulldozer rumbles in from the left and drives straight through the task, scraping it away
// as it goes, with bricks and dust flying off the blade.
function bulldozeTask(li) {
  const r = li.getBoundingClientRect(), cy = r.top + r.height / 2;
  const size = Math.max(34, Math.min(64, r.height * .95));
  const dozer = fxAt("dozer", "🚜", r, r.left - size, cy);
  dozer.style.fontSize = `${size}px`;
  dozer.style.setProperty("--dist", `${r.width + size * 1.6}px`);
  li.classList.add("dozed");
  if (typeof playBulldozer === "function") playBulldozer();
  buzz([30, 40, 30, 40, 30, 40, 60]);
  const bits = setInterval(() => {                    // rubble flies off the front of the blade
    const d = dozer.getBoundingClientRect();
    try { burstFrom(d.right - 4, cy, 2, ["🧱", "💨", "🪨"], 90); } catch {}
  }, 160);
  return demoDone(1500, () => { clearInterval(bits); dozer.remove(); });
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
window.addEventListener("online", () => scheduleSyncs());     // signal's back: send what waited
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

// ---------- 📅 week view (like a wall calendar's week: one tall column per day) ----------
let calMode = "month";               // "month" | "week" | "work" (Mon–Fri)
try { calMode = localStorage.getItem("arpPlanner.calMode") || "month"; } catch {}
let weekCursor = weekStartOf(todayKey());
const WEEK_COLORS = { event: "#3987e5", task: "#d95926", chore: "#199e70", workout: "#c98500", joy: "#d6609a", work: "#6b7bb8" };

function renderWeekBoard() {
  const board = $("week-board"), grid = $("month-grid");
  for (const b of document.querySelectorAll("#cal-modes [data-cal]")) b.classList.toggle("active", b.dataset.cal === calMode);
  $("this-month").textContent = calMode === "month" ? "This month" : "This week";
  const week = calMode !== "month";
  board.hidden = !week;
  grid.hidden = week;
  document.querySelector("#month-view > .hint").textContent = week
    ? "Scroll sideways for more days. Tap a day's name to plan it, or a card to change it."
    : "Click a day to see it and plan it.";
  if (!week) return;

  const tk = todayKey();
  const days = calMode === "work" ? [1, 2, 3, 4, 5].map(i => addDays(weekCursor, i)) : [0, 1, 2, 3, 4, 5, 6].map(i => addDays(weekCursor, i));
  const fmt = (k, o) => fromKey(k).toLocaleDateString(undefined, o);
  $("month-title").textContent = `${fmt(days[0], { month: "short", day: "numeric" })} – ${fmt(days[days.length - 1], { month: "short", day: "numeric", year: "numeric" })}`;
  board.innerHTML = "";
  board.style.setProperty("--cols", days.length);
  let todayCol = null;
  for (const key of days) {
    const col = el("div", "week-col" + (key === tk ? " today" : "") + (key < tk ? " past" : ""));
    const head = el("button", "week-head");
    head.type = "button";
    head.append(el("span", "week-dow", fmt(key, { weekday: "short" })), el("span", "week-num", String(fromKey(key).getDate())));
    const feel = feelingOf(moods[key]);
    if (feel) head.appendChild(el("span", "week-mood", feel.emoji));
    head.title = "See and plan " + fmt(key, { weekday: "long", month: "long", day: "numeric" });
    head.addEventListener("click", () => openDayPeek(key));
    col.appendChild(head);
    const shift = workHoursFor(key), hol = holidayOn(key);
    const tags = el("div", "week-tags");
    tags.appendChild(el("span", "week-tag " + (shift ? "work" : "off"), shift ? `💼 ${shortTime(shift.start)}–${shortTime(shift.end)}` : "🌴 Day off"));
    if (hol) tags.appendChild(el("span", "week-tag hol", holLabel(hol)));
    col.appendChild(tags);

    const list = tasks.filter(t => !t.deleted && (t.dueDate ? t.dueDate === key : t.date === key) && !monthHidden.has(monthKind(t)))
      .sort((a, b) => (!a.time !== !b.time ? (a.time ? -1 : 1) : byTime(a, b)));
    const body = el("div", "week-items");
    if (!list.length) body.appendChild(el("div", "week-empty", "Nothing planned ✨"));
    for (const t of list) {
      const card = el("button", "week-card" + (t.done ? " done" : "") + (t.dueDate ? " due" : ""));
      card.type = "button";
      card.style.setProperty("--kind", WEEK_COLORS[monthKind(t)] || WEEK_COLORS.task);
      if (t.time || t.dueDate) card.appendChild(el("span", "week-time", t.dueDate ? "⏰ Due" : formatTime(t.time) + (t.minutes ? ` · ${formatMinutes(t.minutes)}` : "")));
      card.appendChild(el("span", "week-title", `${emojiOf(t) || ""} ${t.title}`.trim()));
      card.title = t.title;
      card.addEventListener("click", () => openDialog(t));
      body.appendChild(card);
    }
    col.appendChild(body);
    board.appendChild(col);
    if (key === tk) todayCol = col;
  }
  // Open on today's column when it's in view (phones show a few days at a time).
  if (todayCol) requestAnimationFrame(() => {
    if (todayCol.getBoundingClientRect().right <= board.getBoundingClientRect().right + 2) return;     // already in view
    board.scrollLeft = Math.max(0, todayCol.getBoundingClientRect().left - board.firstChild.getBoundingClientRect().left - 8);
  });
}

// ---------- month view ----------
let showWorkDays = false;   // calendar "💼 Work days" toggle (remembered on this device)
try { showWorkDays = localStorage.getItem("arpPlanner.showWork") === "1"; } catch {}

// Calendar filters: which kinds of things show in the day boxes (each one toggles on/off).
const MONTH_KINDS = [["task", "✏️ Tasks"], ["chore", "🧹 Chores"], ["event", "📅 Appointments"], ["work", "💼 Work"],
  ["workout", "🏃 Workouts"], ["joy", "🌈 Joy"]];
let monthHidden = new Set();
try { monthHidden = new Set(JSON.parse(localStorage.getItem("arpPlanner.monthHidden") || "[]")); } catch {}
const monthKind = t => (isWorkShift(t) ? "work" : isJoy(t) ? "joy" : kindOf(t));
function renderMonthFilters() {
  const box = $("month-filters");
  box.innerHTML = "";
  const save = () => { try { localStorage.setItem("arpPlanner.monthHidden", JSON.stringify([...monthHidden])); } catch {} render(); };
  const all = document.createElement("button");
  all.className = "sort-btn" + (monthHidden.size ? "" : " active");
  all.textContent = "All";
  all.addEventListener("click", () => { monthHidden.clear(); save(); });
  box.appendChild(all);
  for (const [k, label] of MONTH_KINDS) {
    const b = document.createElement("button");
    const on = !monthHidden.has(k);
    b.className = "sort-btn" + (on && monthHidden.size ? " active" : "") + (on ? "" : " off");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Tap to hide these" : "Tap to show these";
    b.addEventListener("click", () => { if (on) monthHidden.add(k); else monthHidden.delete(k); save(); });
    // A long press (or double-click) shows only this kind.
    b.addEventListener("dblclick", () => { monthHidden = new Set(MONTH_KINDS.map(x => x[0]).filter(x => x !== k)); save(); });
    box.appendChild(b);
  }
  // 🏷️ Holiday names on or off (off: just the holiday's emoji, everywhere in the planner).
  const names = el("label", "check cal-hol-names");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = themePref().holidayNames !== false;
  cb.addEventListener("change", () => saveTheme({ holidayNames: cb.checked }));
  names.append(cb, " 🏷️ Holiday names");
  box.appendChild(names);
}

function renderMonth() {
  renderMonthFilters();
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
        className: "work-tag", textContent: shift ? `💼 ${shortTime(shift.start)}–${shortTime(shift.end)}` : vacationOn(key) ? "🏖️ Vacation" : "🌴 Off",
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
      if (body && body.id === "sick") { cell.classList.add("sick-day"); e.title += " · a rest day 🛌"; }
      top.appendChild(e);
    }
    cell.appendChild(top);
    if (hol) cell.appendChild(Object.assign(document.createElement("span"), { className: "hol-name", textContent: holLabel(hol) }));

    // Cycle phase stripe along the bottom of the cell (dashed = predicted).
    const ci = cycleInfo(key);
    if (ci) {
      cell.classList.add("has-phase");
      if (ci.projected || key > tk) cell.classList.add("predicted");
      cell.style.setProperty("--phase", PHASES[ci.phase].color);
    }

    // In the calendar, deadline tasks show on their due date (not every day they carry over).
    const list = tasks.filter(t => !t.deleted && (t.dueDate ? t.dueDate === key : t.date === key) && !monthHidden.has(monthKind(t)))
      .sort((a, b) => (!a.time !== !b.time ? (a.time ? -1 : 1) : byTime(a, b)));
    const shown = matchMedia("(max-width: 600px)").matches ? 3 : 4;      // phones: fewer, roomier
    for (const t of list.slice(0, shown)) {
      const p = document.createElement("span");
      p.className = "peek" + (t.done ? " done" : "");
      p.title = t.title;
      p.append(Object.assign(document.createElement("span"), { className: "peek-emoji", textContent: emojiOf(t) }),
        Object.assign(document.createElement("span"), { className: "peek-text" }));
      const txt = p.lastChild;
      if (burnoutRisk(t, key) || t.dueDate || t.time) txt.appendChild(Object.assign(document.createElement("span"), { className: "peek-time",
        textContent: (burnoutRisk(t, key) ? "⚠️ " : "") + (t.dueDate ? "⏰ " : t.time ? formatTime(t.time) + " " : "") }));
      txt.append(t.title);
      if (isTodo(t)) p.classList.add("todo");
      const c = t.dueDate ? null : LEVEL_COLOR[levelOf(t, key)];
      if (t.dueDate) p.classList.add("due");
      if (c) p.style.setProperty("--dot", c);
      cell.appendChild(p);
    }
    if (list.length > shown) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${list.length - shown}`;
      cell.appendChild(more);
    }
    cell.title = (hol ? `${holLabel(hol)} · ` : "") + (dueHere.length ? `❗ ${dueHere.length} due · ` : "") +
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
  renderWeekBoard();

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
  for (const name of ["home", "day", "month", "todo", "work", "joy", "logan", "recap", "collection", "settings", "fidget", "adventure"]) {
    $(name + "-view").hidden = v !== name;
    if ($("tab-" + name)) $("tab-" + name).classList.toggle("active", v === name || (name === "settings" && (v === "fidget" || v === "adventure")));
  }
  $("tab-burger").classList.toggle("active", !!document.querySelector("#burger-menu .tab.active"));   // (one of its pages is open)
  if (v === "month") {
    monthCursor = fromKey(currentDay);
    monthCursor.setDate(1);
  }
  render();
}

function render() {
  scheduleDedupe();
  brainByName = null;              // brainpower she rated by name: re-read from the latest tasks
  if (view !== "day" && view !== "month") setFireFloor(0);
  if (view !== "day") setHeaven(false);
  if (view === "home") { renderHome(); if (typeof renderTogether === "function") renderTogether(); }
  else if (view === "day") { renderDay(); renderSidebar(); renderFitIn(); renderAssistant(); }
  else if (view === "month") renderMonth();
  else if (view === "todo") renderTodo();
  else if (view === "work") renderWorkHelper();
  else if (view === "joy") renderJoy();
  else if (view === "fidget") renderFidgets();
  else if (view === "logan") renderLogan();
  else if (view === "collection") renderCollection();
  else if (view === "adventure") { if (!$("adventure-body").childElementCount) renderAdventure(); }
  else if (view === "settings") {
    renderAppearance();
    renderTimeZone();
    renderGoogleSettings(); renderMicrosoftSettings(); renderHealthSettings();   // (her phone signs in with paste-back)
    if (STANDALONE) renderPhoneApp(); else if (ON_PC) renderPhoneSettings(); else renderPcOnlyNotes();
    renderCycleSettings();
    renderBrainSettings();
    renderAiSettings();
    if (typeof renderLoganSettings === "function") renderLoganSettings();
    renderFitness();
  }
  else renderRecap();
  if ($("checkin-dialog").open) renderCheckin();
  if ($("focus-dialog") && $("focus-dialog").open) renderFocus();
  updateAppIcon();
}

// The app's icon is today's chaos flask: the browser-tab icon everywhere, and on this PC the
// desktop shortcut too (planner.pyw swaps it). Levels match the meter: calm green → boiling red.
let iconLevel = null;
function updateAppIcon() {
  let level = 1;
  try {
    const tk = todayKey(), p = planDay(tk), ft = freeTimeLeft(tk, p.active);
    const pct = ft.past ? 0 : chaosFor(tk, ft).pct;
    level = pct < 25 ? 0 : pct < 50 ? 1 : pct < 75 ? 2 : pct < 90 ? 3 : 4;
  } catch { return; }
  if (level === iconLevel) return;
  iconLevel = level;
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `chaos-icons/chaos-${level}.png`;
  if (ON_PC) fetch(`/api/chaosicon?level=${level}`, { method: "POST" }).catch(() => {});
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

// Home cards fold up too (fewer things pulling at her attention). Some start folded.
const HOME_OPEN_KEY = "arpPlanner.openHome";
const HOME_START_CLOSED = ["Free time together", "This week"];
let homeOpen = {};
try { homeOpen = JSON.parse(localStorage.getItem(HOME_OPEN_KEY)) || {}; } catch {}
function setHomeOpen(card, open) {
  card.classList.toggle("open", open);
  card.querySelector(":scope > h3").setAttribute("aria-expanded", String(open));
  homeOpen[sectionKey(card)] = open;
  try { localStorage.setItem(HOME_OPEN_KEY, JSON.stringify(homeOpen)); } catch {}
}
function makeFoldable(card, setOpen, startOpen) {
  const h = card.querySelector(":scope > h3");
  if (!h || card.classList.contains("section")) return;
  card.classList.add("section");
  h.classList.add("section-head");
  h.setAttribute("role", "button");
  h.tabIndex = 0;
  const chevron = document.createElement("span");
  chevron.className = "section-chevron";
  chevron.textContent = "▾";
  h.appendChild(chevron);
  const toggle = () => { const open = !card.classList.contains("open"); foldAnim(card, open, () => setOpen(card, open)); };
  h.addEventListener("click", toggle);
  h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  card.classList.toggle("open", startOpen);
  h.setAttribute("aria-expanded", String(startOpen));
}
(function setupHomeSections() {
  for (const card of document.querySelectorAll("#home-view .home-card")) {
    if (!card.querySelector(":scope > h3")) continue;            // (the Today card stays open)
    const key = sectionKey(card);
    makeFoldable(card, setHomeOpen, key in homeOpen ? homeOpen[key] : !HOME_START_CLOSED.includes(key));
  }
})();
// "Collapse all / Expand all" for a page with folding cards.
(function setupCollapseAll() {
  for (const bar of document.querySelectorAll(".collapse-all")) {
    if (bar.dataset.for === "day-view") continue;              // (the Day page has its own, below)
    const view = $(bar.dataset.for);
    const cards = () => [...view.querySelectorAll(".section")];
    const setter = bar.dataset.for === "settings-view" ? (c, o) => setSectionOpen(c, o) : (c, o) => setHomeOpen(c, o);
    const all = open => () => cards().forEach(c => { if (c.classList.contains("open") !== open) foldAnim(c, open, () => setter(c, open)); });
    const a = document.createElement("button"), b = document.createElement("button");
    a.className = b.className = "link-btn";
    a.textContent = "▸ Collapse all";
    b.textContent = "▾ Expand all";
    a.addEventListener("click", all(false));
    b.addEventListener("click", all(true));
    bar.append(a, b);
  }
})();

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
    const toggle = () => { const open = !card.classList.contains("open"); foldAnim(card, open, () => setSectionOpen(card, open)); };
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
  // Whose clock this screen runs on ("today", "now", the timers). Just this device.
  const view = el("div", "clock-row");
  view.appendChild(el("span", "clock-label", "This screen shows"));
  const vseg = el("div", "sort-toggle");
  for (const [mode, text] of [["her", "🌲 Washington · Ariel's time"], ["tokyo", "🗾 Tokyo · Logan's time"]]) {
    const b = el("button", "sort-btn" + (viewZone() === mode ? " active" : ""), text);
    b.type = "button";
    b.addEventListener("click", () => {
      try { mode === "tokyo" ? localStorage.setItem("arpPlanner.viewZone", "tokyo") : localStorage.removeItem("arpPlanner.viewZone"); } catch {}
      currentDay = todayKey();
      render();
      renderTimeZone();
    });
    vseg.appendChild(b);
  }
  view.appendChild(vseg);
  box.appendChild(view);
  box.appendChild(el("p", "hint-small", "Just for this device: her phone and your PC can each pick. It changes which day is " +
    "\"today\" and what time it is now; the times on her tasks always stay her times."));
  const zoneNow = zone => {
    const n = new Date(new Date().toLocaleString("en-US", { timeZone: zone }));
    return `${formatTime(`${pad(n.getHours())}:${pad(n.getMinutes())}`)} on ${n.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`;
  };
  box.appendChild(el("p", "tz-now", `🌲 For Ariel it's ${zoneNow(plannerZone() || HER_DEFAULT_ZONE)}.`));
  box.appendChild(el("p", "tz-now", `🗾 In Tokyo it's ${zoneNow(LOGAN_ZONE)}.`));

  box.appendChild(el("h4", "tz-sub", "Ariel's home time zone"));
  box.appendChild(el("p", "hint-small", "Her days, her clock: Google and To Do times use this zone, on the PC and on her phone. Change it only if she moves or travels."));
  const sel = el("select", "tz-select");
  sel.add(new Option("Not set (her phone's own clock, Pacific)", ""));
  for (const [id, label] of TIME_ZONES) sel.add(new Option(label, id));
  const cur = plannerZone() || "";
  if (cur && !TIME_ZONES.some(([id]) => id === cur)) sel.add(new Option(cur, cur));
  sel.value = cur;
  sel.addEventListener("change", async () => {
    await saveProfile({ timeZone: sel.value || null });
    currentDay = todayKey();
    render();
    showToast(`🕒 Using ${sel.value ? sel.options[sel.selectedIndex].text : "her phone's clock"}. Updating Google and To Do times…`);
    if (typeof syncGoogle === "function") syncGoogle(false);
    if (typeof syncMicrosoft === "function") syncMicrosoft(false);
    renderTimeZone();
  });
  box.appendChild(sel);

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
  $("task-form").classList.toggle("is-task", kind === "task" || kind === "joy");
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

// The emoji box in the task dialog: her pick, or the best guess (updated as she types the title).
let emojiChosen = false;
const EMOJI_IDEAS = ["💼", "📚", "🧺", "🧹", "🛒", "🍳", "🏋️", "🚶‍♀️", "🩺", "💳", "📱", "🪴", "🦜", "🐱", "❤️", "🎮", "🎨", "🛁", "😴", "📅", "✏️", "🌈"];
function fillEmojiPicker(task) {
  emojiChosen = !!(task && task.emoji);
  const input = $("f-emoji");
  input.value = task ? emojiOf(task) : "✏️";
  const ideas = $("f-emoji-ideas");
  ideas.innerHTML = "";
  for (const e of EMOJI_IDEAS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-idea";
    b.textContent = e;
    b.addEventListener("click", () => { input.value = e; emojiChosen = true; });
    ideas.appendChild(b);
  }
}
$("f-emoji").addEventListener("input", () => { emojiChosen = true; });
$("f-title").addEventListener("input", () => {
  if (emojiChosen) return;
  $("f-emoji").value = guessEmoji({ title: $("f-title").value, kind: getSeg("f-kind") || "task", time: null });
});

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
  fillEmojiPicker(task);
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
    emoji: emojiChosen ? ($("f-emoji").value.trim() || null) : (editing && editing.emoji) || null,
  };
  // 🤔 Adding something new to an already heavy stretch: a gentle "are you sure?" first.
  let choice = null;
  if (!editing && task.date && !["joy", "event"].includes(kind)) {
    const pb = pushbackFor(task.date);
    if (pb) {
      choice = await askPushback(task, pb);
      if (choice === "cancel") return;
      if (choice && choice.date) task.date = choice.date;
    }
  }
  await persist(task);
  if (choice === "anyway") offerJoy(task.date);
  else if (task.date) warnIfOverloaded(task.date);
}

// 🤔 Push-back: she tends to take on more than she can chew. When this week already had 2+ chaos
// days (90%+ on the vial) and the day's brain or body battery is nearly empty (under 20% left),
// adding something asks her first, like a friend would. She can still add it.
function pushbackFor(day) {
  const tk = todayKey();
  if (!day || day < tk) return null;
  const wk = weekStartOf(tk);
  const days = new Set(((profile.dayMarks || {}).chaos90 || []).filter(d => d >= wk && d <= tk));
  try { const p = planDay(tk), ft = freeTimeLeft(tk, p.active); if (!ft.past && chaosFor(tk, ft).pct >= 90) days.add(tk); } catch {}
  if (days.size < 2) return null;
  let b;
  try { b = batteriesFor(day); } catch { return null; }
  const low = ["brain", "body"].filter(k => b[k].pctLeft < 20);
  return low.length ? { chaosDays: days.size, low, bats: b } : null;
}
const dayName = (day, tk = todayKey()) => day === tk ? "today" : day === addDays(tk, 1) ? "tomorrow" : fromKey(day).toLocaleDateString(undefined, { weekday: "long" });
// A lighter day in the next week and a half (both batteries at least 40% left), before any deadline.
function lighterDayFor(task) {
  for (let i = 1; i <= 10; i++) {
    const d = addDays(task.date, i);
    if (task.dueDate && d > task.dueDate) return null;
    try { const b = batteriesFor(d); if (b.brain.pctLeft >= 40 && b.body.pctLeft >= 40) return d; } catch {}
  }
  return null;
}
function nextVacation(from) {
  for (let i = 1; i <= 45; i++) { const d = addDays(from, i); if (vacationOn(d)) return d; }
  return null;
}
function smallDialog(cls) {
  let dlg = $("pushback-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "pushback-dialog";
    document.body.appendChild(dlg);
  }
  dlg.className = `peek-dialog pushback ${cls || ""}`;
  dlg.innerHTML = "";
  return dlg;
}
function askPushback(task, pb) {
  return new Promise(resolve => {
    const dlg = smallDialog();
    const name = dayName(task.date);
    const bat = pb.low.map(k => `${k === "brain" ? "🧠 brain" : "💪 body"} battery ${pb.bats[k].pctLeft < 0 ? "is already past empty" : `is down to ${pb.bats[k].pctLeft}%`}`).join(" and your ");
    dlg.appendChild(el("h3", "", "🤔 Can we reason about this one?"));
    dlg.appendChild(el("p", "", `You've had ${pb.chaosDays} chaos days this week, and for ${name}, your ${bat}. ` +
      `You've been carrying a lot. Is "${task.title}" something that has to happen ${name === "today" ? "today" : "then"}?`));
    const vac = nextVacation(task.date), later = lighterDayFor(task);
    if (vac && (!task.dueDate || vac <= task.dueDate))
      dlg.appendChild(el("p", "hint-small", `🏖️ Your vacation starts ${fromKey(vac).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}. If this can wait, it might feel a lot lighter then.`));
    const btns = el("div", "peek-actions");
    const done = v => { resolve(v); dlg.close(); };
    if (later) {
      const move = el("button", "g-btn primary", `📅 Put it on ${dayName(later)}`);
      move.addEventListener("click", () => { showToast(`📅 "${task.title}" is on ${dayName(later)} instead. Good call 💛`); done({ date: later }); });
      btns.appendChild(move);
    }
    if (vac && vac !== later && (!task.dueDate || vac <= task.dueDate)) {
      const v = el("button", "g-btn", "🏖️ Put it on my vacation");
      v.addEventListener("click", () => done({ date: vac }));
      btns.appendChild(v);
    }
    const anyway = el("button", "g-btn" + (later ? "" : " primary"), "I've got this: add it anyway");
    anyway.addEventListener("click", () => done("anyway"));
    const no = el("button", "link-btn", "Never mind, don't add it");
    no.addEventListener("click", () => done("cancel"));
    btns.append(anyway, no);
    dlg.appendChild(btns);
    dlg.onclose = () => resolve("cancel");          // (closing it any other way: nothing added)
    dlg.showModal();
  });
}
// After "add it anyway" on a heavy day: a friend's nudge toward something that fills her back up.
function offerJoy(day) {
  const have = new Set(joyFor(day).list.map(t => (t.title || "").toLowerCase()));
  const pool = hobbies().filter(h => !/\blogan\b/i.test(h.name) && !have.has(h.name.toLowerCase()));
  if (!pool.length) return;
  let h = pool[Math.floor(Math.random() * pool.length)];
  const show = () => {
    const dlg = smallDialog("joy-nudge");
    dlg.onclose = null;
    dlg.appendChild(el("h3", "", "Okay, it's on there 💛"));
    dlg.appendChild(el("p", "", `That's a big ${dayName(day) === "today" ? "day" : dayName(day)}. How about some ${h.emoji || "🌈"} ${h.name} too, to balance it out? ` +
      `Even ${formatMinutes(Math.min(h.minutes || 30, 30))} of it would be really good for you after all that.`));
    const btns = el("div", "peek-actions");
    const add = el("button", "g-btn primary", `${h.emoji || "🌈"} Yes, add ${h.name}`);
    add.addEventListener("click", () => { dlg.close(); addJoyTask({ ...h, minutes: Math.min(h.minutes || 30, 30) }, day); });
    const other = el("button", "g-btn", "🎲 Something else");
    other.hidden = pool.length < 2;
    other.addEventListener("click", () => { const was = h; while (h === was) h = pool[Math.floor(Math.random() * pool.length)]; show(); });
    const no = el("button", "link-btn", "Not this time");
    no.addEventListener("click", () => dlg.close());
    btns.append(add, other, no);
    dlg.appendChild(btns);
    if (!dlg.open) dlg.showModal();
  };
  show();
}

// by: "her" (anything she does on screen) or "claude" (the Claude helper). When she moves a task
// herself it's marked (herMove), so Claude's automatic re-plans leave it where she put it; when she
// sets a length herself it's no longer a guess.
async function persist(task, rerender = true, { by = "her" } = {}) {
  const old = tasks.find(t => t.id === task.id);
  if (by === "her" && old) {
    if ((old.date || null) !== (task.date || null) || (old.time || null) !== (task.time || null)) task = { ...task, herMove: new Date().toISOString() };
    if (old.minutesGuess && old.minutes !== task.minutes) task = { ...task, minutesGuess: false };
    if (task.rolledFrom && (old.date || null) !== (task.date || null)) task = { ...task, rolledFrom: null };
    // 👹 Pushed to a later day while still undone: two of those and it's a boss.
    if (!task.done && !old.done && old.date && task.date && task.date > old.date) task = { ...task, pushes: (old.pushes || 0) + 1 };
  }
  const finishing = by === "her" && task.done && old && !old.done;
  if (by === "her" && task.done && !(old && old.done)) setTimeout(maybeCelebrateAllDone, 500);
  if (by === "her" && task.done && !(old && old.done) && kindOf(task) === "workout")
    setTimeout(() => showToast("💪 Pumped up! Your chaos vial put on a sweatband for the day."), 1200);
  // ⏰ When she ticked it off, on her clock ("YYYY-MM-DDTHH:MM"). Kept for the current week only.
  if (task.done && !(old && old.done) && !task.doneAt) task = { ...task, doneAt: localStamp() };
  if (!task.done && task.doneAt) task = { ...task, doneAt: null };
  try {
    const saved = await Store.put(task);
    const i = tasks.findIndex(t => t.id === saved.id);
    if (i >= 0) tasks[i] = saved; else tasks.push(saved);
    scheduleSyncs();
  } catch {
    showError("Couldn't save. Is the planner still running? Try closing and reopening it.");
  }
  if (finishing && typeof gameOnDone === "function") gameOnDone(old, task);
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
$("tab-joy").addEventListener("click", () => showView("joy"));
$("tab-recap").addEventListener("click", () => { recapAnchor = todayKey(); showView("recap"); });
const goDay = day => { currentDay = day; showOptional = false; render(); };
$("prev-day").addEventListener("click", () => turnPage(-1));
$("energy-pill").addEventListener("click", () => openSettingsSection("brain-settings"));
$("award-more").addEventListener("click", () => { if (typeof openAwards === "function") openAwards(currentDay); });
$("work-pill").addEventListener("click", () => openSettingsSection("work-hours"));
$("next-day").addEventListener("click", () => turnPage(1));

// 📅 The Calendar turns like a page too: swipe left for the next month (or week), right for the one before.
function turnCalendar(dir) {
  $(dir > 0 ? "next-month" : "prev-month").click();
  const v = $("month-view");
  v.classList.remove("turn-next", "turn-prev");
  void v.offsetWidth;
  v.classList.add(dir > 0 ? "turn-next" : "turn-prev");
  clearTimeout(turnCalendar.t);
  turnCalendar.t = setTimeout(() => v.classList.remove("turn-next", "turn-prev"), 550);
}

// 📖 Turning the page: next day (swipe left / ›) or the day before (swipe right / ‹).
function turnPage(dir) {
  goDay(addDays(currentDay, dir));
  const v = $("day-view");
  v.classList.remove("turn-next", "turn-prev");
  void v.offsetWidth;
  v.classList.add(dir > 0 ? "turn-next" : "turn-prev");
  clearTimeout(turnPage.t);
  turnPage.t = setTimeout(() => v.classList.remove("turn-next", "turn-prev"), 550);
}
// Swipe anywhere on the Day page (not on text boxes, sideways-scrolling rows, or the screen's
// very edges, where the phone's own back gesture lives).
(function setupDaySwipe() {
  let sx = 0, sy = 0, st = 0, ok = false;
  addEventListener("touchstart", e => {
    ok = false;
    if ((view !== "day" && view !== "month" && view !== "work") || e.touches.length !== 1 || document.querySelector("dialog[open]")) return;
    const p = e.touches[0], tgt = e.target;
    if (p.clientX < 24 || p.clientX > innerWidth - 24) return;
    if (tgt.closest && tgt.closest("input, textarea, select, canvas, .no-swipe")) return;
    for (let n = tgt; n && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return;
    }
    sx = p.clientX; sy = p.clientY; st = Date.now(); ok = true;
  }, { passive: true });
  addEventListener("touchend", e => {
    if (!ok) return;
    ok = false;
    if (rowDrag.active || Date.now() - rowDrag.endedAt < 400) return;      // that was a hold-and-drag
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    if (Date.now() - st > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (view === "month") turnCalendar(dx < 0 ? 1 : -1);
    else if (view === "work") turnWork(dx < 0 ? 1 : -1);
    else turnPage(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
// ✋ Hold a row (about half a second) and it lifts; drag it up or down and a bar shows where it'll
// land (only inside its own section, and only untimed things: timed ones go by their time). Let
// go to drop it there. A quick swipe or scroll never starts a drag.
const rowDrag = { active: false, endedAt: 0 };
(function setupRowDrag() {
  const ul = $("task-list");
  const HOLD_MS = 420;
  let hold = null, li = null, group = null, sx = 0, sy = 0, startY = 0, bar = null, rows = [], at = -1, pid = null;
  const draggable = row => {
    if (!row || !row.classList.contains("task") || row.classList.contains("done")) return false;
    const t = tasks.find(x => x.id === row.dataset.id);
    return !!t && !t.time && !t.done;
  };
  const groupOf = row => row.dataset.sec || "anytime";
  const sameGroup = () => [...ul.querySelectorAll(":scope > li.task")].filter(r => r !== li && draggable(r) && groupOf(r) === group);
  const cancelHold = () => { clearTimeout(hold); hold = null; };
  ul.addEventListener("pointerdown", e => {
    if (e.button > 0 || rowDrag.active || celebrating) return;
    let row = e.target.closest("li");
    while (row && row.parentElement !== ul) row = row.parentElement.closest("li");
    if (!draggable(row) || e.target.closest("button, a, input, select, textarea")) return;
    li = row; sx = e.clientX; sy = e.clientY; pid = e.pointerId;
    cancelHold();
    hold = setTimeout(() => lift(e), HOLD_MS);
  });
  const lift = () => {
    hold = null;
    if (!li || !li.isConnected) return;
    rowDrag.active = true;
    group = groupOf(li);
    rows = sameGroup();
    if (!rows.length) { rowDrag.active = false; li = null; showToast("✋ It's the only one in this section, so there's nowhere to move it."); return; }
    startY = sy;
    li.classList.add("lifted");
    document.body.classList.add("row-dragging");
    if (typeof buzz === "function") buzz(15);
    try { ul.setPointerCapture(pid); } catch {}
    bar = el("li", "drop-bar");
    bar.setAttribute("aria-hidden", "true");
    place(sy);
  };
  const place = y => {
    // The gap nearest her finger: before the first row whose middle is below it.
    let i = rows.findIndex(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (i < 0) i = rows.length;
    at = i;
    if (i < rows.length) rows[i].before(bar); else rows[rows.length - 1].after(bar);
    li.style.transform = `translateY(${y - startY}px) scale(1.03)`;
  };
  ul.addEventListener("pointermove", e => {
    if (hold && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { cancelHold(); li = null; }    // a scroll or swipe
    if (!rowDrag.active || e.pointerId !== pid) return;
    e.preventDefault();
    // Near the top or bottom of the screen: scroll so she can reach further rows.
    if (e.clientY < 70) { scrollBy(0, -12); startY += 12; } else if (e.clientY > innerHeight - 90) { scrollBy(0, 12); startY -= 12; }
    place(e.clientY);
  });
  // While lifted, her finger moves the row, not the page.
  ul.addEventListener("touchmove", e => { if (rowDrag.active) e.preventDefault(); }, { passive: false });
  ul.addEventListener("contextmenu", e => { if (hold || rowDrag.active) e.preventDefault(); });
  const drop = async ok => {
    cancelHold();
    if (!rowDrag.active) { li = null; return; }
    rowDrag.active = false;
    rowDrag.endedAt = Date.now();
    document.body.classList.remove("row-dragging");
    const ids = rows.map(r => r.dataset.id);
    if (ok && at >= 0) ids.splice(at, 0, li.dataset.id);
    bar && bar.remove();
    li.classList.remove("lifted");
    li.style.transform = "";
    const moved = li.dataset.id;
    li = null;
    if (!ok || at < 0) return;
    saveMyOrder(currentDay, ids);
    render();
    const row = ul.querySelector(`:scope > li[data-id="${moved}"]`);
    if (row && motionOk()) row.animate([{ transform: "scale(1.04)", boxShadow: "0 8px 22px rgba(0,0,0,.35)" }, { transform: "none", boxShadow: "none" }], { duration: 260, easing: "ease-out" });
  };
  ul.addEventListener("pointerup", () => drop(true));
  ul.addEventListener("pointercancel", () => drop(false));
  addEventListener("blur", () => drop(false));
  // A drag never counts as a tap (which would open the task).
  ul.addEventListener("click", e => { if (Date.now() - rowDrag.endedAt < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
})();

$("today-btn").addEventListener("click", () => goDay(todayKey()));
$("prev-month").addEventListener("click", () => { if (calMode !== "month") weekCursor = addDays(weekCursor, -7); else monthCursor.setMonth(monthCursor.getMonth() - 1); render(); });
$("next-month").addEventListener("click", () => { if (calMode !== "month") weekCursor = addDays(weekCursor, 7); else monthCursor.setMonth(monthCursor.getMonth() + 1); render(); });
$("this-month").addEventListener("click", () => { weekCursor = weekStartOf(todayKey()); monthCursor = nowLocal(); monthCursor.setDate(1); render(); });
for (const b of document.querySelectorAll("#cal-modes [data-cal]")) b.addEventListener("click", () => {
  calMode = b.dataset.cal;
  try { localStorage.setItem("arpPlanner.calMode", calMode); } catch {}
  // Keep looking at the same stretch of time when switching.
  if (calMode === "month") { monthCursor = fromKey(weekCursor < toKey(monthCursor) ? toKey(monthCursor) : weekCursor); monthCursor.setDate(1); }
  else if (weekStartOf(todayKey()) < toKey(monthCursor) || weekStartOf(todayKey()) > toKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0)))
    weekCursor = weekStartOf(toKey(monthCursor));
  else weekCursor = weekStartOf(todayKey());
  render();
});
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

// 🍔 The burger menu: tap the burger and it pops apart (bun, lettuce, cheese, patty) as the menu
// drops out. Picking a page, tapping anywhere else, or Escape closes it.
(function setupBurger() {
  const btn = $("tab-burger"), menu = $("burger-menu");
  const set = open => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("open", open);
  };
  btn.addEventListener("click", e => { e.stopPropagation(); set(menu.hidden); if (!menu.hidden) buzz(8); });
  menu.addEventListener("click", e => { if (e.target.closest(".tab")) set(false); });
  document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".burger-wrap")) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
})();

// Keep "Up next" and "Today" fresh if the window stays open (incl. past midnight).
let lastToday = todayKey();
setInterval(() => {
  const tk = todayKey();
  if (tk !== lastToday && currentDay === lastToday) currentDay = tk;
  if (tk !== lastToday) rollOverUnfinished();
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
  setTimeout(rollOverUnfinished, 1500);
})();
