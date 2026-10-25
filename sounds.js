// 🔊 Sound effects (Settings → Appearance → Sound effects; off by default). Made on the spot
// with the Web Audio API, so there are no sound files: a whistle-chirp for the grey, a "mrrrow"
// for Ori, a "maaa" for the goat, an "awoo" for the husky, a glassy "tink" for the vial and a
// rumbling boom when it erupts.

const soundsOn = () => typeof themePref === "function" && !!themePref().sounds && !calmMode();
let sfxCtx = null;
function sfx() {
  try {
    sfxCtx = sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (sfxCtx.state === "suspended") sfxCtx.resume();
    return sfxCtx;
  } catch { return null; }
}

// One voice: an oscillator through an optional filter, with a pitch path and a volume envelope.
const driveCurves = {};
function driveCurve(k) {                         // a soft-clipping curve: crunchy, never harsh
  if (driveCurves[k]) return driveCurves[k];
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  return (driveCurves[k] = c);
}
function voice(ctx, { type = "sine", at = 0, pitch = [[0, 440]], vol = [[0, 0], [.02, .2], [.3, 0]], filter = null, vibrato = null, drive = 0 }) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(pitch[0][1], t0);
  for (const [t, f] of pitch.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t0 + t);
  g.gain.setValueAtTime(.0001, t0);
  for (const [t, v] of vol) g.gain.linearRampToValueAtTime(Math.max(v, .0001), t0 + t);
  let out = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.freq;
    f.Q.value = filter.q || 1;
    if (filter.lfo) {                            // the "wub": the filter opens and shuts in rhythm
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.type = "sine";
      l.frequency.value = filter.lfo.rate;
      lg.gain.value = filter.lfo.depth;
      l.connect(lg).connect(f.frequency);
      l.start(t0);
      l.stop(t0 + vol[vol.length - 1][0] + .05);
    }
    out.connect(f);
    out = f;
  }
  if (drive) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(drive);
    ws.oversample = "2x";
    out.connect(ws);
    out = ws;
  }
  if (vibrato) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = vibrato.rate;
    lg.gain.value = vibrato.depth;
    l.connect(lg).connect(o.frequency);
    l.start(t0);
    l.stop(t0 + vol[vol.length - 1][0] + .05);
  }
  out.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + vol[vol.length - 1][0] + .05);
}

