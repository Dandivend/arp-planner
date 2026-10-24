// 🎯 Focus mode: one task at a time, big and uncluttered, with a visual timer.
// Made for ADHD / autism-friendly days: no list to scan, one clear next step, time you
// can see (time blindness), and a heads-up before the next appointment.

let focusSkipped = [];            // task ids she said "not now" to (moved to the back, this session)
let focusCurrent = null;          // id of the task on screen
const focusTimers = {};           // task id -> { total, left, running }
let focusCheer = null;            // a little celebration after "Done!"
let focusFinishing = false;       // an animal is crossing out the task; hold the timer's re-renders

// Her two focus switches (this phone only): ☀️ keep the screen on while it's open, so she can
// glance at the timer, and 🔔 chimes (a jingle for each step, the animal's noise for the whole
// task, a soft chime when time's up). Both start on, and work even with Sound effects off.
function focusPrefs() {
  try { return { screen: true, chimes: true, ...JSON.parse(localStorage.getItem("arpPlanner.focusPrefs") || "{}") }; }
  catch { return { screen: true, chimes: true }; }
}
function setFocusPref(k, v) {
  try { localStorage.setItem("arpPlanner.focusPrefs", JSON.stringify({ ...focusPrefs(), [k]: v })); } catch {}
}
const focusChimes = () => focusPrefs().chimes;

let focusWake = null;
async function focusHoldWake() {
  try { if ("wakeLock" in navigator && !focusWake) { focusWake = await navigator.wakeLock.request("screen"); focusWake.addEventListener("release", () => { focusWake = null; }); } } catch {}
}
function focusReleaseWake() { try { if (focusWake) focusWake.release(); } catch {} focusWake = null; }
document.addEventListener("visibilitychange", () => {     // the phone drops the lock when it's hidden
  if (!document.hidden && $("focus-dialog") && $("focus-dialog").open && focusPrefs().screen) focusHoldWake();
});

