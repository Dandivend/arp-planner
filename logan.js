// 💙 Logan tab: what Logan's up to, from his Google Calendar, read-only. He shares his calendar
// with her Google account; the planner reads it with her own Google sign-in (on her phone or the
// PC), so it works without his PC. Which calendar is his: profile.loganCalendar (picked once here,
// or found by name). Times are shown on her clock.

let loganCursor = null;                 // first day of the month shown
let loganSelected = null;               // the day she tapped
const loganCache = {};                  // "YYYY-MM" -> { at, events } (or { loading })
let loganCals = null;                   // her calendars (to find / pick his)

// Times here are always on HER clock (Seattle), even when Logan opens it on his PC in Tokyo.
const herZone = () => (profile && profile.timeZone) || "America/Los_Angeles";
const LOGAN_AWAKE = { start: "07:00", end: "23:00", zone: "Asia/Tokyo" };
const loganAwake = () => ({ ...LOGAN_AWAKE, ...((profile && profile.loganAwake) || {}) });
function zLocal(when, zone = herZone()) {
  const p = SyncTZ.parts(typeof when === "number" ? when : Date.parse(when), zone);
  return { day: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
// The moment that is <minutes> after midnight of <day> in <zone>.
function msAt(day, minutes, zone) {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d) + minutes * 60000;
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - SyncTZ.offsetAt(t, zone) * 60000;
  return t;
}
const herToday = () => zLocal(Date.now()).day;

const lgPost = (route, body) => fetch("/api/google/" + route, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
}).then(async r => { const res = await r.json().catch(() => ({})); if (!r.ok) throw new Error(res.error || "That didn't work."); return res; });

// An event's day and time range on her clock (all-day events: every day they cover).
function loganDays(ev) {
  if (ev.allDay) {
    const days = [];
    for (let d = ev.start; d < (ev.end || addDays(ev.start, 1)); d = addDays(d, 1)) days.push(d);
    return days.length ? days : [ev.start];
  }
  const s = zLocal(ev.start), e = zLocal(ev.end || ev.start);
  const days = [];
  for (let d = s.day; d <= e.day; d = addDays(d, 1)) { if (d === e.day && e.time === "00:00" && d !== s.day) break; days.push(d); }
  return days;
}
function loganWhen(ev, day) {
  if (ev.allDay) return "All day";
  const s = zLocal(ev.start), e = zLocal(ev.end || ev.start);
  const from = s.day === day ? formatTime(s.time) : "…", to = e.day === day ? formatTime(e.time) : "…";
  return `${from} – ${to}`;
}

// "(his time 09:00 – 18:00)": the clock the event was made on, when it differs from hers.
function loganOwnTime(ev) {
  if (ev.allDay || !/T\d\d:\d\d/.test(ev.start)) return "";
  const own = t => (t || "").slice(11, 16);
  const s = zLocal(ev.start);
  if (s.time === own(ev.start)) return "";
  return `  ·  his time ${formatTime(own(ev.start))} – ${formatTime(own(ev.end))}`;
}

async function loganCalendarId() {
  if (profile.loganCalendar) return profile.loganCalendar;
  if (!loganCals) loganCals = (await lgPost("calendars")).calendars || [];
  const guess = loganCals.find(c => !c.primary && !c.isPlanner && /logan/i.test(`${c.name} ${c.id}`));
  return guess ? guess.id : null;
}

async function loadLoganMonth(key) {
  const c = loganCache[key];
  if (c && (c.loading || Date.now() - c.at < 5 * 60 * 1000)) return;
  loganCache[key] = { ...(c || {}), loading: true };
  try {
    const cal = await loganCalendarId();
    if (!cal) { loganCache[key] = { at: 0, events: [], noCal: true }; return; }
    const first = fromKey(key + "-01");
    const timeMin = new Date(first.getFullYear(), first.getMonth(), -6).toISOString();
    const timeMax = new Date(first.getFullYear(), first.getMonth() + 1, 8).toISOString();
    const res = await lgPost("theirs", { calendarId: cal, timeMin, timeMax });
    loganCache[key] = { at: Date.now(), events: res.events || [] };
  } catch (e) {
    loganCache[key] = { at: 0, events: (c && c.events) || [], error: e.message };
  }
  if (view === "logan") renderLogan();
}

