// 🫧 Fidgets (Settings → bottom → Fidgets): a zen sand garden and a board of click toys.
// Gentle phone buzzes (on by default) and soft sounds (off by default), both switchable here.

let fidgetPrefCache = null;
function fidgetPrefs() {
  if (!fidgetPrefCache) {
    try { fidgetPrefCache = { buzz: true, sound: false, ...JSON.parse(localStorage.getItem("arpPlanner.fidget") || "{}") }; }
    catch { fidgetPrefCache = { buzz: true, sound: false }; }
  }
  return fidgetPrefCache;
}
function setFidgetPref(k, v) {
  fidgetPrefs()[k] = v;
  try { localStorage.setItem("arpPlanner.fidget", JSON.stringify(fidgetPrefCache)); } catch {}
}

// Little sounds, made on the spot (no files): a click, a thock, a tick.
let audioCtx = null;
function fidgetSound(kind = "click") {
  if (!fidgetPrefs().sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    const f = { click: 1800, thock: 220, tick: 3200, pop: 600 }[kind] || 1200;
    o.type = kind === "thock" ? "sine" : "square";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (kind === "pop" ? 2.2 : .5), t + .05);
    g.gain.setValueAtTime(kind === "thock" ? .25 : .06, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + (kind === "thock" ? .12 : .05));
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + .15);
  } catch {}
}
const fidgetFeel = (ms, sound) => { buzz(ms); fidgetSound(sound); };