function noiseBurst(ctx, { at = 0, dur = .6, freq = 400, vol = .5 }) {
  const t0 = ctx.currentTime + at, len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf;
  f.type = "lowpass";
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

const ANIMAL_SOUNDS = {
  parrot(ctx) {                                  // a cheeky two-part wolf-whistle chirp
    voice(ctx, { type: "sine", pitch: [[0, 1400], [.12, 2600]], vol: [[0, 0], [.02, .18], [.13, .12], [.16, 0]] });
    voice(ctx, { type: "sine", at: .2, pitch: [[0, 2400], [.1, 1700], [.3, 2900]], vol: [[0, 0], [.03, .18], [.28, .1], [.34, 0]] });
    voice(ctx, { type: "triangle", at: .58, pitch: [[0, 2200], [.06, 3100]], vol: [[0, 0], [.02, .12], [.08, 0]] });
  },
  cat(ctx) {                                     // "mrrrOW": a gliding, nasal meow
    voice(ctx, { type: "sawtooth", pitch: [[0, 420], [.18, 720], [.55, 470]], vol: [[0, 0], [.05, .16], [.4, .12], [.62, 0]],
      filter: { type: "bandpass", freq: 1400, q: 2.5 }, vibrato: { rate: 22, depth: 18 } });
    voice(ctx, { type: "sawtooth", pitch: [[0, 840], [.18, 1440], [.55, 940]], vol: [[0, 0], [.05, .05], [.4, .04], [.62, 0]],
      filter: { type: "bandpass", freq: 2600, q: 3 } });
  },
  goat(ctx) {                                    // "MAAAAA": a wobbly bleat
    voice(ctx, { type: "sawtooth", pitch: [[0, 330], [.1, 380], [.75, 300]], vol: [[0, 0], [.04, .2], [.65, .16], [.85, 0]],
      filter: { type: "bandpass", freq: 900, q: 1.8 }, vibrato: { rate: 9, depth: 35 } });
  },
  husky(ctx) {                                   // "a-wooo!"
    voice(ctx, { type: "triangle", pitch: [[0, 380], [.15, 300], [.5, 620], [1.0, 480]], vol: [[0, 0], [.06, .2], [.8, .17], [1.05, 0]],
      filter: { type: "lowpass", freq: 1600 }, vibrato: { rate: 6, depth: 10 } });
  },
};
ANIMAL_SOUNDS.goatfall = ANIMAL_SOUNDS.goat;

function playAnimalSound(name, force = false) {     // force: focus mode's own 🔔 toggle said yes
  if (!force && !soundsOn()) return;
  const ctx = sfx();
  if (ctx && ANIMAL_SOUNDS[name]) ANIMAL_SOUNDS[name](ctx);
}

// The vial: a glassy tink, higher and brighter the harder she's tapping (power 0-1).
function playVialTink(power = 0) {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  const f = 1500 + power * 1600 + Math.random() * 120;
  voice(ctx, { type: "sine", pitch: [[0, f], [.25, f * .98]], vol: [[0, 0], [.005, .16], [.35, 0]] });
  voice(ctx, { type: "sine", pitch: [[0, f * 2.76]], vol: [[0, 0], [.004, .05], [.15, 0]] });
  if (power > .5) voice(ctx, { type: "triangle", at: .03, pitch: [[0, 180], [.1, 120]], vol: [[0, 0], [.01, .12 * power], [.14, 0]] });   // the goop sloshing
}

// The Done vial: soft bell chimes up a pentatonic scale (the n-th quick tap rings higher).
const CHIME = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568];
function playChime(n = 1) {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  const f = CHIME[Math.min(CHIME.length - 1, n - 1)];
  voice(ctx, { type: "sine", pitch: [[0, f]], vol: [[0, 0], [.006, .16], [1.4, 0]] });
  voice(ctx, { type: "sine", pitch: [[0, f * 2.01]], vol: [[0, 0], [.005, .05], [.8, 0]] });
  voice(ctx, { type: "sine", pitch: [[0, f * 3.02]], vol: [[0, 0], [.004, .025], [.5, 0]] });
}
// Focus mode: a "ding ding" like a little jingle bell for a ticked step (bright bell hits with
// a shimmer of tiny jingles), and a soft three-note "time's up" chime.
function playJingle() {
  const ctx = sfx();
  if (!ctx) return;
  for (const [at, f] of [[0, 1568], [.16, 2093]]) {
    voice(ctx, { type: "sine", at, pitch: [[0, f]], vol: [[0, 0], [.004, .14], [.9, 0]] });
    voice(ctx, { type: "sine", at, pitch: [[0, f * 2.76]], vol: [[0, 0], [.003, .04], [.35, 0]] });
    voice(ctx, { type: "sine", at, pitch: [[0, f * 5.4]], vol: [[0, 0], [.002, .015], [.15, 0]] });
  }
  for (let i = 0; i < 5; i++) {                  // the jingle: tiny high taps right after the dings
    const f = 4200 + Math.random() * 1800;
    voice(ctx, { type: "triangle", at: .05 + i * .07 + Math.random() * .03, pitch: [[0, f]], vol: [[0, 0], [.002, .025], [.07, 0]] });
  }
}
function playTimeUp() {
  const ctx = sfx();
  if (!ctx) return;
  [659.25, 783.99, 1046.5].forEach((f, i) => {
    voice(ctx, { type: "sine", at: i * .28, pitch: [[0, f]], vol: [[0, 0], [.008, .15], [1.6, 0]] });
    voice(ctx, { type: "sine", at: i * .28, pitch: [[0, f * 2.01]], vol: [[0, 0], [.006, .04], [.8, 0]] });
  });
}
// Order-vial songs: every tap plays the next note of a tune, and the tune is picked at random
// (a pause, or the end of a song, picks a new one). Old public-domain melodies, plus a few
// originals written for the planner (marked "original"). Each has an instrument:
//   bell (the soft chime), cello (warm, bowed), metal (chugging power chords), shred (a
//   screaming lead guitar), dub (a wobbling dubstep bass).
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI note number → Hz
const SONGS = [
  // ---- the cheerful classics (bell) ----
  { name: "Twinkle Twinkle", notes: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62] },
  { name: "Ode to Joy", notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60] },
  { name: "Frère Jacques", notes: [65, 67, 69, 65, 65, 67, 69, 65, 69, 70, 72, 69, 70, 72, 72, 74, 72, 70, 69, 65, 72, 74, 72, 70, 69, 65, 65, 60, 65, 65, 60, 65] },
  { name: "Sparkle Fanfare (original)", notes: [72, 76, 79, 84, 79, 76, 77, 81, 84, 89, 84, 81, 79, 83, 86, 91, 88, 84] },
  // ---- trickier ones (bell) ----
  { name: "Für Elise (Beethoven)", notes: [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69], oct: 0 },
  { name: "Turkish March (Mozart)", notes: [71, 69, 68, 69, 72, 74, 72, 71, 72, 76, 77, 76, 75, 76, 83, 81, 80, 81, 83, 81, 80, 81, 84], oct: 0 },
  { name: "Eine kleine Nachtmusik (Mozart)", notes: [67, 62, 67, 62, 67, 62, 67, 71, 74, 72, 69, 72, 69, 72, 69, 66, 69, 62], oct: 0 },
  { name: "Canon in D (Pachelbel)", notes: [78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 67, 66, 67, 64], oct: 0 },
  // ---- 🎻 beginner cello tunes ----
  { name: "🎻 Lightly Row", style: "cello", notes: [67, 64, 64, 65, 62, 62, 60, 62, 64, 65, 67, 67, 67, 67, 64, 64, 65, 62, 62, 60, 64, 67, 67, 64,
    62, 62, 62, 62, 62, 64, 65, 64, 64, 64, 64, 64, 65, 67, 67, 64, 64, 65, 62, 62, 60, 64, 67, 67, 60] },
  { name: "🎻 Song of the Wind", style: "cello", notes: [60, 62, 64, 65, 67, 67, 67, 69, 65, 72, 69, 67, 69, 65, 72, 69, 67,
    67, 65, 65, 65, 65, 64, 64, 64, 64, 62, 64, 62, 60, 64, 67, 60] },
  { name: "🎻 Go Tell Aunt Rhody", style: "cello", notes: [64, 64, 62, 60, 60, 62, 62, 65, 64, 62, 60, 67, 67, 65, 64, 64, 62, 60, 62, 64, 60] },
  { name: "🎻 French Folk Song", style: "cello", notes: [60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60, 60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60,
    62, 62, 62, 62, 57, 57, 62, 60, 59, 57, 55, 60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60] },
  { name: "🎻 Minuet in G (Petzold)", style: "cello", notes: [74, 67, 69, 71, 72, 74, 67, 67, 76, 72, 74, 76, 78, 79, 67, 67,
    72, 74, 72, 71, 69, 71, 72, 71, 69, 67, 66, 67, 69, 71, 67, 71, 69] },
  { name: "🎻 Bach Cello Suite No. 1", style: "cello", oct: 0, notes: [43, 50, 59, 57, 59, 50, 59, 50, 43, 50, 59, 57, 59, 50, 59, 50,
    43, 52, 60, 59, 60, 52, 60, 52, 43, 52, 60, 59, 60, 52, 60, 52, 43, 54, 60, 59, 60, 54, 60, 54, 43, 54, 60, 59, 60, 54, 60, 54,
    43, 55, 59, 57, 59, 55, 59, 54] },
  // ---- 🤘 metal (minor, harmonic minor, Phrygian dominant) ----
  { name: "🤘 Hall of the Mountain King (Grieg, metal)", style: "metal", notes: [45, 47, 48, 50, 52, 48, 52, 51, 47, 51, 50, 46, 50,
    45, 47, 48, 50, 52, 48, 52, 57, 55, 52, 48, 52, 55] },
  { name: "🤘 Dies Irae (metal)", style: "metal", notes: [41, 40, 41, 38, 40, 36, 38, 38, 41, 41, 43, 41, 40, 38, 36, 40, 41, 40, 38, 38] },
  { name: "🤘 Desert Doom (original, Phrygian dominant)", style: "metal", notes: [40, 40, 41, 40, 44, 45, 44, 41, 40, 40, 40, 41, 40, 47, 48, 47, 44, 41, 40,
    40, 52, 51, 48, 47, 44, 41, 40] },
  { name: "🎸 Toccata in D minor (Bach, shred)", style: "shred", notes: [69, 67, 69, 67, 65, 64, 62, 61, 62, 57, 55, 57, 52, 53, 49, 50,
    45, 43, 45, 40, 41, 37, 38] },
  { name: "🎸 Harmonic Minor Sweep (original, shred)", style: "shred", notes: [57, 60, 64, 69, 72, 76, 81, 76, 72, 69, 64, 60,
    56, 59, 62, 68, 71, 74, 80, 74, 71, 68, 62, 59, 57, 64, 69, 76, 81] },
  { name: "🎸 Flight of the Bumblebee (Rimsky-Korsakov, shred)", style: "shred", notes: [81, 80, 79, 78, 77, 72, 77, 76, 75, 74, 73, 72, 73, 72, 71, 70,
    69, 68, 67, 66, 65, 60, 65, 64, 63, 62, 61, 60, 61, 60, 59, 58] },
  // ---- 🔊 dubstep (originals) ----
  { name: "🔊 Wub Drop (original, dubstep)", style: "dub", notes: [41, 41, 44, 41, 46, 44, 41, 39, 41, 41, 48, 46, 44, 41, 39, 36] },
  { name: "🔊 Neon Wobble (original, dubstep)", style: "dub", notes: [38, 38, 50, 38, 41, 43, 45, 41, 38, 38, 50, 48, 46, 45, 43, 41] },
  { name: "🔊 Bass Cannon (original, dubstep)", style: "dub", notes: [36, 36, 36, 48, 36, 39, 41, 43, 36, 36, 36, 48, 46, 43, 41, 39] },
];
const SONG_OCT = { bell: 12, cello: -12, metal: 0, shred: 0, dub: 0 };
const songState = { song: Math.floor(Math.random() * SONGS.length), at: 0, last: 0 };
function pickSong() {                            // a random one, never the same twice in a row
  let i = songState.song;
  if (SONGS.length > 1) while (i === songState.song) i = Math.floor(Math.random() * SONGS.length);
  songState.song = i;
  songState.at = 0;
}

