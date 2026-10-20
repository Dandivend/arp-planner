// 🫁 The calm timer ("permission to breathe"): one shared timer for the brain break, the
// after-work breather and the Fidgets page. It runs by the clock (so it's right even if the phone
// sleeps), can keep the screen on, can show a notice on the lock screen, and ends with a soft
// singing-bowl tone. Her choices (screen / notice / tone) are kept on this device.

let breath = null;                 // { title, text, total, endAt, left, paused, done }
let breathWake = null;
const BREATH_KEY = "arpPlanner.breather";
function breathPrefs() {
  try { return { screen: true, notice: false, tone: true, ...JSON.parse(localStorage.getItem(BREATH_KEY) || "{}") }; }
  catch { return { screen: true, notice: false, tone: true }; }
}
function setBreathPref(k, v) {
  const p = { ...breathPrefs(), [k]: v };
  try { localStorage.setItem(BREATH_KEY, JSON.stringify(p)); } catch {}
}

const BREATH_KINDS = {
  brain: { title: "🔋 Brain break", text: "Nothing to do but recharge: water, a snack, music, stimming, a stretch, staring out the window. All of it counts. 💛" },
  work: { title: "🫁 Permission to breathe", text: "Work's done. You don't have to do anything right now. Shoes off, shoulders down, let the day drain out of you. 💛" },
  calm: { title: "🌿 Calm timer", text: "A little pocket of quiet, just for you. Breathe with the circle, or don't. Either is perfect. 💛" },
};

function openBreather(kind = "calm", minutes = 10) {
  const k = BREATH_KINDS[kind] || BREATH_KINDS.calm;
  breath = { kind, title: k.title, text: k.text, total: minutes * 60, endAt: Date.now() + minutes * 60000, left: minutes * 60, paused: false, done: false };
  let dlg = $("breather-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "breather-dialog";
    dlg.className = "breather-dialog";
    dlg.addEventListener("close", () => { breath = null; releaseWake(); });
    document.body.appendChild(dlg);
  }
  renderBreather();
  if (!dlg.open) dlg.showModal();
  if (breathPrefs().screen) holdWake();
  if (breathPrefs().notice) breathNotice(false);
}

async function holdWake() {
  try { if ("wakeLock" in navigator && !breathWake) { breathWake = await navigator.wakeLock.request("screen"); breathWake.addEventListener("release", () => { breathWake = null; }); } } catch {}
}
function releaseWake() { try { if (breathWake) breathWake.release(); } catch {} breathWake = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && breath && !breath.done && breathPrefs().screen) holdWake(); });

// A notice on the lock screen: when it ends (on start), and "done" when it's done.
async function breathNotice(done) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted" || !breath) return;
    const end = new Date(breath.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const opts = done
      ? { body: "Break's done 💛 Take your time coming back.", tag: "arp-breather", renotify: true, vibrate: [200, 100, 200], icon: "icon.png" }
      : { body: `Until ${end}. Nothing to do but breathe 💛`, tag: "arp-breather", silent: true, icon: "icon.png" };
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(done ? "✨ All rested" : breath.title, opts);
    else new Notification(done ? "✨ All rested" : breath.title, opts);
  } catch {}
}

// A soft, cathartic ending: a singing bowl (with a slow shimmer), then a gentle rising chime.
function playBowl() {
  const ctx = typeof sfx === "function" ? sfx() : null;
  if (!ctx) return;
  for (const [f, v, d] of [[196, .32, 6], [196 * 2.71, .1, 4.5], [196 * 5.13, .05, 3], [197.5, .2, 6]])
    voice(ctx, { type: "sine", pitch: [[0, f]], vol: [[0, 0], [.03, v], [d, 0]], vibrato: { rate: 4.5, depth: f * .004 } });
  [523.25, 659.25, 783.99].forEach((f, i) => voice(ctx, { type: "sine", at: 1.4 + i * .35, pitch: [[0, f]], vol: [[0, 0], [.01, .07], [2.4, 0]] }));
}

function finishBreath() {
  if (!breath || breath.done) return;
  breath.done = true;
  breath.left = 0;
  if (breathPrefs().tone) playBowl();
  try { navigator.vibrate && navigator.vibrate([160, 120, 160, 120, 320]); } catch {}
  if (breathPrefs().notice) breathNotice(true);
  releaseWake();
  renderBreather();
}

