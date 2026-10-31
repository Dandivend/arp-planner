// 🎮 The game layer: making the flow of her day a little more like play.
//   🗝️ Comeback quest: the morning after an "out of day" lock, a golden key hangs on the chaos vial.
//      Finishing one of the tasks that got moved unlocks the chains, and the Order vial cheers up.
//   👹 Boss battles: a task she keeps pushing to later (2+ times), or a long brain-heavy one, is a
//      boss with a health bar. Each step ticked is a hit; finishing it is the knockout.
//   🎁 Loot: finishing things sometimes drops a surprise (an Ori or Molly photo, a fun fact, a new
//      song for the Order vial, a vial skin, a golden animal run). Bosses and comebacks always drop.
//   🎒 Collection tab: every effect she's ever earned, all her loot, bosses beaten, weekly titles.
//   🏆 Weekly titles: each week ends with a playful title from what she did (Recap and Collection).
// Nothing here can be lost: no streaks to break, no points taken away.
// Everything lives in profile.collection, so her phone and Logan's PC see the same book.

// ---------- the collection ----------
function collectionOf() {
  const c = (typeof profile === "object" && profile && profile.collection) || {};
  return { effects: {}, ori: [], molly: [], facts: [], songs: [], skins: [], golden: [], bosses: [], skin: "", drops: {}, ...c };
}
function saveCollection(patch) {
  profile = { ...profile, collection: { ...collectionOf(), ...patch } };
  pushProfile();
}

// ---------- 👹 bosses ----------
const isBoss = t => !!t && !t.done && !t.deleted && ["task", "chore", "workout"].includes(kindOf(t)) && !isWorkShift(t)
  && ((t.pushes || 0) >= 2 || (brainOf(t) === "heavy" && (minutesLeft(t) || t.minutes || 0) >= 60));
function bossHp(t) {
  const steps = t.steps || [];
  const max = Math.max(1, steps.length);
  return { max, left: steps.length ? steps.filter(s => !s.done).length : 1 };
}
const hpBar = t => { const h = bossHp(t); return "▰".repeat(h.left) + "▱".repeat(h.max - h.left); };
function bossChip(t) {
  if (!isBoss(t)) return null;
  const why = (t.pushes || 0) >= 2 ? `pushed back ${t.pushes} times` : "a big brain-heavy one";
  return ["chip boss", `👹 Boss ${hpBar(t)}`, null, `A boss task (${why}). Each step is a hit; finishing it is the knockout ⚔️`];
}
// A hit on a boss (a step ticked in focus mode): the card shakes and "-1 HP" pops up.
function bossHit(card) {
  if (!card || calmMode()) return;
  card.classList.remove("boss-hit");
  void card.offsetWidth;
  card.classList.add("boss-hit");
  const pop = el("span", "boss-dmg", ["-1 HP 💥", "POW! 💥", "-1 HP ⚔️", "BONK! 💫"][Math.floor(Math.random() * 4)]);
  pop.style.left = `${30 + Math.random() * 40}%`;
  card.appendChild(pop);
  setTimeout(() => pop.remove(), 1100);
  buzz([20, 30, 40]);
}

