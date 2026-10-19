// Feelings for the check-in, Foxtale style: four colour boxes (energy × pleasantness), each
// holding its feelings. She can pick any number, across boxes.
//
// Every feeling sits on two scales, each -2..2:
//   en  energy        (-2 drained … 2 buzzing)
//   pl  pleasantness  (-2 awful … 2 lovely)
// and has three planning hints:
//   br  brain   how much thinking she has in her (-2 none … 2 lots: Inspired, Focused)
//   mv  move    physical jobs and movement help first (0..2: Annoyed, Anxious, Restless)
//   qw  quick   small easy wins first, to get going (0..2: Anxious, Overwhelmed, Foggy)
// A feeling takes its box's values unless it says otherwise. Several feelings are averaged,
// so Happy + Sad lands in the middle (moodMix).

const MOOD_GROUPS = [
  { id: "bright", emoji: "🌞", label: "High energy · pleasant", short: "Bright", color: "#f2c14e",
    en: 1.5, pl: 1.5, br: 0.5, mv: 0, qw: 0, feelings: [
      ["Accomplished"], ["Alive"], ["Amazed"], ["Awe", { en: 1 }], ["Cheerful"], ["Confident", { br: 1 }],
      ["Curious", { br: 1.5, en: 1 }], ["Delighted"], ["Determined", { br: 1.5 }], ["Ecstatic", { en: 2, br: 0 }],
      ["Elated", { en: 2 }], ["Empowered", { br: 1 }], ["Energized", { en: 2, mv: 1 }], ["Engaged", { br: 1.5 }],
      ["Enthusiastic"], ["Excited", { en: 2, br: 0 }], ["Exhilarated", { en: 2, br: 0 }], ["Focused", { en: 1, br: 2 }],
      ["Happy"], ["Hopeful", { en: 0.5 }], ["Inspired", { br: 2 }], ["Joyful"], ["Motivated", { br: 1 }],
      ["Optimistic", { en: 0.75 }], ["Passionate", { br: 1 }], ["Playful", { br: 0, mv: 1 }], ["Pleased", { en: 0.75 }],
      ["Proud"], ["Thrilled", { en: 2, br: 0 }], ["Upbeat"],
    ] },
  { id: "calm", emoji: "🍃", label: "Low energy · pleasant", short: "Calm", color: "#6fc48a",
    en: -0.5, pl: 1.5, br: 0.25, mv: 0, qw: 0, feelings: [
      ["Okay", { en: 0, pl: 0.25, br: 0 }],
      ["Accepted"], ["Appreciated"], ["Balanced", { en: 0, br: 0.75 }], ["Blessed"], ["Calm", { br: 0.5 }],
      ["Carefree", { br: 0 }], ["Chill", { en: -1, br: 0 }], ["Comfortable"], ["Compassionate"], ["Connected"],
      ["Content"], ["Cozy", { en: -1, br: 0, id: "cosy" }], ["Empathetic"], ["Fulfilled"], ["Good", { en: 0, pl: 1 }],
      ["Grateful"], ["Grounded", { en: 0, br: 0.75 }], ["Included"], ["Loved"], ["Mellow", { en: -1 }],
      ["Peaceful", { br: 0.5 }], ["Pleasant", { en: 0, pl: 1 }], ["Relieved", { en: 0 }], ["Respected"], ["Safe"],
      ["Satisfied"], ["Secure"], ["Serene", { br: 0.5 }], ["Supported"], ["Sympathetic"], ["Touched"],
      ["Understood"], ["Validated"], ["Valued"],
    ] },
  { id: "low", emoji: "🌧️", label: "Low energy · unpleasant", short: "Low", color: "#7aa2e3",
    en: -1.25, pl: -1.25, br: -1, mv: 0, qw: 1, feelings: [
      ["Alienated"], ["Apathetic", { en: -1.5, pl: -1, qw: 1.5, mv: 0.5 }], ["Ashamed", { pl: -2, en: -0.5 }],
      ["Bored", { en: -1, pl: -0.5, br: 0, mv: 1 }], ["Burned Out", { en: -2, pl: -1.5, br: -2, qw: 1.5 }],
      ["Depressed", { en: -2, pl: -2, br: -1.5 }], ["Despair", { en: -1.5, pl: -2, br: -1.5 }],
      ["Disappointed", { en: -0.5, pl: -1 }], ["Disconnected"], ["Discouraged", { en: -1, pl: -1 }],
      ["Disengaged", { br: -1.25 }], ["Disheartened"], ["Down", { pl: -1 }], ["Empty", { en: -2, pl: -1.5 }],
      ["Excluded"], ["Exhausted", { en: -2, pl: -1, br: -2 }], ["Fatigued", { en: -2, pl: -0.5, br: -1.5 }],
      ["Foggy", { en: -1, pl: -0.5, br: -2, qw: 1.5 }], ["Forlorn"], ["Frazzled", { en: -0.5, br: -2, qw: 1.5 }],
      ["Glum", { pl: -1 }], ["Grief", { en: -1.5, pl: -2, br: -1.5 }], ["Guilty", { en: -0.5, pl: -1.5 }],
      ["Helpless", { pl: -2 }], ["Hopeless", { en: -2, pl: -2 }], ["Insecure", { en: -0.5, pl: -1 }],
      ["Lonely", { en: -1, pl: -1.5 }], ["Longing", { en: -0.5, pl: -0.5 }], ["Lost", { br: -1.5 }],
      ["Meh", { en: -0.75, pl: -0.5, br: -0.5 }], ["Miserable", { en: -1.5, pl: -2 }], ["Numb", { en: -1.5, pl: -1, br: -1.5 }],
      ["Pessimistic", { en: -0.5, pl: -1 }], ["Sad", { en: -1, pl: -1.5 }], ["Sleepy", { en: -2, pl: -0.25, br: -1.5 }],
      ["Spent", { en: -2, br: -1.5 }], ["Tired", { en: -1.75, pl: -0.5 }], ["Trapped", { en: -0.5, pl: -2, mv: 1 }],
      ["Vulnerable", { en: -1, pl: -1 }], ["Weary", { en: -1.75, pl: -0.75 }],
    ] },
  { id: "wired", emoji: "🌋", label: "High energy · unpleasant", short: "Wired", color: "#e47a72",
    en: 1, pl: -1.5, br: -0.5, mv: 1.5, qw: 0.5, feelings: [
      ["Angry", { en: 2, pl: -2, mv: 2 }], ["Annoyed", { en: 0.75, pl: -1, br: -0.75 }],
      ["Anxious", { pl: -1.5, br: -1, mv: 2, qw: 2 }], ["Apprehensive", { en: 0.5, pl: -1, qw: 1.5 }],
      ["Betrayed", { pl: -2, br: -1 }], ["Concerned", { en: 0.5, pl: -1, mv: 1, qw: 1 }],
      ["Confused", { en: 0.5, pl: -1, br: -1.5, mv: 0.5, qw: 1.5 }], ["Contempt"], ["Disgusted"],
      ["Dread", { en: 0.5, pl: -2, qw: 2 }], ["Embarrassed", { mv: 1 }], ["Enraged", { en: 2, pl: -2, mv: 2 }],
      ["Envious", { mv: 1 }], ["FOMO", { pl: -1, mv: 1 }], ["Frightened", { en: 1.5, pl: -2, qw: 2 }],
      ["Frustrated", { mv: 2 }], ["Furious", { en: 2, pl: -2, mv: 2 }], ["Humiliated", { pl: -2, mv: 1 }],
      ["Hyper", { en: 2, pl: -0.25, br: -1, mv: 2 }], ["Impassioned", { en: 2, pl: -0.5, br: 0.5, mv: 1 }],
      ["Irritated", { pl: -1 }], ["Jealous"], ["Jittery", { en: 1.5, pl: -1, br: -1, mv: 2, qw: 1.5 }],
      ["Nervous", { pl: -1, mv: 2, qw: 2 }], ["Overwhelmed", { en: 0.5, br: -1.5, mv: 1, qw: 2 }],
      ["Panicked", { en: 2, pl: -2, br: -2, qw: 2 }], ["Peeved", { en: 0.5, pl: -0.75 }],
      ["Pressured", { pl: -1, qw: 1.5 }], ["Repulsed"], ["Resentful"], ["Restless", { en: 1.5, pl: -0.5, mv: 2 }],
      ["Scared", { qw: 2 }], ["Shocked", { en: 1.5, br: -1 }], ["Stressed", { br: -1, qw: 1.5 }],
      ["Tense", { pl: -1, mv: 2 }], ["Terrified", { en: 2, pl: -2, br: -2, qw: 2 }], ["Troubled"],
      ["Uneasy", { en: 0.5, pl: -1, mv: 2, qw: 1.5 }], ["Worried", { en: 0.5, qw: 2 }],
    ] },
];

