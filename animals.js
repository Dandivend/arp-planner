// "Task done" celebrations: a random animal (goat, African grey parrot or husky)
// crosses the task row and draws the strike-through line as it goes.
//
// The goat is an inline SVG facing right (styled after the tan, navy-horned goat
// picked from LottieFiles). `contact` is the point of each animal (as fractions of
// its box) that touches the line: the goat's muzzle, the parrot's beak, the
// husky's paws.

const GOAT_SVG = `
<svg viewBox="0 0 160 120">
  <defs>
    <linearGradient id="goatBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b59a7d"/><stop offset="1" stop-color="#93785e"/>
    </linearGradient>
  </defs>
  <g class="leg alt"><rect x="60" y="66" width="10" height="20" rx="4" fill="#7c644d"/>
    <g class="shin alt"><rect x="61" y="83" width="8" height="21" rx="3" fill="#7c644d"/><rect x="60.5" y="101" width="9" height="6" rx="2" fill="#23283c"/></g></g>
  <g class="leg"><rect x="106" y="64" width="10" height="20" rx="4" fill="#7c644d"/>
    <g class="shin"><rect x="107" y="81" width="8" height="23" rx="3" fill="#7c644d"/><rect x="106.5" y="101" width="9" height="6" rx="2" fill="#23283c"/></g></g>
  <path class="tail" d="M45 50 Q32 44 33 31 Q42 37 49 45 Z" fill="#8c735a"/>
  <path d="M44 57 Q41 40 64 38 L106 36 Q125 37 127 54 Q128 72 111 76 L61 78 Q45 76 44 57 Z" fill="url(#goatBody)"/>
  <path d="M58 73 Q84 82 113 72 Q111 78 104 79 L65 80 Q58 79 58 73 Z" fill="#d0baa1"/>
  <path d="M47 60 Q49 46 63 44 Q55 52 57 71 Z" fill="#7f6750" opacity=".45"/>
  <path d="M64 41 Q86 36 110 40" stroke="#c7ae92" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
  <g class="leg"><rect x="50" y="62" width="12" height="24" rx="5" fill="#a28768"/>
    <g class="shin"><rect x="52" y="83" width="8" height="21" rx="3" fill="#a28768"/><rect x="51.5" y="101" width="9" height="6" rx="2" fill="#2c3048"/></g></g>
  <g class="leg alt"><rect x="97" y="62" width="11" height="22" rx="5" fill="#a28768"/>
    <g class="shin alt"><rect x="98.5" y="81" width="8" height="23" rx="3" fill="#a28768"/><rect x="98" y="101" width="9" height="6" rx="2" fill="#2c3048"/></g></g>
  <path d="M106 44 Q111 25 125 18 L138 25 Q128 38 122 62 Q111 60 106 44 Z" fill="#a88d70"/>
  <path d="M121 61 Q125 41 135 30 L138 33 Q130 44 126 61 Z" fill="#c6af95"/>
  <g class="head">
    <path d="M126 16 C122 3 110 -1 99 6" stroke="#252a41" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="134" cy="24" rx="13" ry="11" fill="#a88d70"/>
    <path d="M133 15 Q150 17 156 31 Q156 40 148 41 Q137 40 132 31 Z" fill="#b69d81"/>
    <ellipse cx="151" cy="36" rx="6.5" ry="5.5" fill="#d4bfa7"/>
    <ellipse cx="155" cy="33.5" rx="1.4" ry="1" fill="#4a3a2c"/>
    <path d="M147 40 Q150 42 153 40" stroke="#6d5843" stroke-width="1" fill="none"/>
    <path d="M130 14 C128 -2 114 -6 102 2" stroke="#2f3550" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="M129 10 C126 0 116 -3 106 1" stroke="#4f5779" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M125 1 l2 3 M119 -1 l1 3.5 M113 -1 l0 3.5" stroke="#252a41" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M126 22 Q112 20 104 28 Q114 32 128 27 Z" fill="#a88d70"/>
    <path d="M124 23 Q113 22 107.5 27.5 Q115 29.5 125 26 Z" fill="#eaa1aa"/>
    <ellipse cx="138" cy="21" rx="2.8" ry="3" fill="#1f1a17"/>
    <circle cx="138.9" cy="20" r="0.9" fill="#fff"/>
    <path d="M134.5 16.5 Q138 15 141.5 17" stroke="#8c735a" stroke-width="1.2" fill="none"/>
    <path d="M144 40 Q142 50 138 56 Q146 53 149 41 Z" fill="#7c644d"/>
  </g>
</svg>`;