function playInstrument(ctx, style, n, at) {
  const f = NOTE(n);
  if (style === "cello") {                       // bowed: a slow swell, warm body, gentle vibrato
    voice(ctx, { type: "sawtooth", pitch: [[0, f]], vol: [[0, 0], [.07, .12], [.55, .09], [1.2, 0]], filter: { type: "lowpass", freq: 1200, q: .8 }, vibrato: { rate: 5.5, depth: f * .007 } });
    voice(ctx, { type: "triangle", pitch: [[0, f]], vol: [[0, 0], [.06, .09], [1.1, 0]] });
    voice(ctx, { type: "sine", pitch: [[0, f / 2]], vol: [[0, 0], [.08, .05], [1, 0]] });
  } else if (style === "metal") {                // a palm-muted power chord (root, fifth, octave) and a kick
    for (const [k, v] of [[0, .08], [7, .06], [12, .045]])
      voice(ctx, { type: "sawtooth", pitch: [[0, NOTE(n + k)]], vol: [[0, 0], [.004, v], [.2, v * .6], [.34, 0]], filter: { type: "lowpass", freq: 2600, q: 1.1 }, drive: 30 });
    voice(ctx, { type: "sine", pitch: [[0, 120], [.09, 45]], vol: [[0, 0], [.003, .3], [.16, 0]] });
  } else if (style === "shred") {                // a screaming lead with wide vibrato
    voice(ctx, { type: "sawtooth", pitch: [[0, f * .985], [.04, f]], vol: [[0, 0], [.006, .08], [.35, .055], [.55, 0]], filter: { type: "lowpass", freq: 3400, q: 1.6 }, drive: 45, vibrato: { rate: 6.5, depth: f * .009 } });
    voice(ctx, { type: "square", pitch: [[0, f / 2]], vol: [[0, 0], [.006, .03], [.4, 0]], filter: { type: "lowpass", freq: 1800 }, drive: 20 });
  } else if (style === "dub") {                  // the wub: a growling bass whose filter wobbles, with a sub under it
    const rate = [2, 4, 8, 6, 3, 12][at % 6];
    voice(ctx, { type: "sawtooth", pitch: [[0, f]], vol: [[0, 0], [.01, .13], [.5, .11], [.62, 0]], filter: { type: "lowpass", freq: 520, q: 9, lfo: { rate, depth: 430 } }, drive: 14 });
    voice(ctx, { type: "square", pitch: [[0, f * 1.006]], vol: [[0, 0], [.01, .055], [.5, .045], [.62, 0]], filter: { type: "lowpass", freq: 460, q: 7, lfo: { rate, depth: 380 } } });
    voice(ctx, { type: "sine", pitch: [[0, f / 2]], vol: [[0, 0], [.01, .24], [.55, .2], [.64, 0]] });
  } else {                                       // bell
    voice(ctx, { type: "sine", pitch: [[0, f]], vol: [[0, 0], [.006, .2], [1.1, 0]] });                 // bell body
    voice(ctx, { type: "sine", pitch: [[0, f * 2.005]], vol: [[0, 0], [.004, .06], [.6, 0]] });           // shimmer
    voice(ctx, { type: "triangle", pitch: [[0, NOTE(n - 24 + 4)]], vol: [[0, 0], [.02, .05], [.9, 0]] }); // a soft major third below
  }
}

