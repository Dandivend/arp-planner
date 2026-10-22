// 🏅 Effects ("awards"): EVERYTHING she finishes earns a little effect that floats around the chaos
// vial: time with Logan is a glowing heart, a store run a tiny shopping cart, gaming a controller,
// a day off a palm island, and so on. They're earned when a thing is done (an appointment counts once
// it's over), last the whole day, and reset at midnight like the other status effects.
//   · the 3 newest orbit the vial; with more than 3, a little arrow opens all of them (a tornado!)
//   · a brand-new one glows for a few seconds, like an award being handed over
//   · the vial's liquid swirls in the colours of what she's earned
// Nothing here changes the real chaos numbers; it's all celebration.

// ---------- hand-drawn icons (little SVGs, so they look like nothing else on her phone) ----------
const AW_SVG = {
  heart: `<svg viewBox="0 0 32 32"><defs><radialGradient id="awh" cx="35%" cy="30%"><stop offset="0" stop-color="#ffd1e3"/><stop offset=".45" stop-color="#ff4f8b"/><stop offset="1" stop-color="#c2185b"/></radialGradient></defs>
    <path d="M16 28 C4 19 2 13 4.5 8.5 C7 4 13 4 16 9 C19 4 25 4 27.5 8.5 C30 13 28 19 16 28Z" fill="url(#awh)"/><circle cx="10.5" cy="10.5" r="2.2" fill="#fff" opacity=".85"/><path d="M25 3 l1 2.3 2.3 1 -2.3 1 -1 2.3 -1-2.3 -2.3-1 2.3-1z" fill="#fff59d"/></svg>`,
  cart: `<svg viewBox="0 0 32 32"><path d="M3 6 h4 l3.5 14 h14 l3-10 H9" fill="none" stroke="#2e7d32" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="10" y="7" width="5" height="6" rx="1" fill="#ff7043"/><rect x="16" y="5" width="4" height="8" rx="1" fill="#ffca28"/><circle cx="21.5" cy="9.5" r="3" fill="#66bb6a"/>
    <circle cx="12.5" cy="25" r="2.6" fill="#37474f"/><circle cx="22.5" cy="25" r="2.6" fill="#37474f"/></svg>`,
  controller: `<svg viewBox="0 0 32 32"><path d="M8 10 h16 c4 0 6 4 6.5 9 c.5 5 -2.5 7 -5 4.5 L22 20 H10 l-3.5 3.5 c-2.5 2.5 -5.5 .5 -5 -4.5 C2 14 4 10 8 10Z" fill="#7c5cff"/>
    <path d="M9 13.5 v5 M6.5 16 h5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="21" cy="14.5" r="1.6" fill="#ffd54f"/><circle cx="24" cy="17.5" r="1.6" fill="#4dd0e1"/><circle cx="18.5" cy="17.5" r="1.6" fill="#ff6e6e"/><circle cx="21" cy="20" r="1.6" fill="#a5d6a7"/></svg>`,
  bandaid: `<svg viewBox="0 0 32 32"><g transform="rotate(-35 16 16)"><rect x="3" y="11" width="26" height="10" rx="5" fill="#f2b48c"/><rect x="11" y="11" width="10" height="10" fill="#e89a6f"/>
    <circle cx="14" cy="14" r=".9" fill="#b8704a"/><circle cx="18" cy="14" r=".9" fill="#b8704a"/><circle cx="14" cy="18" r=".9" fill="#b8704a"/><circle cx="18" cy="18" r=".9" fill="#b8704a"/></g>
    <path d="M25 4 l.9 2 2 .9 -2 .9 -.9 2 -.9-2 -2-.9 2-.9z" fill="#fff59d"/></svg>`,
  island: `<svg viewBox="0 0 32 32"><circle cx="25" cy="7" r="4" fill="#ffd54f"/><ellipse cx="15" cy="27" rx="13" ry="3.5" fill="#4fc3f7"/><ellipse cx="15" cy="25.5" rx="8" ry="3" fill="#ffe0a3"/>
    <path d="M15 25 C15 19 14 14 12 10" stroke="#8d6e63" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M12 10 C7 7 4 9 3 12 C6 10 9 10 12 10Z M12 10 C14 5 19 5 21 8 C17 7 14 8 12 10Z M12 10 C10 6 6 5 4 6 C8 7 10 8 12 10Z M12 10 C16 9 20 11 21 14 C17 11 14 11 12 10Z" fill="#43a047"/></svg>`,
  clockout: `<svg viewBox="0 0 32 32"><path d="M24 4 a7 7 0 1 0 5 12 a6 6 0 1 1 -5 -12Z" fill="#ffe082"/><rect x="3" y="13" width="20" height="14" rx="3" fill="#6d4c41"/><rect x="9" y="10" width="8" height="4" rx="1.5" fill="none" stroke="#6d4c41" stroke-width="2"/>
    <rect x="3" y="18" width="20" height="2" fill="#4e342e"/><rect x="11.5" y="17" width="3" height="4" rx="1" fill="#ffd54f"/><path d="M26 22 l1 2 2 1 -2 1 -1 2 -1-2 -2-1 2-1z" fill="#fff"/></svg>`,
  broom: `<svg viewBox="0 0 32 32"><path d="M24 3 L14 17" stroke="#8d6e63" stroke-width="2.6" stroke-linecap="round"/><path d="M14 15 L19 19 L13 29 C10 28 6 25 4 22 Z" fill="#ffb74d"/>
    <path d="M8 24 L15 19 M10 26.5 L16.5 20.5 M6 21.5 L14 17.5" stroke="#e08a1e" stroke-width="1.2"/><path d="M25 12 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1-2.2 -2.2-1 2.2-1z M28 4 l.6 1.4 1.4.6 -1.4.6 -.6 1.4 -.6-1.4 -1.4-.6 1.4-.6z" fill="#b3e5fc"/></svg>`,
  basket: `<svg viewBox="0 0 32 32"><path d="M9 11 a7 6 0 0 1 14 0" fill="none" stroke="#a1887f" stroke-width="2.4"/><path d="M5 14 c2 -3 5 -4 8 -2 c2 -3 6 -3 8 -1 c2 -2 5 -1 6 3Z" fill="#f48fb1"/><path d="M12 12 c2 -3 6 -3 8 0" fill="#81d4fa"/>
    <path d="M4 14 h24 l-2.5 13 h-19Z" fill="#d7b98e"/><path d="M8 17 v8 M12 17 v8 M16 17 v8 M20 17 v8 M24 17 v8" stroke="#b08d5f" stroke-width="1.4"/></svg>`,
  star: `<svg viewBox="0 0 32 32"><path d="M16 2.5 l4 8.6 9.3 1.1 -6.9 6.4 1.9 9.2 L16 23.2 7.7 27.8 9.6 18.6 2.7 12.2 12 11.1Z" fill="#ffd54f" stroke="#f9a825" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 16 l3 3 5.5 -6" stroke="#8d6e00" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pill: `<svg viewBox="0 0 32 32"><g transform="rotate(-40 16 16)"><rect x="5" y="11" width="22" height="10" rx="5" fill="#fff"/><path d="M16 11 h6 a5 5 0 0 1 0 10 h-6Z" fill="#ef5350"/></g><path d="M24 4 l.9 2 2 .9 -2 .9 -.9 2 -.9-2 -2-.9 2-.9z" fill="#80deea"/></svg>`,
  coatrack: `<svg viewBox="0 0 32 32"><path d="M16 27 l-6 3 M16 27 l6 3" stroke="#5e3a20" stroke-width="2" stroke-linecap="round"/><rect x="15" y="6" width="2.4" height="22" rx="1.2" fill="#7a4a2a"/>
    <path d="M16 10 q-6 0 -7 -4 M16 10 q6 0 7 -4" stroke="#7a4a2a" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M9 7 q-3 8 -2 14 h5 q0 -8 -1.5 -14Z" fill="#8c2f39"/>
    <ellipse cx="16" cy="5" rx="6" ry="1.4" fill="#26262e"/><path d="M11.5 5 q0 -5 4.5 -5 q4.5 0 4.5 5Z" fill="#33333d"/><circle cx="14.6" cy="7.2" r=".8" fill="#ffe46b"/><circle cx="17.4" cy="7.2" r=".8" fill="#ffe46b"/></svg>`,
};

// ---------- what earns what ----------
// [id, icon (AW_SVG key or an emoji), award name, colour, test(task) -> bool]. First match wins.
const AWARD_KINDS = [
  ["logan", "heart", "Logan Love", "#ff4f8b", t => isLogan(t)],
  ["workout", "💪", "Pumped Up", "#ff7043", t => kindOf(t) === "workout"],
  ["gaming", "controller", "Player One", "#7c5cff", t => /\b(gam(e|es|ing)|switch|xbox|ps5|playstation|stardew|minecraft|zelda|pok[eé]mon|mario|sims|ffxiv|ff14|wow|steam)\b/.test(tx(t))],
  ["reading", "📖", "Bookworm", "#8d6e63", t => /\b(read|reading|book|novel|kindle|library)\b/.test(tx(t))],
  ["crafting", "🎨", "Artiste", "#ab47bc", t => /\b(craft|crafting|paint|draw|sketch|knit|crochet|sew|art|diamond)\b/.test(tx(t))],
  ["pamper", "🛁", "Bubble Royalty", "#4fc3f7", t => /\b(bath|pamper|spa|nails|mask|massage)\b/.test(tx(t))],
  ["outside", "🌳", "Touched Grass", "#66bb6a", t => /\b(walk|hike|outside|park|nature|beach|garden walk)\b/.test(tx(t))],
  ["molly", "🦜", "Molly Approved", "#9aa1a9", t => /\bmolly\b/.test(tx(t))],
  ["ori", "🐱", "Cat Whisperer", "#d7ccc8", t => /\b(ori|cat|kitty)\b/.test(tx(t))],
  ["music", "🎵", "Rockstar", "#ec407a", t => /\b(music|guitar|piano|sing|cello|violin|song|concert)\b/.test(tx(t))],
  ["movie", "🎬", "Movie Critic", "#5c6bc0", t => /\b(movie|film|tv|show|anime|netflix|episode|series)\b/.test(tx(t))],
  ["store", "cart", "Store Conqueror", "#2e7d32", t => /\b(store|shop|shopping|grocer(y|ies)|costco|target|walmart|safeway|qfc|fred meyer|trader|errand|errands|pick ?up|mall|pharmacy|commissary|px|buy)\b/.test(tx(t))],
  ["cooking", "🍳", "Master Chef", "#ffa726", t => /\b(cook|cooking|dinner|lunch|breakfast|meal|bake|baking|prep|recipe|food)\b/.test(tx(t))],
  ["laundry", "basket", "Laundry Slayer", "#f48fb1", t => /\b(laundry|clothes|fold|folding|washer|dryer|ironing)\b/.test(tx(t))],
  ["dishes", "🍽️", "Dish Destroyer", "#80deea", t => /\b(dish|dishes|dishwasher)\b/.test(tx(t))],
  ["trash", "🗑️", "Trash Panda", "#78909c", t => /\b(trash|garbage|recycl\w*|rubbish|bins?)\b/.test(tx(t))],
  ["cleaning", "broom", "Clean Machine", "#ffb74d", t => /\b(clean|cleaning|tidy|vacuum|mop|dust|organi[sz]e|declutter|wipe|sweep|scrub|bathroom|pickup|pick up)\b/.test(tx(t))],
  ["health", "bandaid", "Brave Patient", "#ef9a9a", t => /\b(doctor|dr|medical|appt|appointment|dentist|allergy|shot|therap\w*|clinic|pcm|sleep study|vaccine|lab|labs|blood|checkup|intake|symptom)\b/.test(tx(t))],
  ["meds", "pill", "Med Wizard", "#ef5350", t => /\b(meds?|medicine|pill|pills|vitamins?|prescription|refill)\b/.test(tx(t))],
  ["money", "💸", "Money Boss", "#43a047", t => /\b(bill|bills|pay|rent|bank|budget|tax|taxes|invoice|insurance)\b/.test(tx(t))],
  ["admin", "📮", "Admin Ninja", "#90a4ae", t => /\b(email|e-mail|call|phone|text|admin|form|forms|paperwork|application|apply|mail|letter|schedule|book an?|verify|shred)\b/.test(tx(t))],
  ["pet", "🐾", "Pet Hero", "#bcaaa4", t => /\b(pets?|vet|cage|litter|feed|dog|puppy)\b/.test(tx(t))],
  ["plants", "🌱", "Plant Parent", "#9ccc65", t => /\b(plants?|water the|garden|gardening|repot)\b/.test(tx(t))],
  ["car", "🚗", "Road Warrior", "#42a5f5", t => /\b(car|gas|oil change|tires?|drive|driving|dmv)\b/.test(tx(t))],
  ["selfcare", "🫧", "Fresh & Clean", "#b3e5fc", t => /\b(shower|skincare|skin care|hair|teeth|floss|self.?care)\b/.test(tx(t))],
  ["study", "🎓", "Big Brain", "#5e35b1", t => /\b(study|studying|class|homework|learn|course|exam|quiz|lesson|coaching)\b/.test(tx(t))],
  ["travel", "✈️", "Jet Setter", "#29b6f6", t => /\b(holiday|trip|travel|pack|packing|airport|flight|boarding|hotel)\b/.test(tx(t))],
  ["handy", "🔧", "Handy Hero", "#90a4ae", t => /\b(install|fix|repair|build|assemble|hooks?|drill|shower head|replace|repackage)\b/.test(tx(t))],
  ["rest", "😴", "Nap Champion", "#9575cd", t => /\b(nap|rest|sleep in|lie down|relax)\b/.test(tx(t))],
  ["joy", "🌈", "Joy Collector", "#ff8fc4", t => isJoy(t)],
  ["chore", "🧽", "Chore Champ", "#ffcc80", t => kindOf(t) === "chore"],
  ["event", "📅", "Showed Up", "#64b5f6", t => kindOf(t) === "event"],
  ["task", "star", "Got It Done", "#ffd54f", () => true],
];
// The day's own effects (not from a single task).
const AWARD_STATES = {
  clockout: ["clockout", "Clocked Out", "#8d6e63", "Work's done for the day"],
  dayoff: ["island", "Day Off", "#26c6da", "No work today"],
  checkin: ["📝", "Checked In", "#a593ff", "You told the planner how you feel"],
  alldone: ["🏆", "Everything Done", "#ffc107", "Every single thing on today's list"],
  coatrack: ["coatrack", "Coat Rack Sighting", "#8c2f39", "The chaos meter hit 100%. It saw you."],
  champion: ["👑", "Champion", "#ffd54f", "Won an adventure"],
  zen: ["🍃", "Zen", "#66bb6a", "Reached your fidget goal"],
  mollyin: ["🦜", "Molly Moved In", "#9aa1a9", "5 minutes of Flappy Molly"],
};
const tx = t => `${t.title || ""} ${t.notes || ""}`.toLowerCase();
const awardKindOf = t => AWARD_KINDS.find(k => { try { return k[4](t); } catch { return false; } }) || AWARD_KINDS[AWARD_KINDS.length - 1];

// Everything she's earned on a day: [{ id, icon, name, color, count, why: [...] }]
function awardsFor(day) {
  const tk = todayKey(), out = new Map();
  const add = (id, icon, name, color, why) => {
    const a = out.get(id) || { id, icon, name, color, count: 0, why: [] };
    a.count++;
    if (why && !a.why.includes(why)) a.why.push(why);
    out.set(id, a);
  };
  const n = nowLocal(), nowMin = n.getHours() * 60 + n.getMinutes();
  const over = t => kindOf(t) === "event" && t.time && t.date === day && (day < tk || (day === tk && toMin(t.time) + (t.minutes || 60) <= nowMin));
  // Work: a day off all day; on a workday, "Clocked Out" once the shift is over (or ticked off).
  const shift = workHoursFor(day);
  if (!shift) { const s = AWARD_STATES.dayoff; add("dayoff", s[0], s[1], s[2], s[3]); }
  else if (day < tk || (day === tk && toMin(shift.start) + shiftMinutes(shift) <= nowMin + (nowMin < toMin(shift.start) ? 1440 : 0))
    || tasks.some(t => isWorkShift(t) && t.date === day && t.done)) { const s = AWARD_STATES.clockout; add("clockout", s[0], s[1], s[2], s[3]); }
  // Every finished thing (an appointment counts once it's over).
  for (const t of tasks) {
    if (t.deleted || t.skipped || isWorkShift(t)) continue;
    const done = t.done && (t.doneDate || t.date) === day;
    if (!done && !(!t.done && over(t))) continue;
    const k = awardKindOf(t);
    add(k[0], k[1], k[2], k[3], t.title);
  }
  if (typeof feelingOf === "function" && (feelingOf(moods[day]) || (typeof bodyOf === "function" && bodyOf(moods[day])))) { const s = AWARD_STATES.checkin; add("checkin", s[0], s[1], s[2], s[3]); }
  const items = tasksFor(day).filter(t => !t.deleted && !isWorkShift(t));
  if (items.length && items.every(t => t.done)) { const s = AWARD_STATES.alldone; add("alldone", s[0], s[1], s[2], s[3]); }
  if (((profile.dayMarks || {}).fire || []).includes(day)) { const s = AWARD_STATES.coatrack; add("coatrack", s[0], s[1], s[2], s[3]); }
  if (typeof statusLog === "function") {
    const st = statusLog()[day] || {};
    for (const [k, id] of [["hero", "champion"], ["zen", "zen"], ["molly", "mollyin"]]) for (let i = 0; i < (st[k] || 0); i++) {
      const s = AWARD_STATES[id];
      add(id, s[0], s[1], s[2], s[3]);
    }
  }
  return [...out.values()];
}

// When each effect first showed up today (so the newest orbit the vial, and new ones can glow).
const AW_SEEN_KEY = "arpPlanner.awardsSeen";
function awardsSeen() {
  try { const s = JSON.parse(localStorage.getItem(AW_SEEN_KEY) || "null"); if (s && s.day === todayKey()) return s; } catch {}
  return { day: todayKey(), at: {} };
}
const awIcon = (icon, cls = "aw-ic") => AW_SVG[icon] ? `<span class="${cls} svg">${AW_SVG[icon]}</span>` : `<span class="${cls}">${icon}</span>`;

let awFresh = {};                        // id -> until (ms): glowing as brand new
function renderAwards(day, off) {
  const flask = $("chaos-flask");
  if (!flask) return;
  const isToday = day === todayKey();
  let list = off ? [] : awardsFor(day);
  // New today? Note when, and let it glow. (Whatever's already there the first time the planner
  // opens today just appears; only things earned after that get the glow and the "New effect!" note.)
  if (isToday) {
    const seen = awardsSeen();
    const firstLook = !seen.init;
    let changed = firstLook;
    seen.init = true;
    for (const a of list) {
      if (!(a.id in seen.at) || (seen.at[a.id + "#n"] || 0) < a.count) {
        if (!firstLook) awFresh[a.id] = Date.now() + 6000;
        seen.at[a.id] = Date.now();
        seen.at[a.id + "#n"] = a.count;
        changed = true;
        if (!firstLook && !calmMode()) setTimeout(() => showToast(`🏅 New effect: ${a.name}!${a.count > 1 ? ` (×${a.count})` : ""}`), 300);
      }
    }
    if (changed) try { localStorage.setItem(AW_SEEN_KEY, JSON.stringify(seen)); } catch {}
    list.sort((x, y) => (seen.at[y.id] || 0) - (seen.at[x.id] || 0));        // newest first
  }
  renderAwardsList = list;
  const now = Date.now();
  // The 3 newest orbit the vial.
  let orbit = flask.querySelector(".aw-orbit");
  if (!orbit) { orbit = el("div", "aw-orbit"); flask.appendChild(orbit); }
  const top = list.slice(0, 3);
  const key = top.map(a => `${a.id}${a.count}${(awFresh[a.id] || 0) > now ? "*" : ""}`).join("|") + (calmMode() ? "c" : "");
  if (orbit.dataset.key !== key) {
    orbit.dataset.key = key;
    orbit.innerHTML = "";
    top.forEach((a, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "aw-orb" + ((awFresh[a.id] || 0) > now ? " fresh" : "");
      b.style.setProperty("--aw", a.color);
      b.style.animationDelay = `${-i * (9 / Math.max(top.length, 1))}s`;
      b.title = `${a.name}${a.count > 1 ? ` ×${a.count}` : ""}`;
      b.setAttribute("aria-label", b.title);
      b.innerHTML = awIcon(a.icon) + (a.count > 1 ? `<i class="aw-n">${a.count}</i>` : "");
      b.addEventListener("click", e => { e.stopPropagation(); openAwards(day); });
      b.addEventListener("pointerdown", e => e.stopPropagation());      // (don't poke the vial)
      orbit.appendChild(b);
    });
    for (const id of Object.keys(awFresh)) if (awFresh[id] <= now) delete awFresh[id];
    if (Object.keys(awFresh).length) setTimeout(() => { if (timerPlan) renderFreeTimer(); }, 6100);
  }
  // More than 3: a little arrow that opens all of them.
  const more = $("award-more");
  more.hidden = list.length <= 3;
  if (!more.hidden) more.textContent = `🏅 ${list.length} effects ▾`;
  // The liquid swirls in the colours of what she's earned.
  const liq = $("chaos-liquid");
  let sw = liq.querySelector(".liq-swirl");
  const cols = list.slice(0, 6).map(a => a.color);
  if (!cols.length) { if (sw) sw.remove(); return; }
  if (!sw) { sw = el("div", "liq-swirl"); sw.appendChild(el("div", "liq-swirl-in")); liq.prepend(sw); }
  const ck = cols.join(",");
  if (sw.dataset.c !== ck) {
    sw.dataset.c = ck;
    const stops = [...cols, cols[0]].map((c, i, arr) => `${c} ${Math.round(i * 360 / (arr.length - 1))}deg`).join(", ");
    sw.firstChild.style.background = `conic-gradient(from 0deg, ${stops})`;
  }
}
let renderAwardsList = [];

// 🌪️ All of today's effects: a tornado of every one, plus the list of what earned them.
function openAwards(day) {
  let dlg = $("awards-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "awards-dialog";
    dlg.className = "awards-dialog";
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  const list = awardsFor(day), seen = awardsSeen();
  if (day === todayKey()) list.sort((x, y) => (seen.at[y.id] || 0) - (seen.at[x.id] || 0));
  dlg.innerHTML = "";
  const head = el("div", "focus-head");
  head.append(el("span", "focus-kicker", `🏅 ${day === todayKey() ? "Today's" : "That day's"} effects · ${list.reduce((s, a) => s + a.count, 0)}`));
  const x = el("button", "focus-close", "✕");
  x.addEventListener("click", () => dlg.close());
  head.appendChild(x);
  dlg.appendChild(head);
  // The tornado: every effect (each count too) whirling in a funnel.
  const storm = el("div", "aw-tornado");
  let pieces = list.flatMap(a => Array.from({ length: Math.min(a.count, 4) }, () => a));
  while (pieces.length && pieces.length < 16) pieces = pieces.concat(pieces);          // always a proper tornado
  for (let w = 0; w < 5; w++) {                                                        // the wind
    const ring = el("span", "aw-wind");
    ring.style.setProperty("--wy", `${24 + w * 34}px`);
    ring.style.setProperty("--ww", `${60 + (4 - w) * 44}px`);
    ring.style.animationDelay = `${-w * .4}s`;
    storm.appendChild(ring);
  }
  pieces.slice(0, 40).forEach((a, i, arr) => {
    const p = el("span", "aw-whirl");
    const lvl = i / Math.max(arr.length - 1, 1);                     // top of the funnel is wide, the bottom narrow
    p.style.setProperty("--r", `${26 + lvl * 92}px`);
    p.style.setProperty("--y", `${168 - lvl * 150}px`);
    p.style.setProperty("--d", `${1.6 + (1 - lvl) * 1.6}s`);
    p.style.animationDelay = `${-Math.random() * 3}s`;
    p.innerHTML = awIcon(a.icon, "aw-ic");
    storm.appendChild(p);
  });
  dlg.appendChild(storm);
  const grid = el("div", "aw-grid");
  for (const a of list) {
    const c = el("div", "aw-card");
    c.style.setProperty("--aw", a.color);
    const ic = el("div", "aw-card-ic");
    ic.innerHTML = awIcon(a.icon);
    const words = el("div", "aw-card-words");
    words.append(el("b", "", `${a.name}${a.count > 1 ? ` ×${a.count}` : ""}`), el("span", "", a.why.slice(0, 4).join(" · ") + (a.why.length > 4 ? " …" : "")));
    c.append(ic, words);
    grid.appendChild(c);
  }
  if (!list.length) grid.appendChild(el("p", "hint-small", "Finish anything at all and its effect shows up here. Everything counts! 💛"));
  dlg.appendChild(grid);
  dlg.showModal();
}
