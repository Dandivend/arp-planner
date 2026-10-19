// 🌈 Rejuvenation tab: her hobbies and fun things (not work). Each one can be put on a day as a
// "joy" task, which calms the chaos meter (see joyFor / chaosFor in wellness.js). Her list of
// hobbies is profile.hobbies, so it syncs; until she edits it, a few starters are shown.

const STARTER_HOBBIES = [
  { emoji: "❤️", name: "Time with Logan", minutes: 60 },
  { emoji: "📚", name: "Reading", minutes: 30 },
  { emoji: "🎮", name: "Gaming", minutes: 60 },
  { emoji: "🛁", name: "Bath and pamper time", minutes: 30 },
  { emoji: "🌳", name: "Walk outside", minutes: 30 },
  { emoji: "🎨", name: "Crafting", minutes: 45 },
  { emoji: "🦜", name: "Play with Molly", minutes: 20 },
  { emoji: "🐱", name: "Ori cuddles", minutes: 15 },
];
const hobbies = () => (Array.isArray(profile.hobbies) ? profile.hobbies : STARTER_HOBBIES);

async function saveHobbies(list) {
  try { profile = await Store.putProfile({ hobbies: list }); } catch { showError("Couldn't save your hobbies. Try again in a moment."); }
  renderJoy();
}

async function addJoyTask(h, day) {
  await persist({
    id: newId(), date: day, time: null, title: h.name, notes: "", done: false, doneDate: null, kind: "joy",
    priority: "normal", dueDate: null, minutes: h.minutes || 30, area: null, effort: "light", brain: "light", workout: null,
    createdAt: new Date().toISOString(), deleted: false, external: {},
  }, false);
  const when = day === todayKey() ? "today" : fromKey(day).toLocaleDateString(undefined, { weekday: "long" });
  showToast(`${h.emoji || "🌈"} ${h.name} is on ${when}. Your chaos meter says thank you 💖`);
  render();
}

function renderJoy() {
  const box = $("joy-body");
  if (!box) return;
  box.innerHTML = "";
  const tk = todayKey();

  // This week so far: joy and time with Logan.
  const weekStart = addDays(tk, -fromKey(tk).getDay());
  const week = tasks.filter(t => !t.deleted && t.date && t.date >= weekStart && t.date <= addDays(weekStart, 6));
  const joyWeek = week.filter(isJoy), loganWeek = week.filter(isLogan);
  const mins = list => list.reduce((s, t) => s + (t.minutes || 30), 0);
  const sum = el("div", "joy-week");
  sum.append(el("div", "joy-stat", `🌈 ${joyWeek.length ? formatHrsMin(mins(joyWeek) * 60) : "No"} joy planned this week`),
    el("div", "joy-stat", `❤️ ${loganWeek.length ? formatHrsMin(mins(loganWeek) * 60) : "No"} time with Logan this week`));
  if (!joyWeek.length) sum.appendChild(el("p", "hint-small", "Pick something below and give it a day. Fun is part of the plan, not a reward for finishing it. 💛"));
  box.appendChild(sum);

  // Her hobbies.
  box.appendChild(el("h3", "joy-sub", "Your hobbies and fun things"));
  const list = el("div", "joy-list");
  hobbies().forEach((h, i) => {
    const row = el("div", "joy-row");
    row.append(el("span", "joy-emoji", h.emoji || "🌈"),
      el("span", "joy-name", h.name), el("span", "joy-len", formatMinutes(h.minutes || 30)));
    const today = el("button", "move-btn", "+ Today");
    today.addEventListener("click", () => addJoyTask(h, tk));
    const pick = el("input", "todo-date");
    pick.type = "date";
    pick.min = tk;
    pick.title = "Put it on another day";
    pick.addEventListener("change", () => { if (pick.value) addJoyTask(h, pick.value); });
    const x = el("button", "icon-btn", "✕");
    x.title = "Remove from your list";
    x.addEventListener("click", () => saveHobbies(hobbies().filter((_, j) => j !== i)));
    const acts = el("span", "joy-acts");
    acts.append(today, pick, x);
    row.appendChild(acts);
    list.appendChild(row);
  });
  box.appendChild(list);

  // Add one.
  const form = el("form", "joy-add");
  const emoji = el("input");
  emoji.placeholder = "🌈";
  emoji.maxLength = 4;
  emoji.className = "joy-emoji-in";
  const name = el("input");
  name.placeholder = "Add a hobby or fun thing… (e.g. Painting)";
  name.maxLength = 80;
  const len = el("select");
  for (const m of [10, 15, 20, 30, 45, 60, 90, 120, 180]) len.add(new Option(formatMinutes(m), m));
  len.value = "30";
  const add = el("button", "g-btn primary", "+ Add");
  add.type = "submit";
  form.append(emoji, name, len, add);
  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!name.value.trim()) return;
    saveHobbies([...hobbies(), { emoji: emoji.value.trim() || "🌈", name: name.value.trim(), minutes: Number(len.value) }]);
  });
  box.appendChild(form);

  // Coming up.
  const soon = tasks.filter(t => !t.deleted && !t.done && isJoy(t) && t.date && t.date >= tk).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  if (soon.length) {
    box.appendChild(el("h3", "joy-sub", "Coming up"));
    const ul = el("ul", "task-list");
    for (const t of soon) {
      const li = taskRow(t, false);
      const meta = li.querySelector(".meta") || li.querySelector(".body").appendChild(el("div", "meta"));
      meta.prepend(el("span", "chip todo-day", "📅 " + (t.date === tk ? "Today" : fromKey(t.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
}