// ---------- 🗝️ comeback quest ----------
const comebacks = () => ((profile.dayMarks || {}).comeback || []);
// Yesterday's moved tasks that are still on today's list (one moved on again to another day
// doesn't count: the quest only waits on what she can see today).
function comebackTasks(day) {
  if (day !== todayKey()) return [];
  const y = addDays(day, -1);
  if (!isBooted(y) || comebacks().includes(day)) return [];
  return tasks.filter(t => !t.deleted && !t.done && t.bootedFrom === y && t.date === day);
}
const comebackPending = day => comebackTasks(day).length > 0;
// The 🔒 chip on the task(s) that unlock the chaos vial.
function comebackChip(t, day) {
  if (t.done || !comebackTasks(day).some(x => x.id === t.id)) return null;
  return ["chip comeback", "🔒 Unlocks the vial", null, "Moved here from yesterday. Finish it to break the chaos vial's chains (and cheer up the Order vial) 🗝️"];
}
function renderComeback(day) {
  const flask = $("chaos-flask"), on = comebackPending(day);
  flask.classList.toggle("comeback", on);
  let key = flask.querySelector(".vial-key");
  let note = $("comeback-note");
  if (!note) {
    note = el("div", "chaos-fx-note comeback-note");
    note.id = "comeback-note";
    $("chaos-fx-note").after(note);
  }
  note.hidden = !on;
  if (on) {
    const names = comebackTasks(day).map(t => `"${t.title}"`);
    setTapNote(note, "🗝️", `🗝️ Comeback quest: finish ${names.length > 1 ? "one of " + names.slice(0, 3).join(", ") : names[0]} (marked 🔒) to unlock the chains and cheer up the Order vial 💛`);
  }
  if (!on) { if (key) key.remove(); return; }
  if (key) return;
  key = el("div", "vial-key");
  key.setAttribute("aria-hidden", "true");
  key.innerHTML = `<svg class="cb-chain" viewBox="0 0 124 8" preserveAspectRatio="none">${Array.from({ length: 12 }, (_, i) => i % 2
    ? `<rect x="${i * 10 + 1}" y="2.5" width="12" height="3" rx="1.5"/>` : `<rect x="${i * 10}" y="0" width="14" height="8" rx="4" fill="none" stroke-width="2.4"/>`).join("")}</svg>` +
    `<svg class="key" viewBox="0 0 40 20"><circle cx="9" cy="10" r="7" fill="none" stroke="#ffd54f" stroke-width="4"/>` +
    `<path d="M16 10 H38 M30 10 V16 M35 10 V15" stroke="#ffd54f" stroke-width="4" stroke-linecap="round"/></svg>`;
  flask.appendChild(key);
}
async function redeemComeback(day) {
  markDays("comeback", [day]);
  const flask = $("chaos-flask"), key = flask && flask.querySelector(".vial-key");
  if (key && !calmMode()) { key.classList.add("unlocking"); await new Promise(r => setTimeout(r, 1100)); }
  render();
  const done = $("done-flask");
  if (done && !calmMode()) {                       // the Order vial cheers up: a big smile for a bit
    const smile = el("div", "happy-face");
    smile.setAttribute("aria-hidden", "true");
    smile.innerHTML = `<svg viewBox="0 0 40 30"><path d="M9 12 q4 -5 8 0 M23 12 q4 -5 8 0" stroke="#5b4a1c" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M11 18 q9 10 18 0" stroke="#5b4a1c" stroke-width="2.6" fill="#fff3c4" stroke-linecap="round"/></svg>`;
    done.appendChild(smile);
    setTimeout(() => smile.remove(), 6000);
  }
  if (typeof playChime === "function") [1, 3, 5, 8].forEach((n, i) => setTimeout(() => playChime(n), i * 140));
  buzz([30, 60, 30, 60, 90]);
  showToast("🗝️ Comeback! The chains are off and the Order vial is smiling again. That's how it's done 💛");
  setTimeout(() => dropLoot("comeback"), 1600);
}

// ---------- 🎁 loot ----------
const VIAL_SKINS = [
  ["ocean", "🌊 Ocean"], ["sunset", "🌅 Sunset"], ["galaxy", "🌌 Galaxy"], ["sakura", "🌸 Sakura"],
  ["mint", "🍀 Mint"], ["ember", "🔥 Ember"], ["aurora", "🌈 Aurora"],
];
const GOLDEN = [["goat", "🐐 Golden goat"], ["parrot", "🦜 Golden parrot"], ["husky", "🐺 Golden husky"], ["cat", "🐈 Golden Ori"]];
const FACT_SETS = () => [["bird", "🦜", BIRD_FACTS], ["goat", "🐐", GOAT_FACTS], ["cat", "🐱", CAT_FACTS]];
const LOOT_CHANCE = 0.3, LOOT_PER_DAY = 4;             // random drops (bosses and comebacks always drop)
const unlockSongs = () => (typeof SONGS === "object" ? SONGS.filter(s => s.unlock) : []);

