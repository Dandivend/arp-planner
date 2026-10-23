// 💼 Work helper: in the military, a medical appointment on base (and plenty else) can happen during
// work hours. This tab finds the unassigned time inside her shift on a day (work hours minus whatever
// is already booked in them), lists the day's other things she could move into those gaps (one tap
// puts it there), and lets her add something straight into a gap.
// Anything with a time inside her work hours doesn't use up her free time (see plannedMinutes).

let workDay = null;                          // the day shown (starts on today, or her next workday)
const WH_MIN_GAP = 10;                       // gaps shorter than this aren't worth showing
const whLen = t => minutesLeft(t) ?? t.minutes ?? (kindOf(t) === "event" ? 60 : kindOf(t) === "chore" ? 15 : 30);
const hhmm = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 1440) + 1440) % 1440 % 60)}`;

// Her shift on a day as [start, end] minutes (end can pass midnight), what's booked inside it, and the gaps.
function workGaps(day) {
  const shift = workHoursFor(day);
  if (!shift) return null;
  const a = toMin(shift.start), b = a + shiftMinutes(shift);
  const busy = tasks.filter(t => !t.deleted && !t.done && t.date === day && t.time && !isWorkShift(t) && !isDayNote(t))
    .map(t => { let s = toMin(t.time); if (s < a && s + 1440 < b) s += 1440; return { t, s, e: s + whLen(t) }; })
    .filter(x => x.e > a && x.s < b)
    .sort((x, y) => x.s - y.s);
  let from = a;
  if (day === todayKey()) { const n = nowLocal(); from = Math.max(a, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 5) * 5); }
  const gaps = [];
  let cur = from;
  for (const x of busy) {
    if (x.s > cur && x.s - cur >= WH_MIN_GAP) gaps.push([cur, Math.min(x.s, b)]);
    cur = Math.max(cur, x.e);
  }
  if (b - cur >= WH_MIN_GAP) gaps.push([cur, b]);
  return { shift, a, b, busy, gaps, free: gaps.reduce((s, [x, y]) => s + (y - x), 0) };
}
const nextWorkday = (from, dir = 1) => { for (let i = 1; i <= 21; i++) { const d = addDays(from, i * dir); if (workHoursFor(d)) return d; } return null; };

function renderWorkHelper() {
  const box = $("work-body");
  if (!box) return;
  if (!workDay) { const tk = todayKey(); workDay = workHoursFor(tk) ? tk : (nextWorkday(tk) || tk); }
  const day = workDay, tk = todayKey();
  const dt = fromKey(day);
  $("work-title").textContent = `💼 ${day === tk ? "Today" : day === addDays(tk, 1) ? "Tomorrow" : dt.toLocaleDateString(undefined, { weekday: "long" })} · ` +
    dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  box.innerHTML = "";
  const w = workGaps(day);
  if (!w) {
    const card = el("div", "home-card wh-card");
    card.append(el("p", "", vacationOn(day) ? "🏖️ A vacation day: no work hours to fit things into." : "🌴 No work on this day, so there are no work hours to fit things into."));
    const nx = nextWorkday(day);
    if (nx) { const b = el("button", "g-btn primary", "Next workday ›"); b.addEventListener("click", () => { workDay = nx; renderWorkHelper(); }); card.appendChild(b); }
    box.appendChild(card);
    return;
  }

  // ---- the shift at a glance: a bar with what's booked and what's free ----
  const head = el("div", "home-card wh-card");
  head.appendChild(el("div", "wh-shift", `💼 Work ${shiftLabel(w.shift)} · ${formatMinutes(w.b - w.a)}`));
  head.appendChild(el("div", "wh-free" + (w.free ? "" : " none"), w.free
    ? `🟢 ${formatMinutes(w.free)} unassigned during work${day === tk ? " (from now on)" : ""}`
    : "No unassigned time left during work on this day."));
  const bar = el("div", "wh-bar");
  const pct = m => `${((m - w.a) / (w.b - w.a)) * 100}%`;
  for (const [x, y] of w.gaps) { const g = el("span", "wh-gap"); g.style.left = pct(x); g.style.width = `calc(${pct(y)} - ${pct(x)})`; g.title = `Free ${formatTime(hhmm(x))}–${formatTime(hhmm(y))}`; bar.appendChild(g); }
  for (const x of w.busy) { const s = Math.max(x.s, w.a), e = Math.min(x.e, w.b); const g = el("span", "wh-busy"); g.style.left = pct(s); g.style.width = `calc(${pct(e)} - ${pct(s)})`; g.title = x.t.title; bar.appendChild(g); }
  head.appendChild(bar);
  const ends = el("div", "wh-ends");
  ends.append(el("span", "", formatTime(hhmm(w.a))), el("span", "", formatTime(hhmm(w.b))));
  head.appendChild(ends);
  if (w.gaps.length) {
    const ul = el("ul", "wh-gaps");
    for (const [x, y] of w.gaps) ul.appendChild(el("li", "", `🟢 ${formatTime(hhmm(x))} – ${formatTime(hhmm(y))} · ${formatMinutes(y - x)} free`));
    head.appendChild(ul);
  }
  box.appendChild(head);

  // ---- already during work ----
  if (w.busy.length) {
    const c = el("div", "home-card wh-card");
    c.appendChild(el("h3", "", "📅 Already during work"));
    for (const x of w.busy) {
      const r = el("button", "wh-item");
      r.type = "button";
      r.append(el("span", "wh-time", formatTime(hhmm(x.s))), el("span", "", `${emojiOf(x.t) || ""} ${x.t.title}`), el("span", "wh-len", formatMinutes(x.e - x.s)));
      r.addEventListener("click", () => openDialog(x.t));
      c.appendChild(r);
    }
    box.appendChild(c);
  }

  // ---- things on this day that could move into work hours ----
  const movable = tasksFor(day).filter(t => !t.done && !isWorkShift(t) && !isJoy(t) && !(t.time && w.busy.some(x => x.t === t)));
  const mv = el("div", "home-card wh-card");
  mv.appendChild(el("h3", "", "🔀 Could move into work hours"));
  mv.appendChild(el("p", "hint-small", "Tap a time to move it there. Appointments on base, admin, errands… anything work will let you step out for."));
  if (!movable.length) mv.appendChild(el("p", "hint-small", "Nothing else on this day to move. ✨"));
  for (const t of movable) {
    const len = whLen(t);
    const row = el("div", "wh-move");
    row.appendChild(el("div", "wh-move-title", `${emojiOf(t) || ""} ${t.title}` + (t.time ? ` · now ${formatTime(t.time)}` : "") + ` · ${formatMinutes(len)}`));
    const fits = w.gaps.filter(([x, y]) => y - x >= len).slice(0, 4);
    const opts = el("div", "wh-opts");
    if (!fits.length) opts.appendChild(el("span", "hint-small", w.gaps.length ? "No gap long enough today." : "No free time left during work."));
    for (const [x] of fits) {
      const b = el("button", "chip-btn", `→ ${formatTime(hhmm(x))}`);
      b.addEventListener("click", async () => {
        const before = { ...t };
        await persist({ ...t, time: hhmm(x), minutes: t.minutes || len }, false);
        showToast(`💼 "${t.title}" moved into work hours at ${formatTime(hhmm(x))}.`, "Undo", () => persist(before));
        render();
      });
      opts.appendChild(b);
    }
    row.appendChild(opts);
    mv.appendChild(row);
  }
  box.appendChild(mv);

  // ---- add something straight into work hours ----
  const add = el("form", "home-card wh-card wh-add");
  add.appendChild(el("h3", "", "➕ Add something during work"));
  const title = el("input");
  title.placeholder = "e.g. Medical appointment on base";
  title.maxLength = 120;
  const kind = el("select");
  for (const [v, l] of [["event", "🩺 Appointment"], ["task", "✏️ Task"], ["chore", "🧹 Chore"]]) kind.add(new Option(l, v));
  const len = el("select");
  for (const m of [15, 30, 45, 60, 90, 120, 180]) len.add(new Option(formatMinutes(m), m, false, m === 60));
  const when = el("select");
  const fillTimes = () => {
    const need = Number(len.value), keep = when.value;
    when.innerHTML = "";
    for (const [x, y] of w.gaps) for (let m = x; m + need <= y; m += 15) when.add(new Option(formatTime(hhmm(m)), hhmm(m)));
    if (!when.options.length) when.add(new Option("No gap that long", ""));
    if ([...when.options].some(o => o.value === keep)) when.value = keep;
  };
  len.addEventListener("change", fillTimes);
  fillTimes();
  const row = el("div", "wh-add-row");
  const lab = (text, input) => { const l = el("label", "wh-field"); l.append(el("span", "together-label", text), input); return l; };
  row.append(lab("Kind", kind), lab("How long", len), lab("When", when));
  const go = el("button", "g-btn primary", "💼 Add to work hours");
  go.type = "submit";
  add.append(title, row, go);
  add.addEventListener("submit", async e => {
    e.preventDefault();
    if (!title.value.trim()) { title.focus(); return; }
    if (!when.value) { showToast("No free gap that long during work. Try a shorter length."); return; }
    const k = kind.value;
    await persist({
      id: newId(), date: day, time: when.value, title: title.value.trim(), notes: "", done: false, doneDate: null, kind: k,
      priority: "normal", dueDate: null, minutes: Number(len.value), area: null, effort: "light", brain: k === "event" ? "light" : null,
      workout: null, createdAt: new Date().toISOString(), deleted: false, external: {},
    }, false);
    showToast(`💼 "${title.value.trim()}" is in your work hours at ${formatTime(when.value)}.`);
    render();
  });
  box.appendChild(add);
}

$("work-prev").addEventListener("click", () => { workDay = addDays(workDay || todayKey(), -1); renderWorkHelper(); });
$("work-next").addEventListener("click", () => { workDay = addDays(workDay || todayKey(), 1); renderWorkHelper(); });
$("work-today").addEventListener("click", () => { workDay = null; renderWorkHelper(); });
$("tab-work").addEventListener("click", () => { workDay = null; showView("work"); });