function renderLogan() {
  const tk = herToday();
  if (!loganCursor) { loganCursor = fromKey(tk); loganCursor.setDate(1); }
  if (!loganSelected) loganSelected = tk;
  const y = loganCursor.getFullYear(), m = loganCursor.getMonth();
  const key = `${y}-${pad(m + 1)}`;
  $("logan-title").textContent = "💙 Logan · " + loganCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const box = $("logan-body");
  box.innerHTML = "";

  const g = typeof gStatus !== "undefined" ? gStatus : null;
  if (g && !g.connected) {
    box.appendChild(el("p", "hint", "Connect Google first (⚙️ Settings → Google Calendar), then Logan's calendar shows up here."));
    return;
  }
  const data = loganCache[key];
  if (!data || (!data.at && !data.noCal && !data.error)) loadLoganMonth(key);
  if (!data || data.loading && !data.events) { box.appendChild(el("p", "hint", "Loading Logan's calendar…")); return; }
  if (data.noCal) return loganSetup(box);
  if (data.error) box.appendChild(el("p", "g-error", "⚠️ Couldn't load Logan's calendar: " + data.error));
  const st = loganStatus();
  if (st) box.appendChild(el("p", "logan-now-line", `${LOGAN_STATUS[st][0]} ${LOGAN_STATUS[st][1]}${st === "work" || st === "busy" ? loganWhy : ""}`));

  // Events by day.
  const byDay = {};
  for (const ev of data.events || []) for (const d of loganDays(ev)) (byDay[d] = byDay[d] || []).push(ev);
  for (const list of Object.values(byDay)) list.sort((a, b) => (b.allDay - a.allDay) || String(a.start).localeCompare(String(b.start)));

  const grid = el("div", "month-grid");
  const base = new Date(2024, 0, 7);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    grid.appendChild(el("div", "dow", d.toLocaleDateString(undefined, { weekday: "short" })));
  }
  const start = new Date(y, m, 1);
  start.setDate(1 - start.getDay());
  const weeks = Math.ceil((new Date(y, m, 1).getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const day = toKey(d);
    const cell = el("button", "cell logan-cell" + (d.getMonth() !== m ? " other" : "") + (day === tk ? " today" : "") + (day === loganSelected ? " sel" : ""));
    cell.appendChild(el("span", "num", String(d.getDate())));
    const evs = byDay[day] || [];
    for (const ev of evs.slice(0, 2)) cell.appendChild(el("span", "lg-ev", ev.title));
    if (evs.length > 2) cell.appendChild(el("span", "lg-more", `+${evs.length - 2} more`));
    cell.addEventListener("click", () => { loganSelected = day; renderLogan(); });
    grid.appendChild(cell);
  }
  box.appendChild(grid);

  // The day she tapped.
  const sel = el("div", "logan-day");
  const when = loganSelected === tk ? "Today" : loganSelected === addDays(tk, 1) ? "Tomorrow" : "";
  sel.appendChild(el("h3", "", `💙 ${when ? when + " · " : ""}${fromKey(loganSelected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`));
  const evs = byDay[loganSelected] || [];
  if (!evs.length) sel.appendChild(el("p", "hint-small", "Nothing on Logan's calendar this day."));
  for (const ev of evs) {
    const item = el("div", "lg-item");
    item.append(el("div", "lg-time", loganWhen(ev, loganSelected) + loganOwnTime(ev)), el("div", "lg-what", ev.title));
    if (ev.location) item.appendChild(el("div", "lg-where", "📍 " + ev.location));
    if (ev.notes) item.appendChild(el("div", "lg-notes", ev.notes.replace(/<[^>]+>/g, " ")));
    sel.appendChild(item);
  }
  sel.appendChild(el("p", "hint-small", "Times are on Ariel's Seattle clock (Logan's own time beside them). His calendar can't be changed from here."));
  box.appendChild(sel);

  box.appendChild(loganAwakeRow());
  const change = el("button", "link-btn", "Pick a different calendar for Logan");
  change.addEventListener("click", () => { box.innerHTML = ""; loganSetup(box, true); });
  box.appendChild(change);
}