// Plays the next note; returns { name, at, of } so the page can show which song it is.
function playSongNote() {
  const now = Date.now();
  if (now - songState.last > 2500) pickSong();                // a pause: a new random tune
  songState.last = now;
  const song = SONGS[songState.song % SONGS.length], style = song.style || "bell";
  const n = song.notes[songState.at];
  const info = { name: song.name, at: songState.at + 1, of: song.notes.length };
  const at = songState.at;
  songState.at++;
  if (songState.at >= song.notes.length) pickSong();           // the end: a new random tune next
  if (soundsOn()) {
    const ctx = sfx();
    if (ctx) playInstrument(ctx, style, n + (song.oct ?? SONG_OCT[style]), at);
  }
  return info;
}

// 😢 The sad Order vial's one-tap tune: a slow, sinking dubstep wobble with little "hu-hu" sobs
// on top and a long, drooping wail at the end (original). Returns how long it lasts, in seconds.
function playSadDub() {
  const len = 6.4;
  if (!soundsOn()) return len;
  const ctx = sfx();
  if (!ctx) return len;
  const seq = [[0, 45], [.5, 44], [1, 43], [1.5, 42], [1.75, 42], [2.4, 38], [2.7, 38], [3, 41], [3.3, 40], [3.6, 38], [4.1, 36], [4.6, 36], [5.1, 35]];
  seq.forEach(([at, n], i) => setTimeout(() => playInstrument(ctx, "dub", n, i), at * 1000));
  for (const [at, f] of [[.25, 880], [.4, 820], [1.25, 840], [1.4, 760], [2.95, 800], [3.1, 700], [4.35, 760], [4.5, 640]])   // the sobs
    voice(ctx, { type: "triangle", at, pitch: [[0, f], [.12, f * .78]], vol: [[0, 0], [.015, .07], [.13, 0]], vibrato: { rate: 14, depth: 18 } });
  voice(ctx, { type: "sine", at: 5.1, pitch: [[0, 620], [1.2, 330]], vol: [[0, 0], [.08, .06], [1.1, .04], [1.3, 0]], vibrato: { rate: 6, depth: 12 } });   // a final wail
  return len;
}

