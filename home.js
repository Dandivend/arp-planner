// Home screen (the page the app opens on): greeting, check-in prompt, today at a
// glance, what's coming up, cycle and this week's plan. Fun facts sit on the side.

const HER_NAME = "Ariel";

function renderHome() {
  const tk = todayKey();
  const now = nowLocal();          // her clock (Settings → Time zone)
  const h = now.getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const icon = h < 12 ? "☀️" : h < 17 ? "🌤️" : "🌙";
  $("home-greeting").textContent = `${hello}, ${HER_NAME} ${icon}`;
  const hol = holidayOn(tk);
  $("home-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    (hol ? `  ·  ${holLabel(hol, "Happy ", "!")}` : "");

  // Check-in prompt: glows until she's checked in today.
  const entry = moods[tk] || {};
  const f = feelingOf(entry), b = bodyOf(entry);
  const ci = $("home-checkin");
  ci.classList.toggle("glow", !checkedIn(tk));
  ci.innerHTML = "";
  if (!f && !b) {
    ci.append(el("span", "hc-pencil", "✏️"), el("span", "hc-text", "How are you feeling today? Tap to check in."));
  } else {
    const what = [f && `feeling ${f.label.toLowerCase()}`, b && b.label.toLowerCase()].filter(Boolean).join(" · ");
    const line = f ? pickFor(f.lines, tk, f.id) : pickFor(b.lines, tk, b.id);
    const text = el("span", "hc-text");
    text.append(el("b", "", `${f ? f.emoji : ""}${b ? b.emoji : ""} Today: ${what}. `), document.createTextNode(line));
    ci.append(text, el("span", "hc-edit", "✏️ Change"));
  }

  // Today at a glance.
  const p = planDay(tk);
  $("home-summary").textContent = p.summary;
  const next = $("home-next");
  next.innerHTML = "";
  const nowStr = `${pad(h)}:${pad(now.getMinutes())}`;
  // ▶️ Right now: whatever she's in the middle of (it glows, and so does the card).
  const cur = p.list.filter(t => isHappeningNow(t, tk)).sort((a, b) => (isWorkShift(a) - isWorkShift(b)) || b.time.localeCompare(a.time));
  const card = next.closest(".home-card");
  if (card) card.classList.toggle("has-now", !!cur.length);
  if (cur.length) {
    const t = cur[0], end = addMinutesTo(t.time, isWorkShift(t) ? shiftMinutes(workHoursFor(tk)) || t.minutes || 480 : (minutesLeft(t) ?? t.minutes ?? 30));
    next.appendChild(el("div", "home-now", `▶️ Right now: ${emojiOf(t)} ${t.title} · until ${formatTime(end)}` +
      (cur.length > 1 ? ` (+ ${cur.slice(1).map(x => x.title).join(", ")})` : "")));
  }
  const up = p.list.find(t => !t.done && t.time && t.time >= nowStr && !cur.includes(t));
  if (up) next.appendChild(el("div", "home-up", `⏭ Up next: ${formatTime(up.time)} · ${emojiOf(up)} ${up.title}`));
  const ft = freeTimeLeft(tk, p.active);
  const over = ft.seconds < 0 && p.planned > 0 && !ft.past;
  next.appendChild(el("div", "home-work" + (over ? " over" : ""),
    (p.shift ? `💼 Work ${shiftLabel(p.shift)}` : vacationOn(tk) ? "🏖️ Vacation day" : "🌴 Day off") +
    (ft.past ? " · 🌙 Past bedtime, rest up!" :
      over ? ` · 🛑 No free time left: ${formatHrsMin(ft.planned)} of tasks for ${formatHrsMin(ft.total)}. Move something!` :
      ` · ⏳ About ${formatHrsMin(ft.seconds)} of free time left today`)));
  // 🧥 Chaos meter full today: the Coat Rack appears. It grows… slowly… then snaps back. Again. And again.
  const rack = $("home-coatrack");
  let full = false;
  try { full = !ft.past && chaosFor(tk, ft).pct >= 100; } catch {}
  rack.hidden = !full;
  if (full && !rack.firstChild) {
    const lines = ["It's getting closer…", "Don't turn around.", "It followed you home.", "It just wants to hold your coat. For now.",
      "You can't outrun the coat rack.", "It knows your schedule."];
    rack.innerHTML = `<div class="cr-grow">${COAT_RACK_SVG}</div>`;
    rack.appendChild(el("div", "cr-caption", `🧥 ${lines[Math.floor(Math.random() * lines.length)]}`));
    rack.title = "The chaos meter is full today. The coat rack has noticed.";
  }
  if (!full) rack.innerHTML = "";
  const rec = recoveryFor(tk);
  if (rec) next.appendChild(el("div", "home-rec", "💗 It's a recovery day. Your self-care list is on the Day tab."));
  const e = p.energy, et = ENERGY_TEXT[e.level];
  const en = $("home-energy");
  en.style.setProperty("--energy", et.color);
  en.innerHTML = "";
  en.append(el("b", "", `${et.emoji} Energy today: ${et.label}`),
    document.createTextNode(`${e.why.length ? " · " + e.why.join(", ") : ""}. ${e.earlyPeriod ? "Skip the super physical stuff unless it's due." : et.tip}`));
  // 🧠 / 💪 batteries after today's plan.
  const left = b => (b.pctLeft < 0 ? `over by ${-b.pctLeft}%` : `${b.pctLeft}% left`);
  en.appendChild(el("div", "home-batteries", `🧠 Brain ${left(p.bats.brain)} · 💪 Body ${left(p.bats.body)} after today's plan` +
    (p.brainOver.length ? (brainMode() === "auto" ? " · some brain-heavy jobs moved to \"Can wait\"" : " · the Day tab has an idea 💡") : "")));

  // End of the week / month: point her at the recap.
  const endOfMonth = addDays(tk, 1).endsWith("-01");
  const nudge = $("recap-nudge");
  nudge.hidden = !(now.getDay() === 6 || endOfMonth);
  nudge.textContent = endOfMonth ? "🎉 That's a wrap on the month! See your recap ›" : "🎉 Week's almost wrapped! See your recap ›";
  nudge.onclick = () => { recapPeriod = endOfMonth ? "month" : "week"; recapAnchor = tk; showView("recap"); };

  // Deadlines in the next two weeks, most urgent first.
  const dl = $("home-deadlines");
  dl.innerHTML = "";
  const soon = tasks.filter(t => !t.deleted && !t.done && t.dueDate && daysBetween(tk, t.dueDate) <= 14)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (!soon.length) dl.appendChild(el("p", "home-empty", "Nothing due in the next two weeks 🎉"));
  for (const t of soon.slice(0, 6)) {
    const row = el("button", "dl-row");
    const dot = el("span", "dl-dot");
    dot.style.background = urgencyColor(urgency(t, tk) ?? 0);
    row.append(dot, el("span", "dl-title", t.title), el("span", "dl-when", dueLabel(t, tk)));
    row.addEventListener("click", () => { currentDay = t.dueDate < tk ? tk : t.dueDate; showView("day"); });
    dl.appendChild(row);
  }

  // Cycle at a glance.
  const cy = $("home-cycle");
  cy.innerHTML = "";
  const c = cycleInfo(tk);
  if (c) {
    const ph = PHASES[c.phase];
    const head = el("div", "cycle-head");
    head.style.setProperty("--phase", ph.color);
    head.append(el("span", "cycle-dot"), el("span", "", `Cycle day ${c.cycleDay} · ${ph.label}${c.projected ? " (predicted)" : ""}`));
    cy.append(head, el("div", "cycle-blurb", ph.blurb), el("div", "cycle-fact", "💡 " + pickFor(ph.facts, tk, "fact")));
  } else {
    const b2 = el("button", "link-btn", "Set up your cycle in ⚙️ Settings ›");
    b2.addEventListener("click", () => openSettingsSection("cycle-settings"));
    cy.append(el("p", "home-empty", "Track your cycle to get phase tips and smarter planning."), b2);
  }

  renderWeekPlan();
}

$("home-checkin").addEventListener("click", () => openCheckin(todayKey()));
$("home-open-day").addEventListener("click", () => { currentDay = todayKey(); showView("day"); });