// Not found yet: how Logan shares it, and a list to pick from.
async function loganSetup(box, picking) {
  if (!picking) {
    box.appendChild(el("p", "g-lead", "Logan's calendar isn't shared with your Google account yet."));
    const ol = el("ol", "g-steps");
    for (const s of ["Logan: open calendar.google.com on a computer.", "Next to your calendar on the left: ⋮ → Settings and sharing.",
      "Share with specific people → Add Ariel's Gmail → \"See all event details\" → Send.",
      "Ariel: open the email and tap \"Add this calendar\". Then come back here."]) ol.appendChild(el("li", "", s));
    box.appendChild(ol);
  }
  try { loganCals = (await lgPost("calendars")).calendars || []; } catch (e) { box.appendChild(el("p", "g-error", "⚠️ " + e.message)); return; }
  const others = loganCals.filter(c => !c.primary && !c.isPlanner);
  if (!others.length) {
    const again = el("button", "g-btn", "🔄 Check again");
    again.addEventListener("click", () => { for (const k in loganCache) delete loganCache[k]; loganCals = null; renderLogan(); });
    box.appendChild(again);
    return;
  }
  box.appendChild(el("div", "g-sub", "Which of these is Logan's?"));
  for (const c of others) {
    const b = el("button", "season-swatch" + (profile.loganCalendar === c.id ? " on" : ""), c.name);
    b.style.setProperty("--sw", c.color || "#5ab0ff");
    b.prepend(el("span", "dot"));
    b.addEventListener("click", async () => {
      try { profile = await Store.putProfile({ loganCalendar: c.id }); } catch {}
      for (const k in loganCache) delete loganCache[k];
      renderLogan();
    });
    box.appendChild(b);
  }
}

$("tab-logan").addEventListener("click", () => {
  // Free right now? A little surprise for her (not on Logan's own PC).
  if (loganStatus() === "free" && !ON_PC) showMissYou();
  showView("logan");
});
$("logan-prev").addEventListener("click", () => { loganCursor.setMonth(loganCursor.getMonth() - 1); renderLogan(); });
$("logan-next").addEventListener("click", () => { loganCursor.setMonth(loganCursor.getMonth() + 1); renderLogan(); });
$("logan-today").addEventListener("click", () => { loganCursor = null; loganSelected = null; renderLogan(); });

// Logan's sleep, in his own (Tokyo) time, shown translated to her Seattle clock. Free time
// together uses it: he's "awake" from his wake-up time to his bedtime. (Settings → 💙 Logan's sleep.)
function loganAwakeRow() {
  const la = loganAwake();
  const box = el("div", "logan-awake");
  const row = el("div", "fit-row");
  const mk = val => { const i = el("input"); i.type = "time"; i.value = val; return i; };
  const bed = mk(la.end), wake = mk(la.start);
  row.append(el("span", "fit-label", "🌙 Logan goes to bed"), bed, el("span", "fit-label", "☀️ and wakes up"), wake,
    el("span", "hint-small", "(Tokyo time)"));
  box.appendChild(row);
  const tr = el("p", "hint-small logan-sleep-seattle");
  const showSeattle = () => {
    const today = zLocal(Date.now(), la.zone).day;
    const b = zLocal(msAt(today, toMin(bed.value || la.end), la.zone)), w = zLocal(msAt(today, toMin(wake.value || la.start), la.zone));
    tr.textContent = `In Seattle time that's asleep from ${formatTime(b.time)} to ${formatTime(w.time)} (it shifts by an hour when the clocks change).`;
  };
  showSeattle();
  box.appendChild(tr);
  const save = async () => {
    try { profile = await Store.putProfile({ loganAwake: { ...la, start: wake.value || la.start, end: bed.value || la.end } }); } catch {}
    togetherCache = null;
    showSeattle();
    showToast("💙 Saved. Free time together now uses Logan's sleep hours.");
  };
  bed.addEventListener("change", save);
  wake.addEventListener("change", save);
  return box;
}
function renderLoganSettings() {
  const box = $("logan-settings");
  if (!box) return;
  box.innerHTML = "";
  box.appendChild(el("p", "hint-small", "Logan: put in your usual sleep hours on your own clock. Ariel's app translates them to her time, so \"Free time together\" only shows times you're both awake."));
  box.appendChild(loganAwakeRow());
}

