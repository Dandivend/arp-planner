// Appearance: light/dark mode + seasonal themes (automatic by date, or picked by hand).
// Loaded in <head> so the saved look applies before the page first paints.

const SEASONS = {
  spring: { label: "Spring", emoji: "🌸", bits: ["🌸", "🌸", "💮"], sw: "#ee93b8" },
  summer: { label: "Summer", emoji: "☀️", bits: ["✨", "🌼", "✨"], sw: "#f6bd45" },
  fall: { label: "Fall", emoji: "🍂", bits: ["🍂", "🍁", "🍂"], sw: "#ec8a42" },
  winter: { label: "Winter", emoji: "❄️", bits: ["❄️", "❄️", "✨"], sw: "#86c8ff" },
  classic: { label: "Classic grey", emoji: "🦜", bits: ["🪶"], sw: "#4fc1a6" },
};
const THEME_CACHE = "arpPlanner.theme";   // per-device copy so the look applies instantly

// Real-life season (northern hemisphere, by month): Mar-May spring, Jun-Aug summer,
// Sep-Nov fall, Dec-Feb winter.
function realSeason(d = new Date()) {
  const m = d.getMonth();
  return m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "fall" : "winter";
}

function themePref() {
  let saved = null;
  if (typeof profile !== "undefined" && profile.theme) saved = profile.theme;
  else { try { saved = JSON.parse(localStorage.getItem(THEME_CACHE)); } catch {} }
  return { mode: "dark", season: "auto", effects: true, calm: false, ...(saved || {}) };
}

// Calm mode: fewer moving, flashing and dramatic things (easier on the senses).
const calmMode = () => !!themePref().calm;

let fxKey = null;
function applyTheme() {
  const t = themePref();
  const season = t.season === "auto" ? realSeason() : t.season;
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
  if (!season) return;
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
    const b = el("button", "season-swatch" + (t.season === id ? " on" : ""));
    b.style.setProperty("--sw", s.sw);
    b.append(el("span", "dot"), `${s.emoji} ${s.label}`);
    b.addEventListener("click", () => saveTheme({ season: id }));
    seasonRow.appendChild(b);
  }
  box.appendChild(seasonRow);

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
