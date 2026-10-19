// Appearance: light/dark mode + seasonal themes (automatic by date, or picked by hand).
// Loaded in <head> so the saved look applies before the page first paints.

const SEASONS = {
  spring: { label: "Spring", emoji: "🌸", bits: ["🌸", "🌸", "💮"], sw: "#ee93b8" },
  summer: { label: "Summer", emoji: "☀️", bits: ["✨", "🌼", "✨"], sw: "#f6bd45" },
  fall: { label: "Fall", emoji: "🍂", bits: ["🍂", "🍁", "🍂"], sw: "#ec8a42" },
  winter: { label: "Winter", emoji: "❄️", bits: ["❄️", "❄️", "✨"], sw: "#86c8ff" },
  classic: { label: "Classic teal", emoji: "🪶", bits: ["🪶"], sw: "#4fc1a6" },
  // Animal themes: her goats, an African grey, and Ori (a Siamese: cream, dark points, blue eyes).
  goat: { label: "Goat", emoji: "🐐", bits: ["🐐", "🌿", "🌾"], sw: "#c9a27a", animal: true },
  grey: { label: "African grey", emoji: "🦜", bits: ["🪶", "🪶", "❤️"], sw: "#e5484e", animal: true },
  ori: { label: "Ori the cat", emoji: "🐱", bits: ["🐾", "🐾", "💙"], sw: "#5ab8ff", animal: true },
  pets: { label: "Ori & Molly", emoji: "🐾", bits: ["🐾", "🪶", "💙", "❤️"], sw: "#8a7cf0", animal: true },
  // Holidays (they also switch on by themselves around the date, with the Automatic theme).
  halloween: { label: "Halloween", emoji: "🎃", bits: ["🎃", "😈", "🧙‍♀️", "🦇", "👻", "🎃", "🧙", "🕷️"], sw: "#ff8a1f", holiday: true },
  thanksgiving: { label: "Thanksgiving", emoji: "🦃", bits: ["🦃", "🍂", "🥧", "🌽", "🍁"], sw: "#c9772e", holiday: true },
  christmas: { label: "Christmas", emoji: "🎄", bits: ["🎄", "🎅", "🎁", "⛄", "❄️", "🦌", "🔔", "⭐"], sw: "#2fae5c", holiday: true },
  newyear: { label: "New Year's", emoji: "🎉", bits: ["🎉", "🥂", "✨", "🎆", "🎊"], sw: "#e7c14a", holiday: true },
  valentines: { label: "Valentine's", emoji: "💘", bits: ["💘", "💖", "💌", "🌹", "💕", "🍫"], sw: "#ff5d8f", holiday: true },
  stpatricks: { label: "St. Patrick's", emoji: "☘️", bits: ["☘️", "🍀", "🌈", "🪙"], sw: "#3fbf5f", holiday: true },
  easter: { label: "Easter", emoji: "🐣", bits: ["🥚", "🐣", "🐰", "🌷", "🐥", "🥕"], sw: "#c99cf2", holiday: true },
  july4: { label: "4th of July", emoji: "🎆", bits: ["🎆", "🇺🇸", "⭐", "🎇", "🌭"], sw: "#4a7dff", holiday: true },
};
const HOLIDAY_THEMES = Object.keys(SEASONS).filter(k => SEASONS[k].holiday);

