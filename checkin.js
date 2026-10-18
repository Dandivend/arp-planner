// Check-in popup (opened from the pencil on the Day tab / Home): Feelings + Body.
// Period setup lives in Settings (renderCycleSettings), since it's set once, not daily.

let checkinTab = "feel";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function optionButtons(list, chosenId, onPick) {
  const box = el("div", "mood-options");
  for (const o of list) {
    const b = el("button", "mood-btn" + (o.id === chosenId ? " chosen" : ""));
    b.append(el("span", "mood-emoji", o.emoji), el("span", "mood-label", o.label));
    b.title = o.label;
    b.addEventListener("click", () => onPick(o.id));
    box.appendChild(b);
  }
  return box;
}

async function setCheckin(fields) {
  const day = currentDay;
  moods[day] = { ...moods[day], ...fields };
  render();
  try {
    moods[day] = await Store.putMood(day, fields);
  } catch {
    showError("Couldn't save that. Try closing and reopening the planner.");
  }
}

async function saveCycle() {
  render();
  try {
    cycle = await Store.putCycle(cycle);
  } catch {
    showError("Couldn't save your cycle info. Try closing and reopening the planner.");
  }
}

function openCheckin(day) {
  currentDay = day || currentDay;
  // Start on whichever part isn't filled in yet.
  const entry = moods[currentDay] || {};
  checkinTab = feelingOf(entry) && !bodyOf(entry) ? "body" : "feel";
  renderCheckin();
  $("checkin-dialog").showModal();
}

function renderCheckin() {
  const tk = todayKey();
  const entry = moods[currentDay] || {};
  const f = feelingOf(entry), b = bodyOf(entry);
  const isToday = currentDay === tk;
  $("checkin-day").textContent = fromKey(currentDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  $("ck-tab-feel").textContent = `${f ? f.emoji : "😊"} Feelings`;
  $("ck-tab-body").textContent = `${b ? b.emoji : "💪"} Body`;
  for (const t of ["feel", "body"]) $("ck-tab-" + t).classList.toggle("active", checkinTab === t);

  const pane = $("checkin-pane");
  pane.innerHTML = "";
  if (checkinTab === "feel") {
    pane.appendChild(el("div", "mood-question",
      f ? `${isToday ? "Today you're feeling" : "You felt"} ${f.label.toLowerCase()}.` :
      isToday ? "How are you feeling today?" : "How were you feeling this day?"));
    if (f) pane.appendChild(el("div", "checkin-reply", pickFor(f.lines, currentDay, f.id)));
    pane.appendChild(optionButtons(FEELINGS, f && f.id, id => {
      setCheckin({ mood: id });
      if (!bodyOf(moods[currentDay])) setTimeout(() => { checkinTab = "body"; renderCheckin(); }, 700);
    }));
  } else {
    pane.appendChild(el("div", "mood-question",
      b ? `Body check: ${b.label.toLowerCase()}.` :
      isToday ? "How's your body feeling today?" : "How was your body feeling this day?"));
    if (b) pane.appendChild(el("div", "checkin-reply", pickFor(b.lines, currentDay, b.id)));
    pane.appendChild(optionButtons(BODY, b && b.id, id => setCheckin({ body: id })));
  }
}

for (const t of ["feel", "body"]) {
  $("ck-tab-" + t).addEventListener("click", () => { checkinTab = t; renderCheckin(); });
}
$("checkin-done").addEventListener("click", () => $("checkin-dialog").close());
$("checkin-btn").addEventListener("click", () => openCheckin(currentDay));

// ---------- Settings: cycle setup ----------
function addPeriodStart(start) {
  // Replace any start date that belongs to this same period.
  cycle.starts = (cycle.starts || []).filter(s => Math.abs(daysBetween(s, start)) > 15).concat(start).sort();
  saveCycle();
}

function renderCycleSettings() {
  const box = $("cycle-settings");
  box.innerHTML = "";
  const tk = todayKey();
  const fmt = d => fromKey(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const c = cycleInfo(tk);

  if (c) {
    const ph = PHASES[c.phase];
    const head = el("div", "cycle-head");
    head.style.setProperty("--phase", ph.color);
    head.append(el("span", "cycle-dot"), el("span", "", `Today: cycle day ${c.cycleDay} · ${ph.label}${c.projected ? " (predicted)" : ""}`));
    box.appendChild(head);
    const next = addDays(c.start, cycle.length || 28);
    box.appendChild(el("div", "cycle-blurb", `Next period expected around ${fmt(next)}.`));
  } else {
    box.appendChild(el("div", "cycle-blurb",
      "Log when your period starts. The planner will show your cycle phase across the calendar, with tips for each phase, and plan around your energy."));
  }

  // On it now? Pick the day number and we work out the start date.
  const q = el("div", "cycle-q");
  q.appendChild(el("span", "cycle-q-text", "On your period now? Which day is it?"));
  const current = c && c.phase === "menstrual" && !c.projected ? c.cycleDay : null;
  for (let n = 1; n <= 8; n++) {
    const btn = el("button", "pill-btn day" + (current === n ? " chosen" : ""), String(n));
    btn.title = `Today is day ${n} of my period`;
    btn.addEventListener("click", () => addPeriodStart(addDays(tk, -(n - 1))));
    q.appendChild(btn);
  }
  box.appendChild(q);

  // Or log a start date directly (e.g. one she forgot to log).
  const row = el("div", "cycle-q");
  row.appendChild(el("span", "cycle-q-text", "Or log a start date:"));
  const date = el("input");
  date.type = "date";
  date.max = tk;
  const add = el("button", "pill-btn", "Add");
  add.addEventListener("click", () => { if (date.value) addPeriodStart(date.value); });
  row.append(date, add);
  box.appendChild(row);

  const starts = [...(cycle.starts || [])].sort().reverse();
  if (starts.length) {
    const hist = el("div", "cycle-history");
    hist.appendChild(el("span", "fit-label", "Logged starts:"));
    for (const s of starts.slice(0, 8)) {
      const chip = el("span", "start-chip", fmt(s));
      const x = el("button", "start-x", "✕");
      x.title = "Remove this date";
      x.addEventListener("click", () => { cycle.starts = cycle.starts.filter(d => d !== s); saveCycle(); });
      chip.appendChild(x);
      hist.appendChild(chip);
    }
    box.appendChild(hist);
  }

  const settings = el("div", "cycle-settings");
  const lenSel = el("select");
  for (let d = 21; d <= 40; d++) lenSel.add(new Option(d + " days", d));
  lenSel.value = String(cycle.length || 28);
  lenSel.addEventListener("change", () => { cycle.length = Number(lenSel.value); saveCycle(); });
  const perSel = el("select");
  for (let d = 2; d <= 9; d++) perSel.add(new Option(d + " days", d));
  perSel.value = String(cycle.periodLength || 5);
  perSel.addEventListener("change", () => { cycle.periodLength = Number(perSel.value); saveCycle(); });
  settings.append("My cycle is usually ", lenSel, " and my period lasts ", perSel, ".");
  box.appendChild(settings);
  box.appendChild(el("div", "disclaimer", "General wellness info, not medical advice. Predictions are estimates."));
}
