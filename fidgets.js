// 🫧 Fidgets (Settings → bottom → Fidgets): a zen sand garden and a board of click toys.
// Gentle phone buzzes and satisfying sounds (both on by default), switchable here.

let fidgetPrefCache = null;
function fidgetPrefs() {
  if (!fidgetPrefCache) {
    try { fidgetPrefCache = { buzz: true, sound: true, ...JSON.parse(localStorage.getItem("arpPlanner.fidget") || "{}") }; }
    catch { fidgetPrefCache = { buzz: true, sound: true }; }
  }
  return fidgetPrefCache;
}
function setFidgetPref(k, v) {
  fidgetPrefs()[k] = v;
  try { localStorage.setItem("arpPlanner.fidget", JSON.stringify(fidgetPrefCache)); } catch {}
}

// Satisfying sounds, made on the spot (no files). Each press varies a little (pitch, tone), so a
// hundred clicks never sound like a recording on repeat.
let audioCtx = null;
function fctx() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}
let fidgetBus = null;                            // everything goes through a gentle compressor: loud but never harsh
function fout(ctx) {
  if (!fidgetBus || fidgetBus.context !== ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .15;
    const g = ctx.createGain();
    g.gain.value = 1.6;
    comp.connect(g).connect(ctx.destination);
    fidgetBus = comp;
  }
  return fidgetBus;
}
const vary = (x, amt = .08) => x * (1 + (Math.random() * 2 - 1) * amt);
function tone(ctx, { at = 0, type = "sine", f0, f1 = f0, dur = .12, vol = .5, attack = .002 }) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(fout(ctx));
  o.start(t);
  o.stop(t + dur + .02);
}
let noiseBuf = null;
function noise(ctx, { at = 0, dur = .05, type = "bandpass", freq = 2000, q = 1, vol = .5, f1 = null }) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + .002);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f).connect(g).connect(fout(ctx));
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + .02);
}

const FIDGET_SOUNDS = {
  thock(ctx) {                                   // the big red button: a deep, round THOCK
    const p = vary(1, .1);
    tone(ctx, { type: "sine", f0: 165 * p, f1: 70 * p, dur: .22, vol: .9 });
    tone(ctx, { type: "triangle", f0: 330 * p, f1: 160 * p, dur: .08, vol: .35 });
    noise(ctx, { type: "lowpass", freq: 2200, dur: .045, vol: .55 });
    noise(ctx, { at: .004, freq: vary(4200), q: 3, dur: .02, vol: .3 });
  },
  click(ctx) {                                   // a toggle switch: crisp snap… and a tiny settle
    noise(ctx, { freq: vary(3400, .15), q: 4, dur: .025, vol: .75 });
    tone(ctx, { type: "square", f0: vary(1150), f1: vary(700), dur: .03, vol: .18 });
    noise(ctx, { at: .045, freq: vary(2600, .15), q: 5, dur: .018, vol: .3 });
  },
  key(ctx) {                                     // a chunky mechanical key: clack + low body
    const p = vary(1, .12);
    noise(ctx, { freq: 1900 * p, q: 2, dur: .035, vol: .8 });
    tone(ctx, { type: "sine", f0: 260 * p, f1: 140 * p, dur: .09, vol: .55 });
    noise(ctx, { at: .006, type: "highpass", freq: 5000, dur: .012, vol: .25 });
  },
  keyup(ctx) { noise(ctx, { freq: vary(2400, .15), q: 3, dur: .02, vol: .3 }); },
  tick(ctx, n = 5) {                             // slider notches: the pitch climbs as it goes up
    const f = 700 + n * 95;
    tone(ctx, { type: "triangle", f0: vary(f, .03), f1: vary(f * .9, .03), dur: .05, vol: .45 });
    noise(ctx, { freq: f * 3, q: 6, dur: .012, vol: .35 });
  },
  pop(ctx) {                                     // a pop-it bubble: boop!
    const p = vary(1, .18);
    tone(ctx, { type: "sine", f0: 260 * p, f1: 820 * p, dur: .07, vol: .8 });
    noise(ctx, { type: "bandpass", freq: 900 * p, q: 1.5, dur: .03, vol: .35 });
  },
  fanfare(ctx) {                                 // all popped: a happy little arpeggio
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, { at: i * .08, type: "triangle", f0: f, dur: .22, vol: .45 }));
  },
  stone(ctx) {                                   // a pebble settling into sand
    tone(ctx, { type: "sine", f0: vary(210), f1: 120, dur: .16, vol: .5 });
    noise(ctx, { type: "lowpass", freq: 900, dur: .25, vol: .35, f1: 300 });
  },
  wave(ctx) {                                    // the wave washing over the sand: a long, soft whoosh
    noise(ctx, { type: "bandpass", freq: 300, f1: 1400, q: .6, dur: .9, vol: .5 });
    noise(ctx, { at: .7, type: "bandpass", freq: 1400, f1: 260, q: .6, dur: 1.3, vol: .45 });
    noise(ctx, { at: 1.1, type: "highpass", freq: 3500, dur: .9, vol: .08 });   // fizzy foam
  },
};
function fidgetSound(kind = "click", arg) {
  if (!fidgetPrefs().sound) return;
  const ctx = fctx();
  if (ctx && FIDGET_SOUNDS[kind]) { try { FIDGET_SOUNDS[kind](ctx, arg); } catch {} }
}