const PARROT_SVG = `
<svg viewBox="0 0 120 80">
  <path d="M12 33 Q6 42 12 51 L34 46 L34 37 Z" fill="#d12d33"/>
  <path d="M13 38 L28 40 M13 46 L28 44" stroke="#a51f25" stroke-width="1.5"/>
  <path class="wing far" d="M48 38 Q58 8 76 34 Z" fill="#5c6168"/>
  <ellipse cx="56" cy="42" rx="28" ry="13" fill="#8c9197"/>
  <path d="M38 45 Q56 55 76 45" fill="none" stroke="#a5aab0" stroke-width="2.5"/>
  <path d="M44 41 Q58 49 72 41" fill="none" stroke="#a5aab0" stroke-width="2"/>
  <circle cx="86" cy="35" r="13" fill="#a3a8ae"/>
  <path d="M76 30 Q80 26 84 30 M77 37 Q81 33 85 37" fill="none" stroke="#bcc0c5" stroke-width="1.5"/>
  <ellipse cx="91" cy="35" rx="7.5" ry="7" fill="#eceef0"/>
  <circle cx="92" cy="33.5" r="2.7" fill="#f2e6a8"/>
  <circle cx="92.4" cy="33.5" r="1.3" fill="#111"/>
  <path d="M97 28 Q110 30 104 44 Q99 41 96 37 Z" fill="#1c1c1e"/>
  <path class="wing" d="M42 38 Q58 -2 84 34 Z" fill="#747980"/>
  <path d="M50 30 Q60 14 74 30" fill="none" stroke="#8d9299" stroke-width="2"/>
  <path d="M60 54 l-3 6 M67 54 l-1 6" stroke="#3a3a3c" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const HUSKY_SVG = `
<svg viewBox="0 0 140 100">
  <g class="leg alt"><rect x="44" y="54" width="8" height="18" rx="3" fill="#545b64"/><rect x="44" y="68" width="8" height="18" rx="3" fill="#d9dce1"/></g>
  <g class="leg"><rect x="84" y="54" width="8" height="18" rx="3" fill="#545b64"/><rect x="84" y="68" width="8" height="18" rx="3" fill="#d9dce1"/></g>
  <path d="M31 44 Q6 36 13 12 Q24 16 26 30 Q28 38 37 40 Z" fill="#5d646d"/>
  <circle cx="14" cy="14" r="4.5" fill="#f1f2f4"/>
  <ellipse cx="62" cy="50" rx="34" ry="16" fill="#6b727c"/>
  <path d="M40 42 Q60 36 84 42" fill="none" stroke="#5a616a" stroke-width="3"/>
  <ellipse cx="64" cy="59" rx="26" ry="7" fill="#eef0f3"/>
  <g class="leg"><rect x="34" y="54" width="9" height="18" rx="3" fill="#6b727c"/><rect x="34" y="68" width="9" height="18" rx="3" fill="#eef0f3"/></g>
  <g class="leg alt"><rect x="78" y="54" width="9" height="18" rx="3" fill="#6b727c"/><rect x="78" y="68" width="9" height="18" rx="3" fill="#eef0f3"/></g>
  <ellipse cx="96" cy="41" rx="10" ry="13" fill="#6b727c"/>
  <ellipse cx="93" cy="53" rx="11" ry="12" fill="#eef0f3"/>
  <path d="M96 30 L99 11 L107 27 Z" fill="#5a6169"/>
  <path d="M103 27 L110 9 L115 27 Z" fill="#5a6169"/>
  <path d="M106 26 L110 15 L112 26 Z" fill="#d9a7a7"/>
  <ellipse cx="108" cy="36" rx="15" ry="12" fill="#6b727c"/>
  <ellipse cx="112" cy="41" rx="10" ry="7" fill="#eef0f3"/>
  <ellipse cx="122" cy="42" rx="10" ry="6" fill="#eef0f3"/>
  <circle cx="131" cy="40" r="3" fill="#1b1b1d"/>
  <circle cx="110" cy="28.5" r="2" fill="#eef0f3"/>
  <circle cx="111" cy="33" r="2.7" fill="#6cc3ff"/>
  <circle cx="111.4" cy="33" r="1.2" fill="#111"/>
  <ellipse cx="124" cy="50" rx="3.5" ry="5" fill="#ff7f9b"/>
  <path d="M117 46 Q123 48 130 44" fill="none" stroke="#3a3d42" stroke-width="1.5"/>