// A blessing: a shimmering rising arpeggio with a warm pad underneath.
function playBlessing() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
    voice(ctx, { type: "sine", at: i * .09, pitch: [[0, f]], vol: [[0, 0], [.01, .13], [1.6, 0]] }));
  for (const f of [261.63, 329.63, 392]) voice(ctx, { type: "triangle", pitch: [[0, f]], vol: [[0, 0], [.4, .08], [2.4, 0]] });
}

// "Mwahahaha!": a low, bouncy villain cackle (descending "ha"s).
function playCackle() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  [0, .16, .32, .48, .64].forEach((t, i) => voice(ctx, { type: "sawtooth", at: .2 + t, pitch: [[0, 220 - i * 18], [.12, 170 - i * 16]],
    vol: [[0, 0], [.02, .16], [.13, 0]], filter: { type: "bandpass", freq: 900, q: 2 } }));
}

// The eruption: a rising rumble, then a boom and a fizzy hiss.
// 🛸 Pew! A laser zap: a falling sci-fi sweep, a crackle, and a fizzle.
function playLaser() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  voice(ctx, { type: "sine", pitch: [[0, 300], [.3, 1400]], vol: [[0, 0], [.05, .05], [.3, .08], [.32, 0]] });                 // charging
  for (const at of [.32, .42]) voice(ctx, { type: "sawtooth", at, pitch: [[0, 2400], [.18, 180]], vol: [[0, 0], [.005, .12], [.2, 0]], filter: { type: "lowpass", freq: 3000 } });
  noiseBurst(ctx, { at: .5, dur: .5, freq: 6000, vol: .18 });                                                                    // fizzle
}
// 🚜 A bulldozer: a chugging diesel rumble, a scrape, and a crunch.
function playBulldozer() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  for (let i = 0; i < 9; i++) voice(ctx, { type: "square", at: i * .15, pitch: [[0, 48 + (i % 2) * 6]], vol: [[0, 0], [.01, .09], [.12, 0]], filter: { type: "lowpass", freq: 260 } });
  noiseBurst(ctx, { at: .2, dur: 1.1, freq: 700, vol: .25 });                                                                    // the scrape
  noiseBurst(ctx, { at: .9, dur: .4, freq: 2200, vol: .3 });                                                                     // crunch
  voice(ctx, { type: "sine", at: .9, pitch: [[0, 110], [.3, 45]], vol: [[0, 0], [.01, .3], [.35, 0]] });
}

function playEruption() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  voice(ctx, { type: "sawtooth", pitch: [[0, 50], [.85, 95]], vol: [[0, 0], [.1, .12], [.85, .25], [.95, 0]], filter: { type: "lowpass", freq: 300 } });
  noiseBurst(ctx, { at: .88, dur: 1.2, freq: 900, vol: .7 });
  voice(ctx, { type: "sine", at: .88, pitch: [[0, 120], [.6, 38]], vol: [[0, 0], [.01, .5], [.7, 0]] });
  noiseBurst(ctx, { at: 1.2, dur: 1.6, freq: 5000, vol: .12 });
}