// Raking sand: a soft, continuous shhhh that follows how fast her finger moves.
const sandSound = {
  src: null, gain: null,
  start() {
    if (!fidgetPrefs().sound || this.src) return;
    const ctx = fctx();
    if (!ctx) return;
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {              // pink-ish noise: warm, like grains of sand
      const w = Math.random() * 2 - 1;
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * .1848) * .2;
    }
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; src.loop = true;
    bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = .5;
    lp.type = "lowpass"; lp.frequency.value = 3200;
    g.gain.value = .0001;
    src.connect(bp).connect(lp).connect(g).connect(fout(ctx));
    src.start();
    this.src = src; this.gain = g; this.bp = bp;
  },
  speed(px) {                                    // px moved this frame
    if (!this.gain) return;
    const ctx = fctx(), t = ctx.currentTime;
    this.avg = (this.avg || 0) * .6 + px * .4;    // smoothed, so it swells and settles like real sand
    this.gain.gain.setTargetAtTime(Math.min(.55, this.avg / 28), t, .09);
    this.bp.frequency.setTargetAtTime(800 + this.avg * 25, t, .08);
    // Holding her finger still: the sand goes quiet (a soft fade), and fades back in when she moves.
    clearTimeout(this.hush);
    this.hush = setTimeout(() => {
      if (!this.gain) return;
      this.avg = 0;
      this.gain.gain.setTargetAtTime(.0001, fctx().currentTime, .2);
    }, 80);
  },
  stop() {
    clearTimeout(this.hush);
    if (!this.src) return;
    const ctx = fctx(), src = this.src;
    this.gain.gain.setTargetAtTime(.0001, ctx.currentTime, .12);
    setTimeout(() => { try { src.stop(); } catch {} }, 600);
    this.src = this.gain = null;
  },
};

const fidgetFeel = (ms, sound, arg) => { buzz(ms); fidgetSound(sound, arg); };

// 🧘 Fidget time: the seconds she's really playing here (touched in the last 15 seconds) or
// breathing with the calm timer. Every 3 minutes of it makes the chaos vial glow a mindful teal
// for an hour (just a look: the real chaos numbers don't change).
const MINDFUL_AFTER = 180;
const FIDGET_TIME_KEY = "arpPlanner.fidgetTime";
let fidgetTouch = 0;
function fidgetTime() {
  const fresh = { day: todayKey(), sec: 0, toward: 0 };
  try { const f = JSON.parse(localStorage.getItem(FIDGET_TIME_KEY) || "null"); return f && f.day === fresh.day ? f : fresh; } catch { return fresh; }
}
function showFidgetMinutes() {
  const line = $("fidget-minutes");
  if (!line) return;
  const f = fidgetTime(), m = Math.floor(f.sec / 60);
  const mindful = typeof vialFx === "function" && vialFx().mindful;
  line.textContent = `🧘 ${m ? `${m} min` : "Under a minute"} of fidget time today` +
    (mindful ? " · your chaos vial is glowing teal 💙" : ` · ${Math.max(1, Math.ceil((MINDFUL_AFTER - (f.toward || 0)) / 60))} more min for a mindful glow`);
}
for (const ev of ["pointerdown", "pointermove", "keydown"]) addEventListener(ev, e => {
  if (e.target && e.target.closest && e.target.closest("#fidget-body")) fidgetTouch = Date.now();
}, { capture: true, passive: true });
setInterval(() => {
  const breathing = typeof breath !== "undefined" && breath && !breath.paused && !breath.done;
  const playing = typeof view !== "undefined" && view === "fidget" && !document.hidden && Date.now() - fidgetTouch < 15000;
  if (!breathing && !playing) return;
  const f = fidgetTime();
  f.sec++;
  if (!(typeof vialFx === "function" && vialFx().mindful)) f.toward = (f.toward || 0) + 1;
  if (f.toward >= MINDFUL_AFTER && typeof setVialFx === "function") {
    f.toward = 0;
    setVialFx("mindful", 60);
    showToast("🧘 Mindful moment! Your chaos vial glows teal for the next hour 💙");
  }
  try { localStorage.setItem(FIDGET_TIME_KEY, JSON.stringify(f)); } catch {}
  if (f.sec % 5 === 0 || f.toward === 0) showFidgetMinutes();
}, 1000);