function renderFidgets() {
  const box = $("fidget-body");
  if (!box || box.dataset.built) return;          // build once: keep her sand and toys as they are
  box.dataset.built = "1";
  box.innerHTML = "";

  const prefs = el("div", "fidget-prefs");
  for (const [k, label] of [["buzz", "📳 Gentle buzzes"], ["sound", "🔊 Soft sounds"]]) {
    const l = el("label", "ai-toggle");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!fidgetPrefs()[k];
    cb.addEventListener("change", () => setFidgetPref(k, cb.checked));
    l.append(cb, el("span", "", label));
    prefs.appendChild(l);
  }
  box.appendChild(prefs);

  // ---------- zen garden ----------
  const zen = el("div", "fidget-card");
  zen.appendChild(el("h3", "", "🏝️ Zen garden"));
  zen.appendChild(el("p", "hint-small", "Drag to rake the sand. Tap to drop a stone and watch the ripples."));
  const canvas = el("canvas", "zen-canvas");
  zen.appendChild(canvas);
  const smooth = el("button", "g-btn", "🌬️ Smooth the sand");
  zen.appendChild(smooth);
  box.appendChild(zen);
  setupZen(canvas, smooth);

  // ---------- click toys ----------
  const toys = el("div", "fidget-card");
  toys.appendChild(el("h3", "", "🔘 Click toys"));
  const board = el("div", "toy-board");

  const big = el("button", "toy-big");
  let clicks = 0;
  try { clicks = Number(localStorage.getItem("arpPlanner.clicks") || 0); } catch {}
  const count = el("div", "toy-count", `${clicks} clicks`);
  big.textContent = "CLICK";
  big.addEventListener("pointerdown", () => {
    clicks++;
    count.textContent = `${clicks} clicks`;
    try { localStorage.setItem("arpPlanner.clicks", String(clicks)); } catch {}
    fidgetFeel(18, "thock");
  });
  const bigWrap = el("div", "toy-cell");
  bigWrap.append(big, count);
  board.appendChild(bigWrap);

  const switches = el("div", "toy-cell toy-switches");
  for (let i = 0; i < 3; i++) {
    const sw = el("button", "toy-switch");
    sw.setAttribute("aria-pressed", "false");
    sw.appendChild(el("span", "knob"));
    sw.addEventListener("click", () => {
      const on = sw.getAttribute("aria-pressed") !== "true";
      sw.setAttribute("aria-pressed", String(on));
      fidgetFeel(on ? 14 : 9, "click");
    });
    switches.appendChild(sw);
  }
  board.appendChild(switches);

  const keys = el("div", "toy-cell toy-keys");
  for (const k of ["A", "R", "P", "♥", "✓"]) {
    const key = el("button", "toy-key", k);
    key.addEventListener("pointerdown", () => { key.classList.add("down"); fidgetFeel(10, "click"); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) key.addEventListener(ev, () => key.classList.remove("down"));
    keys.appendChild(key);
  }
  board.appendChild(keys);

  const sliderCell = el("div", "toy-cell");
  const slider = el("input", "toy-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = "10";
  slider.value = "5";
  let lastNotch = 5;
  slider.addEventListener("input", () => {
    if (Number(slider.value) !== lastNotch) { lastNotch = Number(slider.value); fidgetFeel(6, "tick"); }
  });
  sliderCell.append(slider, el("div", "toy-ticks", "· · · · · · · · · · ·"));
  board.appendChild(sliderCell);

  const pops = el("div", "toy-cell toy-pops");
  const popBtns = [];
  for (let i = 0; i < 12; i++) {
    const p = el("button", "toy-pop");
    p.addEventListener("click", () => {
      if (p.classList.contains("popped")) return;
      p.classList.add("popped");
      fidgetFeel(12, "pop");
      if (popBtns.every(b => b.classList.contains("popped"))) {
        setTimeout(() => { for (const b of popBtns) b.classList.remove("popped"); fidgetFeel([20, 40, 20], "thock"); }, 500);
      }
    });
    popBtns.push(p);
    pops.appendChild(p);
  }
  board.appendChild(pops);

  toys.appendChild(board);
  box.appendChild(toys);
}

function setupZen(canvas, smoothBtn) {
  const ctx = canvas.getContext("2d");
  const SAND = "#e6d6b6";
  let w = 0, h = 0, dpr = 1;
  const stones = [];

  function grain() {
    ctx.fillStyle = SAND;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 60; i++) {           // a little texture
      ctx.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.18)" : "rgba(120,95,60,.10)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
  }
  function drawStone(s) {
    for (let r = s.r + 10; r < s.r + 70; r += 9) {     // raked rings around it
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(150,118,78,.45)";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,248,232,.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(s.x - s.r / 3, s.y - s.r / 3, 2, s.x, s.y, s.r);
    g.addColorStop(0, "#9aa1a8");
    g.addColorStop(1, "#4d545c");
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r * 1.15, s.r, s.tilt, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(0,0,0,.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = "transparent";
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth || 320;
    h = 300;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    grain();
    stones.forEach(drawStone);
  }
  requestAnimationFrame(resize);
  addEventListener("resize", () => { if (!canvas.closest("[hidden]")) resize(); });

  // Rake: four tines drawn along her finger, each a groove with a light ridge beside it.
  let last = null, moved = 0, dist = 0;
  const at = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); last = at(e); moved = 0; });
  canvas.addEventListener("pointermove", e => {
    if (!last) return;
    const p = at(e), dx = p.x - last.x, dy = p.y - last.y, len = Math.hypot(dx, dy);
    if (len < 2) return;
    const nx = -dy / len, ny = dx / len;
    for (let i = -1.5; i <= 1.5; i++) {
      const o = i * 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x + nx * o, last.y + ny * o);
      ctx.lineTo(p.x + nx * o, p.y + ny * o);
      ctx.strokeStyle = "rgba(150,118,78,.55)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(last.x + nx * (o + 2.4), last.y + ny * (o + 2.4));
      ctx.lineTo(p.x + nx * (o + 2.4), p.y + ny * (o + 2.4));
      ctx.strokeStyle = "rgba(255,248,232,.6)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    moved += len;
    dist += len;
    if (dist > 60) { dist = 0; buzz(3); }
    last = p;
  });
  const end = e => {
    if (last && moved < 6 && stones.length < 7) {        // a tap: drop a stone
      const s = { ...at(e), r: 12 + Math.random() * 9, tilt: Math.random() * Math.PI };
      stones.push(s);
      drawStone(s);
      fidgetFeel(25, "thock");
    }
    last = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => { last = null; });

  smoothBtn.addEventListener("click", () => {
    stones.length = 0;
    let n = 0;
    const step = () => {                                   // sweep a fresh layer of sand over it
      ctx.fillStyle = "rgba(230,214,182,.22)";
      ctx.fillRect(0, 0, w, h);
      if (++n < 14) requestAnimationFrame(step); else grain();
    };
    step();
    fidgetFeel([10, 30, 10], "tick");
  });
}

$("open-fidgets").addEventListener("click", () => showView("fidget"));
$("fidget-back").addEventListener("click", () => { showView("settings"); openSettingsSection("open-fidgets"); });
