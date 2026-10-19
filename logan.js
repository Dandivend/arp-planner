// 💙 Logan tab: what Logan's up to, from his Google Calendar, read-only. He shares his calendar
// with her Google account; the planner reads it with her own Google sign-in (on her phone or the
// PC), so it works without his PC. Which calendar is his: profile.loganCalendar (picked once here,
// or found by name). Times are shown on her clock.

let loganCursor = null;                 // first day of the month shown
let loganSelected = null;               // the day she tapped
const loganCache = {};                  // "YYYY-MM" -> { at, events } (or { loading })
let loganCals = null;                   // her calendars (to find / pick his)

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
  const s = SyncTZ.toLocal(ev.start), e = SyncTZ.toLocal(ev.end || ev.start);
  const days = [];
  for (let d = s.day; d <= e.day; d = addDays(d, 1)) { if (d === e.day && e.time === "00:00" && d !== s.day) break; days.push(d); }
  return days;
}
function loganWhen(ev, day) {
  if (ev.allDay) return "All day";
  const s = SyncTZ.toLocal(ev.start), e = SyncTZ.toLocal(ev.end || ev.start);
  const from = s.day === day ? formatTime(s.time) : "…", to = e.day === day ? formatTime(e.time) : "…";
  return `${from} – ${to}`;
}

// "(his time 09:00 – 18:00)": the clock the event was made on, when it differs from hers.
function loganOwnTime(ev) {
  if (ev.allDay || !/T\d\d:\d\d/.test(ev.start)) return "";
  const own = t => (t || "").slice(11, 16);
  const s = SyncTZ.toLocal(ev.start);
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
  const tk = todayKey();
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
  sel.appendChild(el("p", "hint-small", "Times are on your clock. Logan's calendar can't be changed from here."));
  box.appendChild(sel);

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

$("tab-logan").addEventListener("click", () => showView("logan"));
$("logan-prev").addEventListener("click", () => { loganCursor.setMonth(loganCursor.getMonth() - 1); renderLogan(); });
$("logan-next").addEventListener("click", () => { loganCursor.setMonth(loganCursor.getMonth() + 1); renderLogan(); });
$("logan-today").addEventListener("click", () => { loganCursor = null; loganSelected = null; renderLogan(); });
