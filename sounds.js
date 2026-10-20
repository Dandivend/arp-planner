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
function voice(ctx, { type = "sine", at = 0, pitch = [[0, 440]], vol = [[0, 0], [.02, .2], [.3, 0]], filter = null, vibrato = null }) {
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
    out.connect(f);
    out = f;
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

function playAnimalSound(name) {
  if (!soundsOn()) return;
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
// Done-vial songs: every tap plays the next note of a cheerful major-key tune (all old, public-domain
// melodies), with a soft bell tone and a gentle lower harmony. After a little pause it starts over;
// when one song ends, the next one begins.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI note number → Hz
const SONGS = [
  { name: "Twinkle Twinkle", notes: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62] },
  { name: "Ode to Joy", notes: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60] },
  { name: "Frère Jacques", notes: [65, 67, 69, 65, 65, 67, 69, 65, 69, 70, 72, 69, 70, 72, 72, 74, 72, 70, 69, 65, 72, 74, 72, 70, 69, 65, 65, 60, 65, 65, 60, 65] },
  { name: "Sparkle Fanfare", notes: [72, 76, 79, 84, 79, 76, 77, 81, 84, 89, 84, 81, 79, 83, 86, 91, 88, 84] },
];
const songState = { song: 0, at: 0, last: 0 };
// Plays the next note; returns { name, at, of } so the page can show which song it is.
function playSongNote() {
  const now = Date.now();
  if (now - songState.last > 2500) songState.at = 0;          // a pause: start the tune over
  songState.last = now;
  const song = SONGS[songState.song % SONGS.length];
  const n = song.notes[songState.at];
  const info = { name: song.name, at: songState.at + 1, of: song.notes.length };
  songState.at++;
  if (songState.at >= song.notes.length) { songState.at = 0; songState.song++; }
  if (soundsOn()) {
    const ctx = sfx();
    if (ctx) {
      const f = NOTE(n + 12);
      voice(ctx, { type: "sine", pitch: [[0, f]], vol: [[0, 0], [.006, .2], [1.1, 0]] });                 // bell body
      voice(ctx, { type: "sine", pitch: [[0, f * 2.005]], vol: [[0, 0], [.004, .06], [.6, 0]] });           // shimmer
      voice(ctx, { type: "triangle", pitch: [[0, NOTE(n - 12 + 4)]], vol: [[0, 0], [.02, .05], [.9, 0]] }); // a soft major third below
    }
  }
  return info;
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
function playEruption() {
  if (!soundsOn()) return;
  const ctx = sfx();
  if (!ctx) return;
  voice(ctx, { type: "sawtooth", pitch: [[0, 50], [.85, 95]], vol: [[0, 0], [.1, .12], [.85, .25], [.95, 0]], filter: { type: "lowpass", freq: 300 } });
  noiseBurst(ctx, { at: .88, dur: 1.2, freq: 900, vol: .7 });
  voice(ctx, { type: "sine", at: .88, pitch: [[0, 120], [.6, 38]], vol: [[0, 0], [.01, .5], [.7, 0]] });
  noiseBurst(ctx, { at: 1.2, dur: 1.6, freq: 5000, vol: .12 });
}