// Easter Sunday (Gregorian, "anonymous" algorithm).
function easterOf(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
// Which holiday (if any) is close: its theme runs for a stretch before the day itself.
function holidayNear(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const inRange = (m1, d1, m2, d2) => (m > m1 || (m === m1 && day >= d1)) && (m < m2 || (m === m2 && day <= d2));
  const daysTo = t => Math.round((new Date(y, t.getMonth(), t.getDate()) - new Date(y, m - 1, day)) / 864e5);
  if (inRange(10, 10, 10, 31)) return "halloween";
  const nov1 = new Date(y, 10, 1), thanks = new Date(y, 10, 1 + ((4 - nov1.getDay() + 7) % 7) + 21);
  if (m === 11 && daysTo(thanks) >= 0 && daysTo(thanks) <= 6) return "thanksgiving";
  if (inRange(12, 1, 12, 26)) return "christmas";
  if (inRange(12, 30, 12, 31) || inRange(1, 1, 1, 1)) return "newyear";
  if (inRange(2, 7, 2, 14)) return "valentines";
  if (inRange(3, 12, 3, 17)) return "stpatricks";
  const e = daysTo(easterOf(y));
  if (e >= 0 && e <= 7) return "easter";
  if (inRange(7, 1, 7, 4)) return "july4";
  return null;
}
const ANIMAL_THEMES = ["goat", "grey", "ori", "pets"];
const THEME_CACHE = "arpPlanner.theme";   // per-device copy so the look applies instantly

// Real-life season (northern hemisphere, by month): Mar-May spring, Jun-Aug summer,
// Sep-Nov fall, Dec-Feb winter.
function realSeason(d = new Date()) {
  const m = d.getMonth();
  return m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "fall" : "winter";
}

// "Animal of the day": one of the animal themes, picked fresh each day (the same all day).
function animalOfDay(d = new Date()) {
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ANIMAL_THEMES[(h >>> 0) % ANIMAL_THEMES.length];
}
function currentThemeName() {
  const t = themePref();
  if (t.season === "auto") return (t.holidays !== false && holidayNear()) || realSeason();
  return t.season === "animals" ? animalOfDay() : SEASONS[t.season] ? t.season : "fall";
}

function themePref() {
  let saved = null;
  if (typeof profile !== "undefined" && profile.theme) saved = profile.theme;
  else { try { saved = JSON.parse(localStorage.getItem(THEME_CACHE)); } catch {} }
  return { mode: "dark", season: "auto", effects: true, calm: false, ...(saved || {}) };
}

// Calm mode: fewer moving, flashing and dramatic things (easier on the senses).
const calmMode = () => !!themePref().calm;

let fxKey = null, mollyTimer = null;
// Photos of their pets that peek in on their themes: <dir>/<dir>-1.webp … (add more: raise count).
const PET_PICS = { molly: 11, ori: 40 };       // Molly the African grey, Ori the Siamese
const THEME_PETS = { grey: ["molly"], ori: ["ori"], pets: ["ori", "molly"] };
function applyTheme() {
  const t = themePref();
  const season = currentThemeName();
  const root = document.documentElement;
  root.dataset.mode = t.mode;
  root.dataset.season = season;
  root.dataset.calm = t.calm ? "on" : "off";
  try { localStorage.setItem(THEME_CACHE, JSON.stringify(t)); } catch {}
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = `ARP Planner ${SEASONS[season].emoji}`;
  renderSeasonFx(t.effects && !t.calm ? season : null);
}

// A handful of slowly drifting petals / leaves / snowflakes behind the page.
function renderSeasonFx(season) {
  if (!document.body || fxKey === season) return;
  fxKey = season;
  let box = document.getElementById("season-fx");
  if (!box) {
    box = document.createElement("div");
    box.id = "season-fx";
    box.setAttribute("aria-hidden", "true");
    document.body.prepend(box);
  }
  box.innerHTML = "";
  clearInterval(mollyTimer);
  if (!season) { document.getElementById("molly-peek")?.remove(); return; }
  if (THEME_PETS[season] && location.protocol.startsWith("http")) startPets(THEME_PETS[season]);
  else document.getElementById("molly-peek")?.remove();
  const bits = SEASONS[season].bits;
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("span");
    s.className = "fx-bit";
    s.textContent = bits[i % bits.length];
    s.style.left = `${(i * 4.7 + Math.random() * 5) % 100}vw`;
    s.style.fontSize = `${18 + Math.random() * 16}px`;
    const fall = 16 + Math.random() * 14, sway = 3 + Math.random() * 3;
    s.style.animationDuration = `${fall}s, ${sway}s`;
    s.style.animationDelay = `${-Math.random() * fall}s, ${-Math.random() * sway}s`;
    box.appendChild(s);
  }
}

