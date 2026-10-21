// 🧼 Care Time (Settings): the everyday things that take time but aren't tasks: making and eating
// dinner, showering, getting ready for work... She lists them once with how long they take and
// which days, and they come out of her free time (and so fill the chaos meter a little).
// Stored in her settings: profile.care = [{ id, name, minutes, days: "every" | "work" | "off", at: "HH:MM" | null }].
// "at" is when she usually does it; with it, today's free time knows whether it's still ahead.

const CARE_IDEAS = [
  ["🍝 Make & eat dinner", 60, "every"], ["🚿 Shower", 20, "every"], ["💼 Get ready for work", 45, "work"],
  ["🥣 Breakfast", 20, "every"], ["🥪 Lunch", 30, "every"], ["🪥 Morning routine", 20, "every"],
  ["🌙 Bedtime routine", 20, "every"], ["🧴 Skincare", 10, "every"], ["🐱 Feed & care for pets", 15, "every"],
];
const CARE_DAYS = [["every", "Every day"], ["work", "Workdays"], ["off", "Days off"]];
const CARE_MINUTES = [5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 150, 180];

const careList = () => Array.isArray(profile.care) ? profile.care : [];
const careOn = (c, day) => c.days === "work" ? !!workHoursFor(day) : c.days === "off" ? !workHoursFor(day) : true;
function careMinutesFor(day) {
  return careList().filter(c => c.minutes > 0 && careOn(c, day)).reduce((s, c) => s + c.minutes, 0);
}
const saveCare = list => saveProfile({ care: list });

// Care time still ahead today, in minutes: an item with a time counts until it's over (partly,
// while she's in the middle of it); one without a time is spread over the free part of her day
// (frac = how much of today's free time is still ahead).
function careAheadFor(day, nowMin, frac) {
  let ahead = 0;
  for (const c of careList()) {
    if (!(c.minutes > 0) || !careOn(c, day)) continue;
    if (c.at) { const start = toMin(c.at); ahead += Math.max(0, Math.min(c.minutes, start + c.minutes - nowMin)); }
    else ahead += c.minutes * frac;
  }
  return ahead;
}
// "When do you do it?": any time, or a time of day in 15-minute steps.
function careTimeSelect(value, onChange) {
  const s = el("select", "care-at");
  s.setAttribute("aria-label", "When you usually do it");
  s.add(new Option("🕒 Any time", "", false, !value));
  const times = [];
  for (let m = 4 * 60; m < 24 * 60; m += 15) times.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  if (value && !times.includes(value)) times.push(value), times.sort();
  for (const t of times) s.add(new Option("🕒 " + formatTime(t), t, false, t === value));
  s.addEventListener("change", () => onChange(s.value || null));
  return s;
}

function renderCare() {
  const box = $("care-settings");
  if (!box) return;
  box.innerHTML = "";
  const list = careList();
  const update = (i, changes) => saveCare(list.map((c, j) => j === i ? { ...c, ...changes } : c));

  list.forEach((c, i) => {
    const row = el("div", "care-row");
    const name = el("input", "care-name");
    name.type = "text";
    name.value = c.name;
    name.placeholder = "What is it?";
    name.setAttribute("aria-label", "Care item name");
    name.addEventListener("change", () => { if (name.value.trim()) update(i, { name: name.value.trim() }); else name.value = c.name; });
    name.addEventListener("keydown", e => { if (e.key === "Enter") name.blur(); });
    const mins = el("select", "care-min");
    mins.setAttribute("aria-label", "How long it takes");
    const opts = [...new Set([...CARE_MINUTES, c.minutes])].sort((a, b) => a - b);
    for (const m of opts) mins.add(new Option(formatMinutes(m), m, false, m === c.minutes));
    mins.addEventListener("change", () => update(i, { minutes: Number(mins.value) }));
    const days = el("select", "care-days");
    days.setAttribute("aria-label", "Which days");
    for (const [v, label] of CARE_DAYS) days.add(new Option(label, v, false, v === c.days));
    days.addEventListener("change", () => update(i, { days: days.value }));
    const at = careTimeSelect(c.at || null, v => update(i, { at: v }));
    const del = el("button", "care-del", "✕");
    del.title = `Remove "${c.name}"`;
    del.setAttribute("aria-label", `Remove ${c.name}`);
    del.addEventListener("click", () => saveCare(list.filter((_, j) => j !== i)));
    row.append(name, mins, days, at, del);
    box.appendChild(row);
  });

  if (list.length) {
    const work = careList().filter(c => c.days !== "off").reduce((s, c) => s + c.minutes, 0);
    const off = careList().filter(c => c.days !== "work").reduce((s, c) => s + c.minutes, 0);
    box.appendChild(el("p", "care-total", work === off ? `🧼 About ${formatMinutes(work)} of care time a day.`
      : `🧼 About ${formatMinutes(work)} on workdays, ${formatMinutes(off)} on days off.`));
  } else {
    box.appendChild(el("p", "hint-small", "Nothing added yet. Tap an idea below, or add your own."));
  }

  // Quick ideas (the ones not added yet), then "add your own".
  const have = new Set(list.map(c => c.name.toLowerCase()));
  const ideas = el("div", "care-ideas");
  for (const [n, m, d] of CARE_IDEAS) {
    if (have.has(n.toLowerCase())) continue;
    const b = el("button", "chip-btn", `+ ${n} · ${formatMinutes(m)}`);
    b.addEventListener("click", () => saveCare([...list, { id: newId(), name: n, minutes: m, days: d }]));
    ideas.appendChild(b);
  }
  if (ideas.children.length) box.appendChild(ideas);
  const add = el("button", "g-btn", "+ Add your own");
  add.addEventListener("click", () => saveCare([...list, { id: newId(), name: "✨ Something else", minutes: 15, days: "every" }]));
  box.appendChild(add);
}
