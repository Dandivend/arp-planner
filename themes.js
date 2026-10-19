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
};
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
  return t.season === "auto" ? realSeason() : t.season === "animals" ? animalOfDay() : SEASONS[t.season] ? t.season : "fall";
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
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("span");
    s.className = "fx-bit";
    s.textContent = bits[i % bits.length];
    s.style.left = `${(i * 7.3 + Math.random() * 6) % 100}vw`;
    s.style.fontSize = `${14 + Math.random() * 12}px`;
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
  const now = realSeason();
  const auto = el("button", "season-swatch" + (t.season === "auto" ? " on" : ""));
  auto.style.setProperty("--sw", SEASONS[now].sw);
  auto.append(el("span", "dot"), `🔄 Automatic (now ${SEASONS[now].label} ${SEASONS[now].emoji})`);
  auto.title = "Changes by itself with the real seasons";
  auto.addEventListener("click", () => saveTheme({ season: "auto" }));
  seasonRow.appendChild(auto);
  for (const [id, s] of Object.entries(SEASONS)) {
    if (s.animal) continue;
    const b = el("button", "season-swatch" + (t.season === id ? " on" : ""));
    b.style.setProperty("--sw", s.sw);
    b.append(el("span", "dot"), `${s.emoji} ${s.label}`);
    b.addEventListener("click", () => saveTheme({ season: id }));
    seasonRow.appendChild(b);
  }
  box.appendChild(seasonRow);

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
  fx.append(cb, " Falling petals / leaves / snow in the background");
  box.appendChild(fx);

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
