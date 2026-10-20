// ⚔️ Adventure mode (Settings → bottom → Adventure mode): a choose-your-path text adventure with
// d20 rolls, stats, gold, items and companions (Molly the grey, Ori the Siamese, and a goat).
// Three original worlds, each a fond nod to a game: Azerhoof (raids and fish-people),
// Spiral Pointe Academy (a wizard school with spell cards) and Crystal Star (crystals and fashion).
// The stories live in adventure-worlds.js. Progress saves on this device. Fainting never ends the
// game: she wakes up at the inn, a little poorer.
//
// A story node: { text, choices: [{ label, to, effect, req, roll: { stat, dc, win, fail } }], end }
//   effect: { hp, gold, item, lose, flag, companion, stats, cls } (applied when chosen)
//   req:    { item, flag, companion, gold, notFlag } (choice shown only when met)
//   text:   may use {name}, {cls}, {pet} (her favourite companion so far)

const ADV_KEY = "arpPlanner.adventure";
let adv = null;                                  // the game in progress
let advLog = null;                               // the last roll / what just happened

function advLoad() {
  try { return JSON.parse(localStorage.getItem(ADV_KEY) || "null"); } catch { return null; }
}
function advSave() { try { localStorage.setItem(ADV_KEY, JSON.stringify(adv)); } catch {} }

function advNew(worldId, name) {
  const w = ADV_WORLDS[worldId];
  adv = { world: worldId, node: w.start, name: (name || "Ariel").slice(0, 24), cls: "Adventurer", hp: 12, maxHp: 12, gold: 5,
    stats: { might: 0, wits: 0, charm: 0 }, items: [], flags: {}, companions: [], steps: 0, faints: 0 };
  advLog = null;
  advSave();
}

const advFill = t => t.replace(/\{name\}/g, adv.name).replace(/\{cls\}/g, adv.cls)
  .replace(/\{pet\}/g, adv.companions[0] || "your trusty sandwich");

function advMeets(req) {
  if (!req) return true;
  if (req.item && !adv.items.includes(req.item)) return false;
  if (req.noItem && adv.items.includes(req.noItem)) return false;
  if (req.flag && !adv.flags[req.flag]) return false;
  if (req.notFlag && adv.flags[req.notFlag]) return false;
  if (req.companion && !adv.companions.includes(req.companion)) return false;
  if (req.gold && adv.gold < req.gold) return false;
  return true;
}

function advApply(e) {
  if (!e) return [];
  const notes = [];
  if (e.cls) adv.cls = e.cls;
  if (e.stats) for (const [k, v] of Object.entries(e.stats)) adv.stats[k] = (adv.stats[k] || 0) + v;
  if (e.maxHp) { adv.maxHp += e.maxHp; adv.hp += e.maxHp; }
  if (e.hp) {
    adv.hp = Math.max(0, Math.min(adv.maxHp, adv.hp + e.hp));
    notes.push(e.hp > 0 ? `❤️ +${e.hp}` : `💔 ${e.hp}`);
  }
  if (e.gold) { adv.gold = Math.max(0, adv.gold + e.gold); notes.push(e.gold > 0 ? `🪙 +${e.gold}` : `🪙 ${e.gold}`); }
  if (e.item && !adv.items.includes(e.item)) { adv.items.push(e.item); notes.push(`🎒 ${e.item}`); }
  if (e.lose) { adv.items = adv.items.filter(i => i !== e.lose); notes.push(`🎒 −${e.lose}`); }
  if (e.flag) adv.flags[e.flag] = true;
  if (e.companion && !adv.companions.includes(e.companion)) { adv.companions.push(e.companion); notes.push(`🐾 ${e.companion} joined you!`); }
  return notes;
}

const STAT_LABEL = { might: "💪 Might", wits: "🧠 Wits", charm: "✨ Charm" };

function advChoose(c) {
  const notes = advApply(c.effect);
  let to = c.to, roll = null;
  if (c.roll) {
    const die = 1 + Math.floor(Math.random() * 20), bonus = adv.stats[c.roll.stat] || 0;
    const help = c.roll.pet && adv.companions.includes(c.roll.pet) ? 3 : 0;      // a companion who can help
    const total = die + bonus + help, win = die === 20 || (die !== 1 && total >= c.roll.dc);
    roll = { die, bonus, help, total, dc: c.roll.dc, stat: c.roll.stat, win, pet: help ? c.roll.pet : null,
      crit: die === 20 ? "nat20" : die === 1 ? "nat1" : null };
    to = win ? c.roll.win : c.roll.fail;
  }
  adv.steps++;
  adv.node = to;
  const node = ADV_WORLDS[adv.world].nodes[to];
  if (node && node.effect) notes.push(...advApply(node.effect));
  if (adv.hp <= 0) {                             // fainting: back to the inn, never game over
    adv.faints++;
    const lost = Math.min(adv.gold, 5);
    adv.gold -= lost;
    adv.hp = adv.maxHp;
    notes.push(`😵 You fainted! You wake at the inn, fully healed${lost ? `, ${lost} gold lighter` : ""}.`);
    adv.node = ADV_WORLDS[adv.world].inn || to;
  }
  advLog = { roll, notes };
  advSave();
  if (typeof buzz === "function") buzz(roll ? (roll.win ? [12, 40, 20] : [40]) : 8);
  if (roll && typeof fidgetSound === "function") fidgetSound(roll.win ? "fanfare" : "thock");
  renderAdventure(true);
}