function renderBreather() {
  const dlg = $("breather-dialog");
  if (!dlg || !breath) return;
  dlg.innerHTML = "";
  const head = el("div", "focus-head");
  head.append(el("span", "focus-kicker", breath.title));
  const x = el("button", "focus-close", "✕");
  x.title = "Close";
  x.addEventListener("click", () => dlg.close());
  head.appendChild(x);
  dlg.appendChild(head);
  dlg.appendChild(el("p", "breath-text", breath.text));

  const stage = el("div", "breath-stage" + (breath.paused || breath.done ? " still" : ""));
  const orb = el("div", "breath-orb");
  const word = el("div", "breath-word");
  const ring = el("div", "focus-ring breath-ring");
  const label = el("div", "focus-ring-text");
  ring.appendChild(label);
  stage.append(orb, ring, word);
  dlg.appendChild(stage);
  const paint = () => {
    if (!breath) return;
    const left = breath.done ? 0 : breath.paused ? breath.left : Math.max(0, (breath.endAt - Date.now()) / 1000);
    ring.style.setProperty("--pct", `${Math.max(0, left / breath.total) * 360}deg`);
    const s = Math.ceil(left);
    label.textContent = breath.done ? "✨" : `${Math.floor(s / 60)}:${pad(s % 60)}`;
    const cycle = ((Date.now() / 1000) % 10);
    word.textContent = breath.done ? "Welcome back" : breath.paused ? "Paused" : cycle < 4 ? "Breathe in…" : "Breathe out…";
  };
  paint();
  dlg._paint = paint;

  const btns = el("div", "focus-timer-btns");
  if (!breath.done) {
    const pause = el("button", "g-btn", breath.paused ? "▶ Keep resting" : "⏸ Pause");
    pause.addEventListener("click", () => {
      if (breath.paused) { breath.endAt = Date.now() + breath.left * 1000; breath.paused = false; if (breathPrefs().screen) holdWake(); }
      else { breath.left = Math.max(0, (breath.endAt - Date.now()) / 1000); breath.paused = true; }
      renderBreather();
    });
    const more = el("button", "g-btn", "+5 min");
    more.addEventListener("click", () => { breath.total += 300; if (breath.paused) breath.left += 300; else breath.endAt += 300000; renderBreather(); });
    btns.append(pause, more);
  }
  const ready = el("button", "g-btn primary", breath.done ? "✨ Recharged" : "I'm ready");
  ready.addEventListener("click", () => dlg.close());
  btns.appendChild(ready);
  dlg.appendChild(btns);
  if (breath.done) dlg.appendChild(el("div", "focus-timeup", "Break's done. Take your time coming back 🌟"));

  const opts = el("div", "breath-opts");
  const p = breathPrefs();
  const toggle = (key, label, onOn) => {
    const l = el("label", "check");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!p[key];
    cb.addEventListener("change", async () => {
      setBreathPref(key, cb.checked);
      if (cb.checked && onOn) await onOn(cb);
      if (!cb.checked && key === "screen") releaseWake();
    });
    l.append(cb, " " + label);
    opts.appendChild(l);
  };
  toggle("screen", "🔆 Keep screen on", () => holdWake());
  toggle("notice", "🔔 Notice on the lock screen", async cb => {
    if (!("Notification" in window)) { showToast("This browser can't show notices."); cb.checked = false; setBreathPref("notice", false); return; }
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (perm !== "granted") { showToast("Notices are off for the planner in your phone's settings."); cb.checked = false; setBreathPref("notice", false); return; }
    breathNotice(false);
  });
  toggle("tone", "🎐 Finish tone", () => playBowl());
  dlg.appendChild(opts);
}

setInterval(() => {
  const dlg = $("breather-dialog");
  if (!dlg || !dlg.open || !breath || breath.paused || breath.done) return;
  if (Date.now() >= breath.endAt) finishBreath();
  else if (dlg._paint) dlg._paint();
}, 250);

// The brain break (after a brain-heavy job, or from Focus) uses this timer now.
startBrainBreak = () => openBreather("brain", BRAIN_BREAK_MIN);

// ---------- 💼 After work: an offer to breathe ----------
function checkAfterWork() {
  try {
    const tk = todayKey(), shift = workHoursFor(tk);
    if (!shift || document.querySelector(".breath-offer") || $("breather-dialog")?.open) return;
    if (localStorage.getItem("arpPlanner.breathOffered") === tk) return;
    const n = nowLocal(), now = n.getHours() * 60 + n.getMinutes();
    const end = toMin(shift.start) + shiftMinutes(shift);
    if (now < end || now > end + 90) return;
    localStorage.setItem("arpPlanner.breathOffered", tk);
    const box = el("div", "breath-offer");
    box.append(el("div", "breath-offer-text", "💼 Work's done for today. Permission to breathe: 10 calm minutes, just for you? 💛"));
    const go = el("button", "g-btn primary", "🫁 Breathe");
    go.addEventListener("click", () => { box.remove(); openBreather("work", 10); });
    const later = el("button", "link-btn", "Not now");
    later.addEventListener("click", () => box.remove());
    const row = el("div", "breath-offer-btns");
    row.append(go, later);
    box.appendChild(row);
    document.body.appendChild(box);
  } catch {}
}
setInterval(checkAfterWork, 60 * 1000);
setTimeout(checkAfterWork, 5000);