// Pet themes: now and then Molly (or Ori, or both taking turns) peeks in from the left or right
// edge of the screen, has a look around, and slides back out. (Small, see-through to taps.)
function startPets(pets) {
  let peek = document.getElementById("molly-peek");
  if (!peek) {
    peek = document.createElement("div");
    peek.id = "molly-peek";
    peek.setAttribute("aria-hidden", "true");
    document.body.appendChild(peek);
  }
  peek.innerHTML = "";
  const last = {};
  let turn = Math.floor(Math.random() * pets.length);
  const show = () => {
    if (document.hidden || !document.getElementById("molly-peek")) return;
    const pet = pets[turn++ % pets.length];
    let pic;
    do pic = `${pet}/${pet}-${1 + Math.floor(Math.random() * PET_PICS[pet])}.webp`; while (pic === last[pet] && PET_PICS[pet] > 1);
    last[pet] = pic;
    const img = new Image();
    const side = Math.random() < 0.5 ? "left" : "right";
    img.className = "molly-pop " + side;
    img.alt = "";
    img.src = pic;
    img.style.top = `${18 + Math.random() * 58}vh`;
    img.style.height = `${100 + Math.random() * 40}px`;
    img.style.setProperty("--tilt", `${(side === "left" ? 1 : -1) * (4 + Math.random() * 8)}deg`);
    peek.appendChild(img);
    setTimeout(() => img.remove(), 6200);
  };
  setTimeout(show, 1500);
  mollyTimer = setInterval(show, 8000);
}

async function saveTheme(changes) {
  const theme = { ...themePref(), ...changes };
  profile = { ...profile, theme };
  applyTheme();
  render();
  try {
    await pushProfile();
  } catch {
    showError("Couldn't save your theme. Try closing and reopening the planner.");
  }
}