function renderFidgets() {
  const box = $("fidget-body");
  if (!box || box.dataset.built) return;          // build once: keep her sand and toys as they are
  box.dataset.built = "1";
  box.innerHTML = "";

  const prefs = el("div", "fidget-prefs");
  for (const [k, label] of [["buzz", "📳 Gentle buzzes"], ["sound", "🔊 Sounds"]]) {
    const l = el("label", "ai-toggle");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!fidgetPrefs()[k];
    cb.addEventListener("change", () => setFidgetPref(k, cb.checked));
    l.append(cb, el("span", "", label));
    prefs.appendChild(l);
  }
  box.appendChild(prefs);
  const minutes = el("p", "fidget-minutes", "");
  minutes.id = "fidget-minutes";
  box.appendChild(minutes);
  showFidgetMinutes();

  // ---------- calm timer ----------
  const calm = el("div", "fidget-card");
  calm.appendChild(el("h3", "", "🫁 Calm timer"));
  calm.appendChild(el("p", "hint-small", "Permission to breathe. Pick a length: it keeps the screen on, and can chime and show a notice on your lock screen when it's done."));
  const row = el("div", "calm-times");
  for (const m of [3, 5, 10, 15, 20]) {
    const b = el("button", "g-btn", `${m} min`);
    b.addEventListener("click", () => openBreather("calm", m));
    row.appendChild(b);
  }
  calm.appendChild(row);
  box.appendChild(calm);

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
    key.addEventListener("pointerdown", () => { key.classList.add("down"); fidgetFeel(10, "key"); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) key.addEventListener(ev, () => {
      if (key.classList.contains("down")) fidgetSound("keyup");
      key.classList.remove("down");
    });
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
    if (Number(slider.value) !== lastNotch) { lastNotch = Number(slider.value); fidgetFeel(6, "tick", lastNotch); }
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
        setTimeout(() => { for (const b of popBtns) b.classList.remove("popped"); fidgetFeel([20, 40, 20], "fanfare"); }, 500);
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

  // A sheet of fresh, smooth sand (kept off screen; the wave pours it back over her raking).
  let fresh = null;
  function makeFresh() {
    fresh = document.createElement("canvas");
    fresh.width = w * dpr; fresh.height = h * dpr;
    const f = fresh.getContext("2d");
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.fillStyle = SAND;
    f.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 60; i++) {            // a little texture
      f.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.18)" : "rgba(120,95,60,.10)";
      f.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
  }
  function pour(x) {                                    // fresh sand from the left edge up to x
    if (x <= 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fresh, 0, 0, Math.min(fresh.width, x * dpr), fresh.height, 0, 0, Math.min(fresh.width, x * dpr), fresh.height);
    ctx.restore();
  }
  function grain() { makeFresh(); pour(w); }
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
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); last = at(e); moved = 0; sandSound.start(); });
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
    sandSound.speed(len);
    if (dist > 60) { dist = 0; buzz(3); }
    last = p;
  });
  const end = e => {
    if (last && moved < 6 && stones.length < 7) {        // a tap: drop a stone
      const s = { ...at(e), r: 12 + Math.random() * 9, tilt: Math.random() * Math.PI };
      stones.push(s);
      drawStone(s);
      fidgetFeel(25, "stone");
    }
    last = null;
    sandSound.stop();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => { last = null; sandSound.stop(); });

  // A wave washes across from left to right, leaving smooth sand behind it.
  let washing = false;
  smoothBtn.addEventListener("click", () => {
    if (washing) return;
    washing = true;
    stones.length = 0;
    const t0 = performance.now(), dur = calmMode() ? 2600 : 1900;
    const ease = t => 1 - Math.pow(1 - t, 2.2);
    fidgetSound("wave");
    buzz([15, 60, 25, 80, 15]);
    const frame = now => {
      const t = Math.min(1, (now - t0) / dur), x = ease(t) * (w + 90) - 40;
      pour(x - 26);
      // wet, darker sand just behind the wave, then the foamy, wobbly crest
      const wet = ctx.createLinearGradient(x - 90, 0, x - 20, 0);
      wet.addColorStop(0, "rgba(150,118,78,0)");
      wet.addColorStop(1, "rgba(150,118,78,.28)");
      ctx.fillStyle = wet;
      ctx.fillRect(Math.max(0, x - 90), 0, 70, h);
      ctx.beginPath();
      ctx.moveTo(x - 30, 0);
      for (let y = 0; y <= h; y += 6) ctx.lineTo(x + Math.sin(y / 23 + now / 140) * 9 + Math.sin(y / 9 + now / 90) * 3, y);
      ctx.lineTo(x - 30, h);
      ctx.closePath();
      const foam = ctx.createLinearGradient(x - 30, 0, x + 10, 0);
      foam.addColorStop(0, "rgba(120,190,215,.35)");
      foam.addColorStop(.7, "rgba(235,248,252,.85)");
      foam.addColorStop(1, "rgba(255,255,255,.95)");
      ctx.fillStyle = foam;
      ctx.fill();
      if (t < 1) requestAnimationFrame(frame);
      else { pour(w); washing = false; }
    };
    requestAnimationFrame(frame);
  });
}

$("open-fidgets").addEventListener("click", () => showView("fidget"));
$("fidget-back").addEventListener("click", () => { showView("settings"); openSettingsSection("open-fidgets"); });
