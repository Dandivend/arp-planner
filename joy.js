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

// 🎲 Can't decide? Roll the dice: a random hobby for 15 minutes of joy, right now. (Things that
// need Logan are left out of the roll, since he might be asleep in Tokyo.)
const JOY_ROLL_MIN = 15;
let lastJoyRoll = null, joyRollPick = null;      // (the pick stays when the page redraws)
function joyDice() {
  const card = el("div", "joy-dice-card");
  const head = el("div", "joy-dice-head");
  const die = el("button", "joy-die", "🎲");
  die.type = "button";
  die.title = "Roll for 15 minutes of joy";
  die.setAttribute("aria-label", "Roll the dice for 15 minutes of joy");
  const words = el("div", "joy-dice-words");
  words.append(el("b", "", "Can't pick? Roll the dice!"), el("span", "hint-small", "A random fun thing for 15 minutes of joy, right now."));
  head.append(die, words);
  const result = el("div", "joy-dice-result");
  result.hidden = true;
  card.append(head, result);

  const pool = () => hobbies().filter(h => !/\blogan\b/i.test(h.name));
  const show = h => {
    joyRollPick = h;
    result.hidden = false;
    result.innerHTML = "";
    result.append(el("div", "joy-dice-pick", `${h.emoji || "🌈"} ${h.name}`), el("div", "hint-small", `for ${JOY_ROLL_MIN} minutes. That's it. Nothing else to do. 💖`));
    const btns = el("div", "joy-dice-btns");
    const go = el("button", "g-btn primary", `▶ Start ${JOY_ROLL_MIN} min`);
    go.addEventListener("click", () => { joyRollPick = null; startJoyRoll(h); });
    const add = el("button", "g-btn", "+ Add to today");
    add.addEventListener("click", () => addJoyTask({ ...h, minutes: JOY_ROLL_MIN }, todayKey()));
    const again = el("button", "link-btn", "🎲 Roll again");
    again.addEventListener("click", roll);
    btns.append(go, add, again);
    result.appendChild(btns);
  };
  const roll = () => {
    const list = pool();
    if (!list.length) { showToast("Add a hobby below first, then the dice has something to pick 🎲"); return; }
    let pick = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1) while (lastJoyRoll && pick.name === lastJoyRoll) pick = list[Math.floor(Math.random() * list.length)];
    lastJoyRoll = pick.name;
    if (typeof buzz === "function") buzz([8, 30, 8, 30, 12]);
    if (calmMode() || matchMedia("(prefers-reduced-motion: reduce)").matches) { show(pick); return; }
    die.classList.remove("rolling");
    void die.offsetWidth;
    die.classList.add("rolling");
    result.hidden = false;
    let i = 0;
    joyRollPick = null;
    const flick = setInterval(() => {                       // names flicker past like a slot machine
      const h = list[i++ % list.length];
      result.innerHTML = "";
      result.appendChild(el("div", "joy-dice-pick flicker", `${h.emoji || "🌈"} ${h.name}`));
      if (typeof fidgetSound === "function") fidgetSound("key");
    }, 90);
    setTimeout(() => {
      clearInterval(flick);
      die.classList.remove("rolling");
      show(pick);
      if (!card.isConnected && view === "joy") renderJoy();          // the page redrew mid-roll: show it on the new one
      if (typeof fidgetSound === "function") fidgetSound("fanfare");
    }, 1000);
  };
  die.addEventListener("click", roll);
  if (joyRollPick) show(joyRollPick);
  return card;
}

// Start the rolled thing: it goes on today as a 15-minute joy task, a gentle timer runs, and when
// it ends the task ticks itself off (so the chaos vial's flowers bloom).
async function startJoyRoll(h) {
  const t = {
    id: newId(), date: todayKey(), time: null, title: h.name, notes: "", done: false, doneDate: null, kind: "joy",
    priority: "normal", dueDate: null, minutes: JOY_ROLL_MIN, area: null, effort: "light", brain: "light", workout: null,
    createdAt: new Date().toISOString(), deleted: false, external: {}, emoji: h.emoji || null,
  };
  await persist(t, false);
  openBreather("calm", JOY_ROLL_MIN, {
    title: `${h.emoji || "🌈"} ${JOY_ROLL_MIN} minutes of ${h.name}`,
    text: "This is your joy time. Nothing else needs you right now. Have fun! 💖",
    onDone: async () => {
      const now = tasks.find(x => x.id === t.id);
      if (now && !now.done) await persist({ ...now, done: true, doneDate: todayKey() });
      showToast(`🌸 ${JOY_ROLL_MIN} minutes of joy, done! Your chaos vial is blooming 💖`);
    },
  });
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
  box.appendChild(joyDice());

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