// Settings → Appearance.
function renderAppearance() {
  const t = themePref();
  const box = $("appearance-settings");
  box.innerHTML = "";

  const modeRow = el("div", "theme-row");
  modeRow.appendChild(el("span", "fit-label", "Mode"));
  for (const [id, label] of [["light", "☀️ Light"], ["dark", "🌙 Dark"]]) {
    const b = el("button", "season-swatch" + (t.mode === id ? " on" : ""), label);
    b.addEventListener("click", () => saveTheme({ mode: id }));
    modeRow.appendChild(b);
  }
  box.appendChild(modeRow);

  const seasonRow = el("div", "theme-row");
  seasonRow.appendChild(el("span", "fit-label", "Theme"));
  const now = (t.holidays !== false && holidayNear()) || realSeason();
  const auto = el("button", "season-swatch" + (t.season === "auto" ? " on" : ""));
  auto.style.setProperty("--sw", SEASONS[now].sw);
  auto.append(el("span", "dot"), `🔄 Automatic (now ${SEASONS[now].label} ${SEASONS[now].emoji})`);
  auto.title = "Changes by itself with the real seasons";
  auto.addEventListener("click", () => saveTheme({ season: "auto" }));
  seasonRow.appendChild(auto);
  for (const [id, s] of Object.entries(SEASONS)) {
    if (s.animal || s.holiday) continue;
    const b = el("button", "season-swatch" + (t.season === id ? " on" : ""));
    b.style.setProperty("--sw", s.sw);
    b.append(el("span", "dot"), `${s.emoji} ${s.label}`);
    b.addEventListener("click", () => saveTheme({ season: id }));
    seasonRow.appendChild(b);
  }
  box.appendChild(seasonRow);

  // Holidays.
  const holRow = el("div", "theme-row");
  holRow.appendChild(el("span", "fit-label", "Holidays"));
  for (const id of HOLIDAY_THEMES) {
    const s = SEASONS[id];
    const b = el("button", "season-swatch" + (t.season === id ? " on" : ""));
    b.style.setProperty("--sw", s.sw);
    b.append(el("span", "dot"), `${s.emoji} ${s.label}`);
    b.addEventListener("click", () => saveTheme({ season: id }));
    holRow.appendChild(b);
  }
  box.appendChild(holRow);
  const holAuto = el("label", "check");
  const hcb = el("input");
  hcb.type = "checkbox";
  hcb.checked = t.holidays !== false;
  hcb.addEventListener("change", () => saveTheme({ holidays: hcb.checked }));
  holAuto.append(hcb, " 🎉 With Automatic, holiday themes switch on by themselves (Halloween from Oct 10, Christmas from Dec 1, and so on)");
  box.appendChild(holAuto);

  // Animal themes, plus one that picks a different animal each day.
  const animalRow = el("div", "theme-row");
  animalRow.appendChild(el("span", "fit-label", "Animals"));
  for (const id of ANIMAL_THEMES) {
    const s = SEASONS[id];
    const b = el("button", "season-swatch" + (t.season === id ? " on" : ""));
    b.style.setProperty("--sw", s.sw);
    b.append(el("span", "dot"), `${s.emoji} ${s.label}`);
    b.addEventListener("click", () => saveTheme({ season: id }));
    animalRow.appendChild(b);
  }
  const today = SEASONS[animalOfDay()];
  const rnd = el("button", "season-swatch" + (t.season === "animals" ? " on" : ""));
  rnd.style.setProperty("--sw", today.sw);
  rnd.append(el("span", "dot"), `🎲 Animal of the day (today: ${today.emoji} ${today.label})`);
  rnd.title = "A different animal theme each day, picked at random";
  rnd.addEventListener("click", () => saveTheme({ season: "animals" }));
  animalRow.appendChild(rnd);
  box.appendChild(animalRow);

  // Who runs across a finished task.
  const critRow = el("div", "theme-row");
  critRow.appendChild(el("span", "fit-label", "Task-done animal"));
  for (const [id, label] of [["any", "🎲 Any, at random"], ["theme", "🎨 Match my animal theme"], ["goat", "🐐 Goat"],
    ["parrot", "🦜 Grey"], ["husky", "🐺 Husky"], ["cat", "🐱 Ori"]]) {
    const b = el("button", "season-swatch" + ((t.critter || "any") === id ? " on" : ""), label);
    if (id === "theme") b.title = "Goat theme → goat, African grey → parrot, Ori → Ori, Ori & Molly → both. Other themes: any animal.";
    b.addEventListener("click", () => saveTheme({ critter: id }));
    critRow.appendChild(b);
  }
  box.appendChild(critRow);

  const fx = el("label", "check");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = t.effects;
  cb.addEventListener("change", () => saveTheme({ effects: cb.checked }));
  fx.append(cb, " ✨ Floating theme bits in the background (petals, leaves, snow, pumpkins and witches, paw prints, Molly and Ori peeking in…)");
  box.appendChild(fx);

  const snd = el("label", "check");
  const scb = el("input");
  scb.type = "checkbox";
  scb.checked = !!t.sounds;
  scb.addEventListener("change", () => { saveTheme({ sounds: scb.checked }); if (scb.checked && typeof playAnimalSound === "function") setTimeout(() => playAnimalSound("parrot"), 100); });
  snd.append(scb, " 🔊 Sound effects: each animal makes its sound when you finish a task (chirp, meow, bleat, awoo), and the chaos vial tinks and rumbles");
  box.appendChild(snd);

  const calm = el("label", "check calm-check");
  const ccb = el("input");
  ccb.type = "checkbox";
  ccb.checked = t.calm;
  ccb.addEventListener("change", () => saveTheme({ calm: ccb.checked }));
  calm.append(ccb, " 🌙 Calm mode: no animal run-ups, fire, explosions, glowing or falling bits. Just a quiet ✓ (easier on the senses)");
  box.appendChild(calm);
}

applyTheme();
document.addEventListener("DOMContentLoaded", applyTheme);