</svg>`;

const easeIn = t => t * t;
const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = t => t;

const ANIMALS = {
  goat: {
    svg: GOAT_SVG, w: 112, h: 84, contact: [0.95, 0.28],
    say: { text: "AAAAAH", x: 0.62, y: -0.28 },
    color: "#e0b26a", duration: 1250, ease: easeIn,
    bob: p => -Math.abs(Math.sin(p * 30)) * 3,
    impact: true, dust: true,
  },
  // Parrot and husky are recolored LottieFiles animations (see tools/recolor_lottie.py).
  // The hand-drawn SVGs above are kept as a fallback if the animation can't load.
  parrot: {
    lottie: "animals/parrot.json", flip: true, speed: 1.6,
    w: 150, h: 158, contact: [0.73, 0.5],
    say: { text: "BURD!", x: 0.55, y: 0.12 },
    fallback: { svg: PARROT_SVG, w: 96, h: 64, contact: [0.87, 0.46] },
    color: "#e5484e", duration: 1450, ease: easeInOut,
    bob: p => -Math.sin(p * Math.PI * 2) * 14,     // swoops up then dips through the text
    tilt: p => Math.cos(p * Math.PI * 2) * -8,
  },
  husky: {
    lottie: "animals/husky.json", speed: 0.75,
    w: 140, h: 140, contact: [0.55, 0.8],
    say: { text: "bork bork!", x: 0.62, y: 0.08 },
    fallback: { svg: HUSKY_SVG, w: 92, h: 66, contact: [0.6, 0.88] },
    color: "#7cc4ff", duration: 1150, ease: linear,
    bob: () => 0,
    dust: true,
  },
};

// Load the Lottie animation data up front so the first celebration starts instantly.
// If the player script failed to load, try once more before falling back to the SVGs.
function preloadAnimals() {
  for (const a of Object.values(ANIMALS)) {
    if (!a.lottie || !location.protocol.startsWith("http")) continue;
    fetch(a.lottie).then(r => r.json()).then(d => { a.data = d; }).catch(() => {});
  }
}
if (window.lottie) preloadAnimals();
else if (location.protocol.startsWith("http")) {
  const s = document.createElement("script");
  s.src = "vendor/lottie.min.js?retry=1";
  s.onload = preloadAnimals;
  document.head.appendChild(s);
}

// Builds the moving element. Returns it plus the geometry actually in use.
function buildCritter(name) {
  const a = ANIMALS[name];
  const el = document.createElement("div");
  el.className = "critter critter-" + name;
  let geo = a, anim = null;
  if (a.data) {
    const inner = document.createElement("div");
    inner.className = "lottie-inner";
    if (a.flip) inner.style.transform = "scaleX(-1)";
    el.appendChild(inner);
    anim = lottie.loadAnimation({ container: inner, renderer: "svg", loop: true, autoplay: true, animationData: a.data });
    anim.setSpeed(a.speed || 1);
  } else {
    geo = a.fallback || a;
    el.innerHTML = geo.svg;
  }
  el.style.width = geo.w + "px";
  el.style.height = geo.h + "px";
  if (a.say) {
    // Speech bubble above the animal's head (later: real sounds).
    const bubble = document.createElement("div");
    bubble.className = "say-bubble";
    bubble.textContent = a.say.text;
    bubble.style.left = a.say.x * 100 + "%";
    bubble.style.top = a.say.y * 100 + "%";
    bubble.style.setProperty("--say", a.color);
    el.appendChild(bubble);
  }
  return { el, geo, destroy: () => { if (anim) anim.destroy(); el.remove(); } };
}

let lastAnimal = null;
function pickAnimal() {
  const names = Object.keys(ANIMALS).filter(n => n !== lastAnimal);
  lastAnimal = names[Math.floor(Math.random() * names.length)];
  return lastAnimal;
}

function puff(li, x, y) {
  const p = document.createElement("div");
  p.className = "puff";
  p.style.left = x + "px";
  p.style.top = y + "px";
  li.appendChild(p);
  p.animate(
    [{ transform: "scale(.6)", opacity: .9 }, { transform: `translate(${-14 - Math.random() * 10}px, ${-6 - Math.random() * 8}px) scale(1.8)`, opacity: 0 }],
    { duration: 550, easing: "ease-out" },
  ).onfinish = () => p.remove();
}

// Plays the animation over a task row. Resolves when it is finished.
// opts (for the fun-facts card): animal = which one, line = element whose first line it runs
// along (default: the row's .title-text), strike = false to skip the strike-through.
function playFinish(li, opts = {}) {
  const titleText = opts.line || li.querySelector(".title-text");
  if (!titleText || matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  const name = opts.animal || pickAnimal();
  const a = ANIMALS[name];

  // Geometry relative to the row.
  const liRect = li.getBoundingClientRect();
  const tRect = titleText.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(titleText).lineHeight) || tRect.height;
  const titleLeft = tRect.left - liRect.left;
  const titleWidth = Math.min(tRect.width, liRect.right - tRect.left - 18);
  const lineY = tRect.top - liRect.top + lineHeight * 0.55;

  const strike = document.createElement("span");
  strike.className = "strike";
  strike.style.top = lineHeight * 0.55 - 1.5 + "px";
  strike.style.background = a.color;
  strike.style.color = a.color;
  if (opts.strike !== false) titleText.appendChild(strike);

  const built = buildCritter(name);
  const critter = built.el, g = built.geo;
  li.appendChild(critter);

  const cx = g.contact[0] * g.w, cy = g.contact[1] * g.h;
  const startX = -g.w;                       // fully off the left edge of the row
  const endX = liRect.width + 10;            // past the right edge
  let impacted = false, lastPuff = 0;

  return new Promise(resolve => {
    const t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / a.duration);
      const x = startX + (endX - startX) * a.ease(p);
      const y = lineY - cy + a.bob(p);
      const rot = a.tilt ? a.tilt(p) : 0;
      const fade = Math.min(1, p / 0.08, (1 - p) / 0.12);
      critter.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      critter.style.opacity = fade;

      const head = x + cx;
      strike.style.width = Math.max(0, Math.min(titleWidth, head - titleLeft)) + "px";

      if (a.dust && now - lastPuff > 70 && head > titleLeft && head < titleLeft + titleWidth + 40) {
        lastPuff = now;
        puff(li, x + g.w * 0.25, lineY - cy + g.h * 0.82);
      }
      if (a.impact && !impacted && head >= titleLeft + titleWidth) {
        impacted = true;
        li.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(7px) rotate(.6deg)" },
           { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }],
          { duration: 320, easing: "ease-out" },
        );
      }

      if (p < 1) requestAnimationFrame(frame);
      else {
        built.destroy();
        setTimeout(resolve, 150);
      }
    }
    requestAnimationFrame(frame);
  });
}