const slugOf = label => label.toLowerCase().replace(/[^a-z]+/g, "-");
const EMOTIONS = MOOD_GROUPS.flatMap(g => g.feelings.map(([label, own]) => ({
  id: slugOf(label), label, group: g.id, en: g.en, pl: g.pl, br: g.br, mv: g.mv, qw: g.qw, ...(own || {}),
})));
const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map(e => [e.id, e]));
const GROUP_BY_ID = Object.fromEntries(MOOD_GROUPS.map(g => [g.id, g]));

// Check-ins from before (one feeling a day) still count.
const LEGACY_FEELINGS = {
  great: ["happy", "energized"], good: ["good"], okay: ["okay"], tired: ["tired"], annoyed: ["annoyed"],
  meh: ["meh"], rough: ["miserable"], 5: ["happy", "energized"], 4: ["good"], 3: ["okay"], 2: ["meh"], 1: ["miserable"],
};
const feelingIds = entry => {
  if (!entry) return [];
  if (Array.isArray(entry.feelings)) return entry.feelings.filter(id => EMOTION_BY_ID[id]);
  return entry.mood != null ? (LEGACY_FEELINGS[entry.mood] || []) : [];
};

const MIX_LINES = {
  bright: [
    "Love that! Ride the wave, and pace yourself.",
    "Bright days are for the big stuff, and a treat afterwards.",
    "That energy is contagious. Save a little for tomorrow-you too.",
  ],
  calm: [
    "Steady and kind to yourself. That's a great place to work from.",
    "Calm days are where good habits grow.",
    "Soft and settled. Keep it simple and keep it moving.",
  ],
  low: [
    "Go easy on yourself today. Optional stuff can wait.",
    "One small win is plenty. Rest is productive too.",
    "Be your own best friend today. What would you tell her?",
  ],
  wired: [
    "That's a lot of energy with nowhere to go. Let's put it somewhere useful.",
    "Hands busy, brain resting: moving helps that buzz settle.",
    "Burn some of it off first. The fiddly thinking can wait.",
  ],
  mixed: [
    "A bit of everything today, and that's okay.",
    "Mixed feelings are still feelings. Be gentle and take it one thing at a time.",
    "Lots going on inside. Small steps, and check in with yourself later.",
  ],
};

// All of a day's feelings averaged into one reading (null if she hasn't picked any).
function moodMix(entry) {
  const list = feelingIds(entry).map(id => EMOTION_BY_ID[id]);
  if (!list.length) return null;
  const avg = k => list.reduce((s, e) => s + e[k], 0) / list.length;
  const mix = { list, en: avg("en"), pl: avg("pl"), br: avg("br"), mv: avg("mv"), qw: avg("qw") };
  // Which box the average lands in (pleasant and unpleasant feelings that cancel out read as "mixed").
  const both = list.some(e => e.pl > 0) && list.some(e => e.pl < 0);
  mix.group = both && Math.abs(mix.pl) < 0.5 ? "mixed"
    : mix.pl >= 0 ? (mix.en >= 0 ? "bright" : "calm") : (mix.en >= 0 ? "wired" : "low");
  return mix;
}

// "anxious, inspired and tired" (the first few, for short spaces).
function feelingWords(list, max = 3) {
  const words = list.map(e => e.label.toLowerCase());
  if (words.length > max) return words.slice(0, max).join(", ") + ` +${words.length - max}`;
  return words.length > 1 ? words.slice(0, -1).join(", ") + " and " + words[words.length - 1] : words[0];
}