function renderAdventure(scrollTop) {
  const box = $("adventure-body");
  if (!box) return;
  box.innerHTML = "";
  if (!adv) adv = advLoad();

  // Pick a world.
  if (!adv || !ADV_WORLDS[adv.world]) {
    box.appendChild(el("p", "adv-intro", "Choose a world, name your hero, and decide what happens next. Some choices roll a 🎲 d20 " +
      "plus one of your stats against a difficulty. Fainting just sends you back to the inn. Your progress saves by itself."));
    const nameRow = el("div", "adv-name");
    const name = el("input");
    name.placeholder = "Your hero's name";
    name.value = "Ariel";
    name.maxLength = 24;
    nameRow.append(el("span", "fit-label", "Hero name"), name);
    box.appendChild(nameRow);
    for (const [id, w] of Object.entries(ADV_WORLDS)) {
      const b = el("button", "adv-world");
      b.style.setProperty("--w", w.color);
      b.append(el("span", "adv-world-emoji", w.emoji), el("b", "", w.title), el("span", "adv-world-blurb", w.blurb));
      b.addEventListener("click", () => { advNew(id, name.value.trim()); renderAdventure(true); });
      box.appendChild(b);
    }
    return;
  }

  const w = ADV_WORLDS[adv.world], node = w.nodes[adv.node];
  // Hero sheet.
  const sheet = el("div", "adv-sheet");
  sheet.style.setProperty("--w", w.color);
  sheet.append(el("div", "adv-title", `${w.emoji} ${w.title}`),
    el("div", "adv-hero", `${adv.name} the ${adv.cls}`));
  const bar = el("div", "adv-bars");
  const hp = el("div", "adv-hp");
  hp.appendChild(el("span", "adv-hp-fill"));
  hp.firstChild.style.width = `${(adv.hp / adv.maxHp) * 100}%`;
  bar.append(el("span", "", `❤️ ${adv.hp}/${adv.maxHp}`), hp, el("span", "", `🪙 ${adv.gold}`),
    el("span", "", Object.entries(adv.stats).map(([k, v]) => `${STAT_LABEL[k].split(" ")[0]} ${v >= 0 ? "+" : ""}${v}`).join("  ")));
  sheet.appendChild(bar);
  if (adv.items.length) sheet.appendChild(el("div", "adv-items", "🎒 " + adv.items.join(" · ")));
  if (adv.companions.length) sheet.appendChild(el("div", "adv-items", "🐾 " + adv.companions.join(" · ")));
  box.appendChild(sheet);

  // What just happened.
  if (advLog && (advLog.roll || advLog.notes.length)) {
    const log = el("div", "adv-log");
    if (advLog.roll) {
      const r = advLog.roll;
      const d = el("div", "adv-roll " + (r.win ? "win" : "fail"));
      d.append(el("span", "adv-die", "🎲 " + r.die),
        el("span", "", ` ${r.bonus >= 0 ? "+" : "−"} ${Math.abs(r.bonus)} ${STAT_LABEL[r.stat]}` + (r.help ? ` + 3 (${r.pet} helped!)` : "") +
          ` = ${r.total} vs ${r.dc} → ` + (r.crit === "nat20" ? "NATURAL 20!!! 🌟" : r.crit === "nat1" ? "natural 1. Oh no. 💀" : r.win ? "Success!" : "Fail!")));
      log.appendChild(d);
    }
    if (advLog.notes.length) log.appendChild(el("div", "adv-notes", advLog.notes.join("   ")));
    box.appendChild(log);
  }

  // The story.
  const story = el("div", "adv-story");
  for (const para of advFill(typeof node.text === "function" ? node.text(adv) : node.text).split("\n\n")) story.appendChild(el("p", "", para));
  box.appendChild(story);

  // Choices.
  const choices = el("div", "adv-choices");
  if (node.end) {
    story.appendChild(el("p", "adv-end", `🏆 THE END · ${adv.steps} choices · ${adv.faints} faint${adv.faints === 1 ? "" : "s"} · ${adv.gold} gold`));
    const again = el("button", "g-btn primary", "🔁 Play this world again");
    again.addEventListener("click", () => { advNew(adv.world, adv.name); renderAdventure(true); });
    const other = el("button", "g-btn", "🗺️ Try another world");
    other.addEventListener("click", () => { adv = null; try { localStorage.removeItem(ADV_KEY); } catch {} renderAdventure(true); });
    choices.append(again, other);
  } else {
    for (const c of node.choices.filter(c => advMeets(c.req))) {
      const b = el("button", "adv-choice");
      b.appendChild(el("span", "", advFill(c.label)));
      if (c.roll) b.appendChild(el("span", "adv-check", `🎲 ${STAT_LABEL[c.roll.stat]} ${c.roll.dc}+`));
      b.addEventListener("click", () => advChoose(c));
      choices.appendChild(b);
    }
  }
  box.appendChild(choices);

  const foot = el("div", "adv-foot");
  const restart = el("button", "link-btn", "Start this world over");
  restart.addEventListener("click", () => {
    if (!restart.dataset.armed) { restart.dataset.armed = "1"; restart.textContent = "Tap again to start over"; return; }
    advNew(adv.world, adv.name); renderAdventure(true);
  });
  const worlds = el("button", "link-btn", "Choose another world");
  worlds.addEventListener("click", () => {
    if (!worlds.dataset.armed) { worlds.dataset.armed = "1"; worlds.textContent = "Tap again (this world's progress is lost)"; return; }
    adv = null; try { localStorage.removeItem(ADV_KEY); } catch {} renderAdventure(true);
  });
  foot.append(restart, worlds);
  box.appendChild(foot);
  if (scrollTop) $("adventure-view").scrollIntoView({ block: "start" });
}

$("open-adventure").addEventListener("click", () => showView("adventure"));
$("adventure-back").addEventListener("click", () => { showView("settings"); openSettingsSection("open-adventure"); });