function hhmmNow() {
  const n = nowLocal();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

// What's left to do today, most important first; "not now" ones go to the back.
// Jobs that can wait (low energy, brain battery full) and brain-heavy ones outside her thinking
// time go further back, and two brain-heavy jobs don't come one right after the other.
function focusQueue(day) {
  let held = new Set();
  try { held = new Set(planDay(day).held.map(t => t.id)); } catch {}
  const list = tasksFor(day).filter(t => !t.done && !isWorkShift(t) && kindOf(t) !== "event");
  const rank = t => (LEVEL_RANK[levelOf(t, day)] ?? 1) + (held.has(t.id) ? 3 : 0) + (brainTiming(t, day) ? 2 : 0);
  const order = moodOrderOf(day);
  list.sort((a, b) => rank(a) - rank(b) || (order ? moodOrderScore(b, day, order) - moodOrderScore(a, day, order) : 0) || (a.time || "99").localeCompare(b.time || "99") || byTime(a, b));
  // Her own order (dragged on the Day tab, or set by the Claude buttons) wins over the shuffle.
  const ordered = myOrderOf(day) ? byMyOrder(list, day) : spreadBrain(list);
  const skipped = ordered.filter(t => focusSkipped.includes(t.id));
  return [...ordered.filter(t => !focusSkipped.includes(t.id)), ...skipped];
}

// A brain break after a brain-heavy job: a 10-minute ring, then "I'm ready".
const BRAIN_BREAK_MIN = 10;
let focusBreak = null;            // { total, left, running }
function startBrainBreak() {
  focusBreak = { total: BRAIN_BREAK_MIN * 60, left: BRAIN_BREAK_MIN * 60, running: true };
  focusCheer = null;
  renderFocus();
  if (!$("focus-dialog").open) $("focus-dialog").showModal();
}

function brainBreakCard() {
  const card = el("div", "focus-card focus-break");
  card.appendChild(el("div", "focus-title", "🔋 Brain break"));
  card.appendChild(el("div", "focus-notes", "Nothing to do but recharge: water, a snack, music, stimming, a stretch, " +
    "staring out the window. All of it counts. 💛"));
  const box = el("div", "focus-timer");
  const ring = el("div", "focus-ring");
  const label = el("div", "focus-ring-text");
  ring.appendChild(label);
  const paint = () => {
    ring.style.setProperty("--pct", `${Math.max(0, focusBreak.left / focusBreak.total) * 360}deg`);
    const s = Math.max(0, Math.round(focusBreak.left));
    label.textContent = s <= 0 ? "🔋" : `${Math.floor(s / 60)}:${pad(s % 60)}`;
  };
  paint();
  box._paint = paint;
  const btns = el("div", "focus-timer-btns");
  const pause = el("button", "g-btn", focusBreak.running ? "⏸ Pause" : "▶ Keep resting");
  pause.addEventListener("click", () => { focusBreak.running = !focusBreak.running; renderFocus(); });
  const ready = el("button", "g-btn primary", focusBreak.left <= 0 ? "✨ Recharged! What's next?" : "I'm ready");
  ready.addEventListener("click", () => { focusBreak = null; renderFocus(); });
  btns.append(pause, ready);
  box.append(ring, btns);
  if (focusBreak.left <= 0) box.appendChild(el("div", "focus-timeup", "Break's done. Take your time coming back 🌟"));
  card.appendChild(box);
  return card;
}

// The next appointment today (so she's not caught off guard).
function nextAppointment(day) {
  if (day !== todayKey()) return null;
  const now = hhmmNow();
  return tasksFor(day).filter(t => t.time && !t.done && kindOf(t) === "event" && t.time >= now)
    .sort((a, b) => a.time.localeCompare(b.time))[0] || null;
}

function minutesUntil(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const n = nowLocal();
  return h * 60 + m - (n.getHours() * 60 + n.getMinutes());
}

function openFocus(startWith = null) {
  focusSkipped = [];
  focusCurrent = typeof startWith === "string" ? startWith : null;     // (a click event isn't a task id)
  focusBreak = null;
  renderFocus();
  $("focus-dialog").showModal();
  if (focusPrefs().screen) focusHoldWake();
}

function renderFocus() {
  const dlg = $("focus-dialog");
  const day = currentDay;
  const queue = focusQueue(day);
  if (!focusCurrent || !queue.some(t => t.id === focusCurrent)) focusCurrent = queue[0] ? queue[0].id : null;
  const t = queue.find(x => x.id === focusCurrent);
  dlg.innerHTML = "";

  const head = el("div", "focus-head");
  head.append(el("span", "focus-kicker", "🎯 One thing at a time"),
    el("span", "focus-left", queue.length ? `${plural(queue.length, "thing")} left ${day === todayKey() ? "today" : "that day"}` : ""));
  const close = el("button", "focus-close", "✕");
  close.title = "Close focus mode";
  close.addEventListener("click", () => dlg.close());
  head.appendChild(close);
  dlg.appendChild(head);

  const toggles = el("div", "focus-toggles");
  const toggle = (k, on, off, tip) => {
    const b = el("button", "focus-toggle" + (focusPrefs()[k] ? " on" : ""), focusPrefs()[k] ? on : off);
    b.type = "button";
    b.title = tip;
    b.setAttribute("aria-pressed", String(!!focusPrefs()[k]));
    b.addEventListener("click", () => {
      const v = !focusPrefs()[k];
      setFocusPref(k, v);
      if (k === "screen") v ? focusHoldWake() : focusReleaseWake();
      if (k === "chimes" && v) playJingle();
      renderFocus();
    });
    return b;
  };
  toggles.append(
    toggle("screen", "☀️ Screen stays on", "🌙 Screen can sleep", "Keep the screen awake while focus mode is open, so you can see the timer"),
    toggle("chimes", "🔔 Chimes on", "🔕 Chimes off", "A jingle for each step, the animal for the whole task, and a chime when time's up"));
  dlg.appendChild(toggles);

  // Heads-up for the next appointment (time blindness helper).
  const appt = nextAppointment(day);
  if (appt) {
    const mins = minutesUntil(appt.time);
    const soon = mins <= 30;
    dlg.appendChild(el("div", "focus-appt" + (soon ? " soon" : ""),
      `📅 ${appt.title} at ${formatTime(appt.time)} · ${mins <= 0 ? "now!" : mins < 60 ? `in ${mins} min` : `in ${formatHrsMin(mins * 60)}`}` +
      (soon && mins > 0 ? ". Time to start wrapping up 💛" : "")));
  }

  if (focusBreak) {
    dlg.appendChild(brainBreakCard());
    return;
  }

  if (focusCheer) {
    const c = el("div", "focus-cheer");
    c.append(el("div", "focus-cheer-emoji", focusCheer.emoji), el("div", "focus-cheer-text", focusCheer.text));
    if (focusCheer.recharge) {
      const r = el("button", "g-btn primary focus-recharge", `🔋 That was a lot of brain. Take a ${BRAIN_BREAK_MIN}-min break?`);
      r.addEventListener("click", startBrainBreak);
      const no = el("button", "g-btn", "I'm good, keep going");
      no.addEventListener("click", () => { focusCheer = null; renderFocus(); });
      c.append(r, no);
    }
    dlg.appendChild(c);
  }

  if (!t) {
    const done = el("div", "focus-empty");
    done.append(el("div", "focus-empty-emoji", "🎉"), el("h2", "", "All done!"),
      el("p", "", "Nothing left on the list. You did it! Rest, play, or do something just for you. 💛"));
    dlg.appendChild(done);
    return;
  }

  const card = el("div", "focus-card");
  const title = el("div", "focus-title");
  title.appendChild(el("span", "title-text", t.title));      // the animal runs along this line
  card.appendChild(title);
  const chips = el("div", "focus-chips");
  const kind = kindOf(t);
  if (kind === "chore") chips.appendChild(el("span", "chip", "🧹 Chore"));
  if (kind === "workout") chips.appendChild(el("span", "chip", "🏃 Workout"));
  if (minutesLeft(t)) chips.appendChild(el("span", "chip", `⏱ ${lengthLabel(t, m => formatHrsMin(m * 60))}`));
  if (brainOf(t) === "heavy") chips.appendChild(el("span", "chip brain", "🧠 Brain-heavy"));
  const bt = brainTiming(t, day);
  if (bt) chips.appendChild(el("span", "chip brain-time", bt.when === "early" ? `🌅 Best after ${formatTime(bt.until)}` : "🌙 Wind-down time"));
  if (t.time) chips.appendChild(el("span", "chip", `🕒 ${formatTime(t.time)}`));
  if (t.dueDate) chips.appendChild(el("span", "chip due", dueLabel(t, day)));
  if (levelOf(t, day) === "important") chips.appendChild(el("span", "chip imp", "Important"));
  if (isTodo(t)) chips.appendChild(el("span", "chip mstodo", "✔️ " + todoListName(t)));
  card.appendChild(chips);
  const justLength = /^\s*(?:(?:half an?|\d+(?:\.\d+)?|an?|one)\s*(?:hours?|hrs?|h)\b)?\s*(?:and\s*)?(?:\d+\s*(?:minutes?|mins?|m)\b)?\s*$/i;
  if (t.notes && !justLength.test(t.notes)) card.appendChild(el("div", "focus-notes", t.notes));
  if (t.steps && t.steps.length) {
    const next = t.steps.find(s => !s.done);
    if (next) card.appendChild(el("div", "focus-step-now", `👉 Just this step: ${next.title}`));
    const steps = stepList(t);
    steps.addEventListener("change", e => { if (e.target.checked && focusChimes()) playJingle(); });   // ding ding!
    card.appendChild(steps);
  }
  card.appendChild(focusTimer(t));
  dlg.appendChild(card);

  const actions = el("div", "focus-actions");
  const done = el("button", "focus-done", "✅ Done!");
  done.addEventListener("click", () => focusDone(t, card));
  const skip = el("button", "focus-skip", "⏭ Not now");
  skip.title = "Show me something else; this one goes to the back";
  skip.addEventListener("click", () => {
    focusSkipped = [...focusSkipped.filter(id => id !== t.id), t.id];
    focusCurrent = null;
    focusCheer = null;
    renderFocus();
  });
  actions.append(done, skip);
  if (kind === "chore" || kind === "task" || isTodo(t)) {
    const later = el("button", "focus-skip", "😴 Next day's problem");
    later.addEventListener("click", () => { focusCheer = null; nextDaysProblem(t); });
    actions.appendChild(later);
  }
  dlg.appendChild(actions);
}

// A countdown you can see: a ring that empties as the time runs out.
function focusTimer(t) {
  // Time the current step when it has a length (one small bite at a time), else the whole task.
  const step = (t.steps || []).find(s => !s.done);
  const useStep = step && step.minutes;
  const key = useStep ? `${t.id}:${step.id}` : t.id;
  const total = (useStep ? step.minutes : minutesLeft(t) || 15) * 60;
  const st = focusTimers[key] || (focusTimers[key] = { total, left: total, running: false });
  st.key = key;
  const box = el("div", "focus-timer");
  const ring = el("div", "focus-ring");
  const label = el("div", "focus-ring-text");
  ring.appendChild(label);
  const paint = () => {
    const pct = st.total ? st.left / st.total : 0;
    ring.style.setProperty("--pct", `${Math.max(0, pct) * 360}deg`);
    const s = Math.max(0, Math.round(st.left));
    label.textContent = st.left <= 0 ? "⏰" : `${Math.floor(s / 60)}:${pad(s % 60)}`;
    ring.classList.toggle("over", st.left <= 0);
  };
  paint();
  const btns = el("div", "focus-timer-btns");
  const go = el("button", "g-btn primary", st.running ? "⏸ Pause" : st.left < st.total ? "▶ Keep going"
    : `▶ Start ${formatMinutes(Math.round(st.total / 60))} timer${useStep ? ` for "${step.title}"` : ""}`);
  go.addEventListener("click", () => { st.running = !st.running; renderFocus(); });
  const reset = el("button", "g-btn", "↺ Reset");
  reset.addEventListener("click", () => { st.left = st.total; st.running = false; renderFocus(); });
  btns.append(go, reset);
  box.append(ring, btns);
  if (st.left <= 0) box.appendChild(el("div", "focus-timeup", "Time's up! Done, or want a few more minutes? Either is okay 🌟"));
  box._paint = paint;
  return box;
}

setInterval(() => {
  const dlg = $("focus-dialog");
  if (!dlg || !dlg.open) return;
  if (focusBreak) {                       // the brain break ticks instead of a task timer
    if (!focusBreak.running) return;
    focusBreak.left -= 1;
    if (focusBreak.left <= 0) {
      focusBreak.left = 0;
      focusBreak.running = false;
      try { navigator.vibrate && navigator.vibrate([150, 100, 150]); } catch {}
      renderFocus();
      return;
    }
    const box = dlg.querySelector(".focus-timer");
    if (box && box._paint) box._paint();
    return;
  }
  if (!focusCurrent) return;
  const st = Object.values(focusTimers).find(x => x.running && x.key && x.key.split(":")[0] === focusCurrent);
  if (!st || focusFinishing) return;
  st.left -= 1;
  if (st.left <= 0) {
    st.left = 0;
    st.running = false;
    try { navigator.vibrate && navigator.vibrate([200, 120, 200]); } catch {}
    if (focusChimes()) playTimeUp();
    renderFocus();
    askTimeUp(st);
    return;
  }
  const box = dlg.querySelector(".focus-timer");
  if (box && box._paint) box._paint();
}, 1000);

const FOCUS_CHEERS = [
  { emoji: "🦜", text: "BURD! You did it!" }, { emoji: "🐐", text: "AAAAAH! Amazing!" },
  { emoji: "🐺", text: "bork bork! Great job!" }, { emoji: "🌟", text: "One down. So proud of you!" },
  { emoji: "💛", text: "Done! That counts. Breathe for a sec." },
];

// Time's up: a little popup asks what she'd like, so the ring doesn't just sit there red.
function askTimeUp(st) {
  const t = tasks.find(x => x.id === focusCurrent);
  if (!t) return;
  const dlg = smallDialog("focus-timeup-ask");
  dlg.appendChild(el("h3", "", "⏰ Time's up!"));
  dlg.appendChild(el("p", "", `How's "${t.title}" going? Either answer is a good one 🌟`));
  const btns = el("div", "peek-actions");
  const more = el("button", "g-btn primary", "⏱ 5 more minutes, please");
  more.addEventListener("click", () => { dlg.close(); st.total = st.left = 5 * 60; st.running = true; renderFocus(); });
  const next = el("button", "g-btn", "✅ All done, on to the next one!");
  next.addEventListener("click", () => {
    dlg.close();
    const card = $("focus-dialog").querySelector(".focus-card");
    focusDone(t, card);
  });
  const skip = el("button", "g-btn", "⏭ Not done, but I'm ready for something else");
  skip.addEventListener("click", () => {
    dlg.close();
    focusSkipped = [...focusSkipped.filter(id => id !== t.id), t.id];
    focusCurrent = null;
    focusCheer = null;
    renderFocus();
  });
  btns.append(more, next, skip);
  dlg.appendChild(btns);
  dlg.showModal();
}

async function focusDone(t, card) {
  if (focusFinishing) return;
  focusCheer = calmMode() ? { emoji: "✓", text: "Done." } : FOCUS_CHEERS[Math.floor(Math.random() * FOCUS_CHEERS.length)];
  const recharge = brainOf(t) === "heavy";        // offer a brain break (and wait for her answer)
  if (recharge) focusCheer = { ...focusCheer, recharge: true };
  for (const k of Object.keys(focusTimers)) if (k.split(":")[0] === t.id) delete focusTimers[k];
  const updated = { ...t, done: true, doneDate: currentDay };
  if (card && card.isConnected && !calmMode()) {  // the animal (bork bork!) crosses it out first
    focusFinishing = true;
    card.classList.add("finishing");
    try { await Promise.all([persist(updated, false), playFinish(card, { line: card.querySelector(".title-text"), sound: focusChimes() })]); }
    finally { focusFinishing = false; }
    focusCurrent = null;
    render();                                     // (also redraws focus mode)
  } else {
    focusCurrent = null;
    await persist(updated);
  }
  renderFocus();
  const cheer = focusCheer;
  if (!recharge) setTimeout(() => { if (focusCheer === cheer) { focusCheer = null; if ($("focus-dialog").open) renderFocus(); } }, 2500);
}

(function setupFocus() {
  const dlg = document.createElement("dialog");
  dlg.id = "focus-dialog";
  dlg.className = "focus-dialog";
  dlg.addEventListener("close", focusReleaseWake);
  document.body.appendChild(dlg);
  $("focus-btn").addEventListener("click", openFocus);
})();