// ---------- 💙 Free time together (Home) ----------
// Her free time (awake, minus work and anything timed on her list) overlapped with his
// (awake, minus everything on his calendar), over the next week. Slots of 30 minutes or more.
let togetherCache = null;                 // { at, slots }
function subtractBusy(free, busy) {
  let out = free.map(x => [...x]);
  for (const [bs, be] of busy) {
    const next = [];
    for (const [s, e] of out) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    out = next;
  }
  return out;
}
async function freeTogether(days = 7) {
  if (togetherCache && Date.now() - togetherCache.at < 10 * 60 * 1000) return togetherCache.slots;
  const cal = await loganCalendarId();
  if (!cal) return null;
  const zone = herZone(), now = Date.now(), la = loganAwake();
  const res = await lgPost("theirs", { calendarId: cal, timeMin: new Date(now - 864e5).toISOString(), timeMax: new Date(now + (days + 1) * 864e5).toISOString() });
  const hisBusy = (res.events || []).filter(e => !e.allDay).map(e => [Date.parse(e.start), Date.parse(e.end)]);
  const hisFree = [];
  const hisFirst = zLocal(now - 864e5, la.zone).day;
  for (let i = 0; i < days + 2; i++) {
    const d = addDays(hisFirst, i);
    let s = toMin(la.start), e = toMin(la.end);
    if (e <= s) e += 1440;
    hisFree.push([msAt(d, s, la.zone), msAt(d, e, la.zone)]);
  }
  const herFree = [], herBusy = [];
  const first = zLocal(now).day;
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i), w = awakeWindow(d);
    herFree.push([msAt(d, w.start, zone), msAt(d, w.end, zone)]);
    const shift = workHoursFor(d);
    if (shift) herBusy.push([msAt(d, toMin(shift.start), zone), msAt(d, toMin(shift.start) + shiftMinutes(shift), zone)]);
    for (const t of tasks) {
      if (t.deleted || t.done || t.date !== d || !t.time || isLogan(t)) continue;      // time with Logan isn't "busy"
      herBusy.push([msAt(d, toMin(t.time), zone), msAt(d, toMin(t.time) + (t.minutes || 30), zone)]);
    }
  }
  const mine = subtractBusy(herFree, herBusy), his = subtractBusy(hisFree, hisBusy);
  const slots = [];
  for (const [a, b] of mine) for (const [c, d] of his) {
    const s = Math.max(a, c, now), e = Math.min(b, d);
    if (e - s >= 30 * 60000) slots.push([s, e]);
  }
  slots.sort((x, y) => x[0] - y[0]);
  togetherCache = { at: Date.now(), slots };
  return slots;
}