// Everything she doesn't have yet, by type.
function lootPool() {
  const c = collectionOf(), pool = [];
  const missing = (n, have) => Array.from({ length: n }, (_, i) => i + 1).filter(i => !have.includes(i));
  const ori = missing(PET_PICS.ori || 0, c.ori), molly = missing(PET_PICS.molly || 0, c.molly);
  if (ori.length) pool.push(["ori", 4, ori]);
  if (molly.length) pool.push(["molly", 2, molly]);
  const facts = FACT_SETS().flatMap(([k, , list]) => list.map((_, i) => `${k}:${i}`)).filter(f => !c.facts.includes(f));
  if (facts.length) pool.push(["fact", 4, facts]);
  const songs = unlockSongs().map(s => s.unlock).filter(id => !c.songs.includes(id));
  if (songs.length) pool.push(["song", 2, songs]);
  const skins = VIAL_SKINS.map(s => s[0]).filter(id => !c.skins.includes(id));
  if (skins.length) pool.push(["skin", 2, skins]);
  const golden = GOLDEN.map(g => g[0]).filter(id => !c.golden.includes(id));
  if (golden.length) pool.push(["golden", 1, golden]);
  return pool;
}

// why: "random" (may not drop), "boss", "comeback". Returns what dropped (or null).
function dropLoot(why = "random", force = null) {
  const c = collectionOf(), tk = todayKey();
  const drops = c.drops.day === tk ? c.drops : { day: tk, n: 0 };
  if (why === "random" && !force && (drops.n >= LOOT_PER_DAY || Math.random() >= LOOT_CHANCE)) return null;
  let pool = lootPool();
  if (force) pool = pool.filter(p => p[0] === force[0] && p[2].includes(force[1])).map(p => [p[0], 1, [force[1]]]);
  if (!pool.length) return null;
  const total = pool.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total, pick = pool[0];
  for (const p of pool) { if ((r -= p[1]) < 0) { pick = p; break; } }
  const [type, , items] = pick;
  const item = items[Math.floor(Math.random() * items.length)];
  const patch = { drops: why === "random" ? { day: tk, n: drops.n + 1 } : drops };
  if (type === "ori" || type === "molly") patch[type] = [...c[type], item].sort((a, b) => a - b);
  if (type === "fact") patch.facts = [...c.facts, item];
  if (type === "song") patch.songs = [...c.songs, item];
  if (type === "skin") patch.skins = [...c.skins, item];
  if (type === "golden") patch.golden = [...c.golden, item];
  saveCollection(patch);
  showLoot(type, item, why);
  return { type, item };
}
function lootLabel(type, item) {
  if (type === "ori") return [`🐈 Ori photo #${item}`, `ori/ori-${item}.webp`];
  if (type === "molly") return [`🦜 Molly photo #${item}`, `molly/molly-${item}.webp`];
  if (type === "fact") { const [k, i] = item.split(":"); const set = FACT_SETS().find(s => s[0] === k); return [`${set[1]} Fun fact: ${set[2][+i]}`, null]; }
  if (type === "song") { const s = unlockSongs().find(x => x.unlock === item); return [`🎵 New song for the Order vial: ${s ? s.name : item}`, null]; }
  if (type === "skin") return [`🧪 Vial skin: ${(VIAL_SKINS.find(s => s[0] === item) || [, item])[1]} (wear it in 🎒 Collection)`, null];
  if (type === "golden") return [`✨ ${(GOLDEN.find(g => g[0] === item) || [, item])[1]}: it'll sometimes run in gold now!`, null];
  return [String(item), null];
}
let lootTimer = null;
function showLoot(type, item, why) {
  const [text, img] = lootLabel(type, item);
  const head = why === "boss" ? "⚔️ Boss loot!" : why === "comeback" ? "🗝️ Comeback loot!" : "🎁 Loot!";
  if (calmMode()) return showToast(`${head} ${text}`);
  let pop = $("loot-pop");
  if (!pop) {
    pop = el("div", "loot-pop");
    pop.id = "loot-pop";
    if (pop.showPopover) pop.popover = "manual";        // (the top layer: above focus mode and other open windows)
    document.body.appendChild(pop);
  }
  const hide = () => { pop.classList.remove("show"); setTimeout(() => { if (!pop.classList.contains("show")) try { pop.hidePopover(); } catch {} }, 500); };
  pop.innerHTML = "";
  if (img) { const i = el("img", "loot-img"); i.src = img; i.alt = ""; pop.appendChild(i); }
  else pop.appendChild(el("div", "loot-icon", type === "fact" ? "📜" : type === "song" ? "🎵" : type === "skin" ? "🧪" : "✨"));
  const body = el("div", "loot-body");
  body.append(el("div", "loot-head", head), el("div", "loot-text", text));
  const see = el("button", "link-btn loot-see", "🎒 See collection");
  see.addEventListener("click", () => {
    hide();
    for (const d of document.querySelectorAll("dialog[open]")) d.close();
    showView("collection");
  });
  body.appendChild(see);
  pop.appendChild(body);
  pop.classList.remove("show");
  try { pop.hidePopover(); pop.showPopover(); } catch {}
  void pop.offsetWidth;
  pop.classList.add("show");
  if (typeof playChime === "function") [5, 7, 9].forEach((n, i) => setTimeout(() => playChime(n), i * 110));
  clearTimeout(lootTimer);
  lootTimer = setTimeout(hide, type === "fact" ? 9000 : 6000);
}

// Called from persist() whenever she ticks something off (old = the task before).
function gameOnDone(old, task) {
  if (!old || isWorkShift(task)) return;
  const tk = todayKey();
  // (Not comebackPending(): this task is already saved as done, so none may be left "pending".)
  if (task.bootedFrom && task.bootedFrom === addDays(tk, -1) && isBooted(task.bootedFrom) && !comebacks().includes(tk)) {
    setTimeout(() => redeemComeback(tk), 900);
    return;
  }
  if (isBoss(old)) {
    const c = collectionOf();
    saveCollection({ bosses: [...c.bosses, { title: old.title, day: tk }].slice(-200) });
    setTimeout(() => {
      showToast(`⚔️ Boss defeated: "${old.title}"! It never stood a chance.`);
      const first = !collectionOf().songs.includes("bossfight");
      setTimeout(() => dropLoot("boss", first ? ["song", "bossfight"] : null), 1400);
    }, 1200);
    return;
  }
  setTimeout(() => dropLoot("random"), 1600);
}

// ---------- 🏅 the sticker book: every effect she's ever earned ----------
let effectsSeenToday = "";
function recordEffects(list, day) {
  if (day !== todayKey() || !list.length) return;
  if (tasks.length) fixStoreSticker();
  const key = day + ":" + list.map(a => a.id).sort().join(",");
  if (key === effectsSeenToday) return;
  effectsSeenToday = key;
  const c = collectionOf(), effects = { ...c.effects };
  let changed = false;
  for (const a of list) {
    const e = effects[a.id];
    if (e && e.last === day) continue;
    effects[a.id] = { icon: a.icon, name: a.name, color: a.color, n: ((e && e.n) || 0) + 1, first: (e && e.first) || day, last: day };
    changed = true;
  }
  if (changed) saveCollection({ effects });
}
// Oct 2026: "pickup clothes" was briefly counted as a 🛒 store run. Recount that sticker once from
// her finished tasks (under the fixed rule), and drop it if none of them were really store runs.
function fixStoreSticker() {
  const c = collectionOf(), e = c.effects.store;
  if (!e || (c.fixed || []).includes("store-pickup")) return;
  const days = new Set(tasks.filter(t => !t.deleted && t.done && (t.doneDate || t.date) >= e.first && awardKindOf(t)[0] === "store")
    .map(t => t.doneDate || t.date));
  const effects = { ...c.effects };
  if (days.size) effects.store = { ...e, n: days.size, first: [...days].sort()[0], last: [...days].sort().pop() };
  else delete effects.store;
  saveCollection({ effects, fixed: [...(c.fixed || []), "store-pickup"] });
}