async function renderTogether() {
  const card = $("home-together"), box = $("home-together-list");
  if (!card) return;
  let slots;
  try { slots = await freeTogether(); } catch { slots = null; }
  card.hidden = !slots;
  if (!slots) return;
  box.innerHTML = "";
  if (!slots.length) { box.appendChild(el("p", "hint-small", "No free time in common this week yet. 💙")); return; }
  const tk = herToday(), la = loganAwake();
  for (const [s, e] of slots.slice(0, 6)) {
    const a = zLocal(s), b = zLocal(e), ha = zLocal(s, la.zone), hb = zLocal(e, la.zone);
    const dayName = a.day === tk ? "Today" : a.day === addDays(tk, 1) ? "Tomorrow" : fromKey(a.day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const mins = Math.round((e - s) / 60000);
    const row = el("div", "together-row");
    row.append(el("b", "", `${dayName} · ${formatTime(a.time)} – ${formatTime(b.time)}`),
      el("span", "together-len", ` (${formatMinutes(mins)})`),
      el("div", "hint-small", `Logan's time: ${fromKey(ha.day).toLocaleDateString(undefined, { weekday: "short" })} ${formatTime(ha.time)} – ${formatTime(hb.time)}`));
    const add = el("button", "move-btn", "💙 Plan time together");
    add.addEventListener("click", async () => {
      await persist({ id: newId(), date: a.day, time: a.time, title: "Time with Logan", notes: "", done: false, doneDate: null, kind: "joy",
        priority: "normal", dueDate: null, minutes: Math.min(120, mins), area: null, effort: "light", brain: "light",
        workout: null, createdAt: new Date().toISOString(), deleted: false, external: {} }, false);
      togetherCache = null;
      showToast(`💙 "Time with Logan" is on ${dayName === "Today" ? "today" : dayName} at ${formatTime(a.time)}.`);
      render();
    });
    row.appendChild(add);
    box.appendChild(row);
  }
}

// ---------- What Logan's doing right now (shown on the tab) ----------
// 💤 in his sleep hours, 💼 in a work event, 📅 in any other event, 💗 free.
let loganNow = { at: 0, events: [] };
async function refreshLoganNow() {
  try {
    const cal = await loganCalendarId();
    if (!cal) return;
    const now = Date.now();
    const res = await lgPost("theirs", { calendarId: cal, timeMin: new Date(now - 864e5).toISOString(), timeMax: new Date(now + 864e5).toISOString() });
    loganNow = { at: now, events: (res.events || []).filter(e => !e.allDay) };
  } catch {}
  updateLoganTab();
}
// "Working" comes straight from an event on his Google Calendar happening right now (its times carry
// their own time zone, so neither phone's time zone setting changes it). The tab's tooltip names
// the event, so a wrongly-timed one is easy to spot.
let loganWhy = "";
function loganStatus() {
  loganWhy = "";
  if (!loganNow.at) return null;
  const la = loganAwake(), now = Date.now();
  const cur = loganNow.events.filter(e => Date.parse(e.start) <= now && now < Date.parse(e.end));
  const until = e => new Date(e.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const job = cur.find(e => /\b(work|shift|duty|office)\b/i.test(e.title));
  if (job) { loganWhy = ` · "${job.title}" on his calendar until ${until(job)} your time`; return "work"; }
  if (cur.length) loganWhy = ` · "${cur[0].title}" until ${until(cur[0])} your time`;
  const m = toMin(zLocal(now, la.zone).time), bed = toMin(la.end), wake = toMin(la.start);
  const asleep = bed < wake ? m >= bed && m < wake : m >= bed || m < wake;
  if (asleep) return "sleep";
  return cur.length ? "busy" : "free";
}
const LOGAN_STATUS = { sleep: ["💤", "Logan's asleep"], work: ["💼", "Logan's working"], busy: ["📅", "Logan's busy"], free: ["💗", "Logan's free right now"] };
function updateLoganTab() {
  const tab = $("tab-logan");
  const st = loganStatus(), [icon, words] = LOGAN_STATUS[st] || ["", "What Logan's up to"];
  tab.textContent = icon ? `Logan ${icon}` : "Logan";
  tab.title = words + (st === "work" || st === "busy" ? loganWhy : "");
  tab.dataset.status = st || "";
}
setTimeout(refreshLoganNow, 4000);
setInterval(refreshLoganNow, 10 * 60 * 1000);
setInterval(updateLoganTab, 60 * 1000);

function showMissYou() {
  document.querySelector(".miss-you")?.remove();
  const o = el("div", "miss-you");
  o.appendChild(el("div", "miss-text", "I MISS YOU ARP!!!"));
  o.appendChild(el("div", "miss-sub", "💙 from Logan"));
  if (!calmMode()) for (let i = 0; i < 26; i++) {
    const h = el("span", "miss-heart", ["💗", "💖", "💙", "❤️", "💕"][i % 5]);
    h.style.left = `${Math.random() * 100}vw`;
    h.style.fontSize = `${18 + Math.random() * 26}px`;
    h.style.animationDelay = `${Math.random() * 1.2}s`;
    h.style.animationDuration = `${2.4 + Math.random() * 1.6}s`;
    o.appendChild(h);
  }
  o.addEventListener("click", () => o.remove());
  document.body.appendChild(o);
  if (typeof buzz === "function") buzz([30, 60, 30, 60, 120]);
  setTimeout(() => o.remove(), 4500);
}


// ---------- 💙 "Add Free Time Together" ----------
// A little form for putting time with Logan on her day: what, which day, what time (or any time)
// and how long. It shows the times you're both free (when his calendar is connected) as one-tap
// picks, and what time it'll be for him in Tokyo. It's a joy task, so it calms the chaos meter too.
async function openAddTogether() {
  let dlg = $("together-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "together-dialog";
    dlg.className = "pick-day-dialog together-dialog";
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = "";
  const tk = herToday(), la = loganAwake();
  let day = tk, time = "", minutes = 60;

  dlg.appendChild(el("h3", "pick-day-title", "💙 Add free time together"));
  const what = el("input", "together-what");
  what.value = "Time with Logan";
  what.maxLength = 80;
  what.setAttribute("aria-label", "What you'll do together");
  dlg.append(el("label", "together-label", "What"), what);

  // ✨ Times you're both free (from his calendar), as quick picks.
  const sugg = el("div", "together-sugg");
  dlg.appendChild(sugg);

  dlg.appendChild(el("label", "together-label", "Day"));
  const grid = el("div", "pick-day-grid");
  const dayBtns = [];
  for (let i = 0; i <= 6; i++) {
    const d = addDays(tk, i), dt = fromKey(d);
    const b = el("button", "pick-day-btn");
    b.type = "button";
    b.append(el("b", "", i === 0 ? "Today" : i === 1 ? "Tomorrow" : dt.toLocaleDateString(undefined, { weekday: "short" })),
      el("span", "", dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })));
    b.addEventListener("click", () => { day = d; paint(); });
    dayBtns.push([d, b]);
    grid.appendChild(b);
  }
  dlg.appendChild(grid);

  const row = el("div", "together-row2");
  const tIn = el("input");
  tIn.type = "time";
  tIn.setAttribute("aria-label", "Time (leave empty for any time)");
  tIn.addEventListener("input", () => { time = tIn.value; paint(); });
  const len = el("select");
  for (const m of [15, 30, 45, 60, 90, 120, 180, 240]) len.add(new Option(formatMinutes(m), m, false, m === minutes));
  len.addEventListener("change", () => { minutes = Number(len.value); });
  const tWrap = el("label", "together-field"), lWrap = el("label", "together-field");
  tWrap.append(el("span", "together-label", "Time (optional)"), tIn);
  lWrap.append(el("span", "together-label", "How long"), len);
  row.append(tWrap, lWrap);
  dlg.appendChild(row);
  const hisTime = el("p", "hint-small together-his");
  dlg.appendChild(hisTime);

  const btns = el("div", "pick-day-later");
  const add = el("button", "g-btn primary", "💙 Add to her day");
  add.type = "button";
  const cancel = el("button", "link-btn", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => dlg.close());
  btns.append(add, cancel);
  dlg.appendChild(btns);

  function paint() {
    for (const [d, b] of dayBtns) b.classList.toggle("active", d === day);
    if (tIn.value !== time) tIn.value = time;
    if (time) {
      const his = zLocal(msAt(day, toMin(time), herZone()), la.zone);
      const hisDay = fromKey(his.day).toLocaleDateString(undefined, { weekday: "short" });
      const s = toMin(la.start), e = toMin(la.end), hm = toMin(his.time);
      const awake = e > s ? hm >= s && hm < e : hm >= s || hm < e;
      hisTime.textContent = `🗾 That's ${hisDay} ${formatTime(his.time)} for Logan` + (awake ? "." : " 💤 (he may be asleep then)");
    } else hisTime.textContent = "No time picked: it goes on the day as \"any time\".";
  }
  paint();

  add.addEventListener("click", async () => {
    let title = what.value.trim() || "Time with Logan";
    if (!/\blogan\b/i.test(title)) title += " with Logan";           // so it counts as time together
    dlg.close();
    await persist({ id: newId(), date: day, time: time || null, title, notes: "", done: false, doneDate: null, kind: "joy",
      priority: "normal", dueDate: null, minutes, area: null, effort: "light", brain: "light",
      workout: null, createdAt: new Date().toISOString(), deleted: false, external: {} }, false);
    togetherCache = null;
    const when = day === tk ? "today" : day === addDays(tk, 1) ? "tomorrow" : fromKey(day).toLocaleDateString(undefined, { weekday: "long" });
    showToast(`💙 "${title}" is on ${when}${time ? ` at ${formatTime(time)}` : ""}. Logan can't wait 🥰`);
    render();
  });

  dlg.showModal();
  // Fill in the shared free times once they've loaded (his calendar can take a moment).
  try {
    const slots = (await freeTogether()) || [];
    if (!dlg.open) return;
    const picks = slots.slice(0, 4);
    if (!picks.length) return;
    sugg.appendChild(el("span", "together-label", "✨ You're both free"));
    const wrap = el("div", "together-picks");
    for (const [s, e] of picks) {
      const a = zLocal(s), b = zLocal(e);
      const dn = a.day === tk ? "Today" : a.day === addDays(tk, 1) ? "Tomorrow" : fromKey(a.day).toLocaleDateString(undefined, { weekday: "short" });
      const p = el("button", "chip-btn", `${dn} ${formatTime(a.time)}–${formatTime(b.time)}`);
      p.type = "button";
      p.addEventListener("click", () => { day = a.day; time = a.time; minutes = Math.min(240, Math.max(15, Math.round((e - s) / 60000 / 15) * 15)); len.value = String([15, 30, 45, 60, 90, 120, 180, 240].reduce((x, y) => Math.abs(y - minutes) < Math.abs(x - minutes) ? y : x)); minutes = Number(len.value); paint(); });
      wrap.appendChild(p);
    }
    sugg.appendChild(wrap);
  } catch {}
}
$("logan-add-together").addEventListener("click", openAddTogether);