function allEffects() {
  const out = AWARD_KINDS.map(k => ({ id: k[0], icon: k[1], name: k[2], color: k[3] }));
  for (const [id, s] of Object.entries(AWARD_STATES)) out.push({ id, icon: s[0], name: s[1], color: s[2], why: s[3] });
  return out;
}

// ---------- 🏆 weekly titles ----------
function weekStats(ws) {
  const we = addDays(ws, 6), inWk = d => d && d >= ws && d <= we;
  const live = tasks.filter(t => !t.deleted);
  const done = live.filter(t => t.done && !t.skipped && !isWorkShift(t) && inWk(t.doneDate || t.date));
  const marks = profile.dayMarks || {};
  const days = [];
  for (let d = ws; d <= we; d = addDays(d, 1)) days.push(d);
  return {
    done: done.length,
    chores: done.filter(t => kindOf(t) === "chore").length,
    workouts: done.filter(t => kindOf(t) === "workout").length,
    joyMin: done.filter(isJoy).reduce((s, t) => s + (t.minutes || 30), 0),
    fire: (marks.fire || []).filter(inWk).length,
    comebacks: (marks.comeback || []).filter(inWk).length,
    bosses: collectionOf().bosses.filter(b => inWk(b.day)).length,
    checkins: days.filter(d => typeof feelingOf === "function" && (feelingOf(moods[d]) || bodyOf(moods[d]))).length,
  };
}
function weekTitle(ws) {
  const s = weekStats(ws);
  const rules = [
    [s.bosses >= 2, "⚔️ Boss Slayer", `Took down ${s.bosses} boss tasks`],
    [s.comebacks >= 1, "🗝️ Comeback Queen", `Rough night, then unlocked the chains${s.comebacks > 1 ? ` ${s.comebacks} times` : ""}`],
    [s.joyMin >= 240, "🌈 Joy Hoarder", `${formatHrsMin(s.joyMin * 60)} of joy. Excellent priorities`],
    [s.fire >= 2 && s.done >= 15, "🔥 Chaos Tamer", `${s.fire} total-chaos days, and still ${s.done} things done`],
    [s.workouts >= 3, "💪 Muscle Machine", `${s.workouts} workouts done`],
    [s.chores >= 12, "🧽 Chore Champion", `${s.chores} chores wiped out`],
    [s.checkins >= 5, "🫶 Feelings Explorer", `Checked in ${s.checkins} days`],
    [s.done >= 25, "🚀 Unstoppable", `${s.done} things done`],
    [s.bosses >= 1, "⚔️ Boss Hunter", "Took down a boss task"],
    [s.done >= 1, "🌱 Steady Sprout", `${plural(s.done, "thing")} done. Every bit counts`],
    [true, "🛌 Professional Rester", "A quiet week. Rest is part of the plan 💛"],
  ];
  const [, title, why] = rules.find(r => r[0]);
  return { title, why, stats: s };
}
function weekTitleCard(ws, small = false) {
  const tk = todayKey(), we = addDays(ws, 6), wt = weekTitle(ws);
  const card = el("div", "title-card" + (small ? " small" : ""));
  const fmt = d => fromKey(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  card.append(el("div", "title-when", we >= tk ? "🏆 This week so far" : `🏆 Week of ${fmt(ws)}`),
    el("div", "title-name", wt.title), el("div", "title-why", wt.why));
  return card;
}
// The Recap's week view shows the week's title.
function renderWeekTitle(range) {
  let box = $("recap-week-title");
  if (!box) { box = el("div", "recap-week-title"); box.id = "recap-week-title"; $("recap-headline").after(box); }
  box.innerHTML = "";
  box.hidden = recapPeriod !== "week";
  if (!box.hidden) box.appendChild(weekTitleCard(range.start));
}
// A new week: once, a little note with last week's title.
function announceLastWeek() {
  const ws = weekStartOf(todayKey()), last = addDays(ws, -7);
  try { if (localStorage.getItem("arpPlanner.titleSeen") === ws) return; localStorage.setItem("arpPlanner.titleSeen", ws); } catch { return; }
  if (!tasks.length) return;
  const wt = weekTitle(last);
  setTimeout(() => showToast(`🏆 Last week's title: ${wt.title}! ${wt.why}.`, "🎒 Collection", () => showView("collection")), 2500);
}

// ---------- 🎒 the Collection tab ----------
function renderCollection() {
  const box = $("collection-body");
  if (!box) return;
  const c = collectionOf();
  box.innerHTML = "";
  const all = allEffects(), found = all.filter(e => c.effects[e.id]);
  const extra = Object.keys(c.effects).filter(id => !all.some(e => e.id === id));
  const lootHave = c.ori.length + c.molly.length + c.facts.length + c.songs.length + c.skins.length + c.golden.length;
  const stats = el("div", "col-stats");
  for (const [n, label] of [[`${found.length + extra.length}/${all.length}`, "effects found"], [lootHave, "loot collected"],
    [c.bosses.length, "bosses beaten"], [comebacks().length, "comebacks"]]) {
    const s = el("div", "col-stat");
    s.append(el("div", "col-stat-n", String(n)), el("div", "col-stat-l", label));
    stats.appendChild(s);
  }
  box.appendChild(stats);

  const section = (title, hint, open = true) => {
    const d = el("details", "col-sec");
    d.open = open;
    const sum = el("summary", "", title);
    d.appendChild(sum);
    if (hint) d.appendChild(el("p", "hint-small", hint));
    box.appendChild(d);
    return d;
  };

  // 🏆 Weekly titles: this week and the 7 before it.
  const tw = section("🏆 Weekly titles", "Every week ends with a title, from what you did that week.");
  const grid = el("div", "title-grid");
  const ws = weekStartOf(todayKey());
  const firstDay = tasks.reduce((m, t) => { const d = (t.createdAt || "").slice(0, 10) || t.date; return d && d < m ? d : m; }, todayKey());
  for (let i = 0; i < 8; i++) {                     // (only weeks since she started using the planner)
    const w = addDays(ws, -7 * i);
    if (i > 0 && addDays(w, 6) < firstDay) break;
    grid.appendChild(weekTitleCard(w, i > 0));
  }
  tw.appendChild(grid);

  // 🏅 Sticker book.
  const sb = section("🏅 Effect sticker book", `${found.length} of ${all.length} found. Each one comes from something you did; the ❔ ones are still out there.`);
  const stickers = el("div", "sticker-grid");
  for (const e of [...found, ...all.filter(e => !c.effects[e.id])]) {      // found ones first
    const got = c.effects[e.id];
    const s = el("div", "sticker" + (got ? "" : " locked"));
    if (got) {
      s.style.setProperty("--aw", e.color);
      s.innerHTML = awIcon(e.icon, "sticker-ic");
      s.append(el("div", "sticker-name", e.name), el("div", "sticker-n", got.n > 1 ? `×${got.n} days` : "1 day"));
      s.title = `${e.name}: first on ${fromKey(got.first).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    } else s.append(el("div", "sticker-ic", "❔"), el("div", "sticker-name", "???"));
    stickers.appendChild(s);
  }
  sb.appendChild(stickers);

  // ⚔️ Bosses.
  const bs = section("⚔️ Bosses beaten", "A task pushed back twice (or a long brain-heavy one) turns into a boss. Steps are hits; done is the knockout.", c.bosses.length > 0);
  if (!c.bosses.length) bs.appendChild(el("p", "empty-chart", "No bosses beaten yet. They're out there, lurking in the list 👹"));
  else {
    const ul = el("ul", "boss-list");
    for (const b of [...c.bosses].reverse().slice(0, 40))
      ul.appendChild(el("li", "", `⚔️ ${b.title} · ${fromKey(b.day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`));
    bs.appendChild(ul);
  }

  // 🎁 Loot.
  const ls = section("🎁 Loot", "Finishing things sometimes drops a surprise. Bosses and comebacks always do.");
  const photos = el("div", "loot-photos");
  for (const [pet, n] of [["ori", PET_PICS.ori || 0], ["molly", PET_PICS.molly || 0]]) {
    photos.appendChild(el("h4", "loot-sub", `${pet === "ori" ? "🐈 Ori" : "🦜 Molly"} photos · ${c[pet].length} of ${n}`));
    const g = el("div", "photo-grid");
    for (let i = 1; i <= n; i++) {
      if (c[pet].includes(i)) {
        const b = el("button", "photo-cell");
        b.type = "button";
        const img = el("img", "");
        img.src = `${pet}/${pet}-${i}.webp`;
        img.alt = `${pet} photo ${i}`;
        img.loading = "lazy";
        b.appendChild(img);
        b.addEventListener("click", () => openPhoto(img.src));
        g.appendChild(b);
      } else g.appendChild(el("div", "photo-cell locked", "❔"));
    }
    photos.appendChild(g);
  }
  ls.appendChild(photos);

  const facts = el("div", "loot-facts");
  facts.appendChild(el("h4", "loot-sub", `📜 Fun facts · ${c.facts.length} of ${FACT_SETS().reduce((s, f) => s + f[2].length, 0)}`));
  if (!c.facts.length) facts.appendChild(el("p", "hint-small", "None yet."));
  const fl = el("ul", "fact-list");
  for (const f of [...c.facts].reverse()) { const [k, i] = f.split(":"); const set = FACT_SETS().find(s => s[0] === k); if (set) fl.appendChild(el("li", "", `${set[1]} ${set[2][+i]}`)); }
  facts.appendChild(fl);
  ls.appendChild(facts);

  const songs = el("div", "loot-songs");
  songs.appendChild(el("h4", "loot-sub", `🎵 Order vial songs · ${c.songs.length} of ${unlockSongs().length} unlocked`));
  songs.appendChild(el("p", "hint-small", "Unlocked songs join the shuffle when you tap the Order vial."));
  const sl = el("ul", "song-list");
  for (const s of unlockSongs()) sl.appendChild(el("li", c.songs.includes(s.unlock) ? "" : "locked", c.songs.includes(s.unlock) ? s.name : "🔒 ???"));
  songs.appendChild(sl);
  ls.appendChild(songs);

  const skins = el("div", "loot-skins");
  skins.appendChild(el("h4", "loot-sub", `🧪 Order vial skins · ${c.skins.length} of ${VIAL_SKINS.length}`));
  const sg = el("div", "skin-grid");
  for (const [id, name] of [["", "✨ Classic"], ...VIAL_SKINS]) {
    const have = !id || c.skins.includes(id), on = (c.skin || "") === id;
    const b = el("button", "skin-btn" + (on ? " on" : "") + (have ? "" : " locked"));
    b.type = "button";
    b.disabled = !have;
    const sw = el("span", "skin-swatch");
    sw.dataset.skin = id;
    b.append(sw, el("span", "", have ? name : "🔒 ???"));
    if (have) b.addEventListener("click", () => { saveCollection({ skin: id }); render(); });
    sg.appendChild(b);
  }
  skins.appendChild(sg);
  ls.appendChild(skins);

  const gold = el("div", "loot-golden");
  gold.appendChild(el("h4", "loot-sub", `✨ Golden runs · ${c.golden.length} of ${GOLDEN.length}`));
  gold.appendChild(el("p", "hint-small", "A golden animal sometimes crosses out your finished tasks instead of the usual one."));
  const gl = el("ul", "song-list");
  for (const [id, name] of GOLDEN) gl.appendChild(el("li", c.golden.includes(id) ? "" : "locked", c.golden.includes(id) ? name : "🔒 ???"));
  gold.appendChild(gl);
  ls.appendChild(gold);
}
function openPhoto(src) {
  const dlg = smallDialog("photo-peek");
  const img = el("img", "photo-big");
  img.src = src;
  img.alt = "";
  const close = el("button", "g-btn", "Close");
  close.addEventListener("click", () => dlg.close());
  dlg.append(img, close);
  dlg.showModal();
}

(function setupGame() {
  if ($("tab-collection")) $("tab-collection").addEventListener("click", () => showView("collection"));
  setTimeout(() => { try { announceLastWeek(); } catch {} }, 4000);
})();
