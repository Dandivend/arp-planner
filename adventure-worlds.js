// The worlds for Adventure mode (see adventure.js for how nodes, rolls and effects work).
// All three are original stories that wink at games she loves; none of the real games' text is used.

const ADV_WORLDS = {};

// =====================================================================================
// 🪓 AZERHOOF: The Goat King's Scream  (a fond nod to big fantasy MMOs: factions, quests, raids)
// =====================================================================================
ADV_WORLDS.azerhoof = {
  title: "Azerhoof: The Goat King's Scream", emoji: "🪓", color: "#d9822b",
  boss: { name: "The Goat King Grumblehorns", emoji: "🐐" },
  blurb: "Factions! Fish-people! A 40-minute queue! Somewhere, a legendary goat is screaming so loudly the continent keeps cracking.",
  start: "a0", inn: "inn",
  nodes: {
    a0: {
      text: "The continent of Azerhoof is shaking. Again.\n\nEvery morning at sunrise, a scream rolls across the land: \"AAAAAAAAAAH!\" Teacups rattle. Mountains wobble. A gnome in Ironhinge faints into his soup for the fourth time this week.\n\nYou, {name}, wake up in a hay loft in the border town of Middlemuck with straw in your hair and a quest marker floating over your head. That's new.\n\nWho are you, adventurer?",
      choices: [
        { label: "🛡️ A Warrior: hit things, hug friends, eat a whole wheel of cheese", to: "a1", effect: { cls: "Warrior", stats: { might: 3, wits: 0, charm: 1 }, maxHp: 4 } },
        { label: "🔮 A Mage: big brain, bigger fireballs, small patience for nonsense", to: "a1", effect: { cls: "Mage", stats: { might: 0, wits: 3, charm: 1 } } },
        { label: "🗡️ A Rogue: sneaky, stylish, and definitely did not steal that sandwich", to: "a1", effect: { cls: "Rogue", stats: { might: 1, wits: 1, charm: 2 } } },
      ],
    },
    a1: {
      text: "You climb down the ladder. Middlemuck's town square is split right down the middle by a painted line.\n\nOn the left: the Lionguard, polished armor, polite banners and a man aggressively polishing a polished helmet.\n\nOn the right: the Tusk Clans, enormous friendly orcs grilling something that is still mooing a little, waving you over with a spatula.\n\nBoth sides glare at each other over the line. A sign on the line reads: NO HUGGING ACROSS THE LINE. (Someone has crossed out HUGGING and written FIGHTING. Someone else crossed that out and wrote HUGGING again.)",
      choices: [
        { label: "Join the Lionguard (free shiny shoulder pads)", to: "a2", effect: { flag: "lion", item: "Shiny Shoulder Pads" } },
        { label: "Join the Tusk Clans (free mystery kebab)", to: "a2", effect: { flag: "tusk", item: "Mystery Kebab" } },
        { label: "Stand exactly on the line and refuse to choose", to: "a1b" },
      ],
    },
    a1b: {
      text: "You plant your feet on the painted line. Both factions gasp. A bard drops his lute.\n\n\"You can't do that,\" says the helmet-polisher.\n\"There's no RULE,\" says a large orc, squinting at the sign, \"…is there?\"\n\nThey argue for nine minutes. In the end, both sides agree you are \"Neutral (Annoying)\" and hand you a participation badge.",
      effect: { flag: "neutral", item: "Participation Badge" },
      choices: [{ label: "Wear it with pride", to: "a2", effect: { stats: { charm: 1 } } }],
    },
    a2: {
      text: "A grey parrot lands on your shoulder with the confidence of someone who owns the shoulder.\n\nShe has a glowing yellow exclamation mark floating over her head. She clears her throat.\n\n\"BURD,\" she says. Then, in a perfect impression of a royal herald: \"Hear ye! The Goat King Grumblehorns has awoken beneath Mount Bleatmore. Every sunrise he screams. Every scream cracks the land. Bring me… ONE SUNFLOWER SEED. Also, save the world. Seed first.\"\n\nThis is Molly, Quest-Giver of the Realm. Her tail feathers are a brilliant, deeply unbothered red.",
      choices: [
        { label: "Offer her a seed from your pocket (you have one, somehow)", to: "a3", effect: { companion: "Molly", stats: { charm: 1 } } },
        { label: "Ask what the reward is first", to: "a2b" },
        { label: "Try to shoo her off your shoulder", to: "a2c" },
      ],
    },
    a2b: {
      text: "Molly stares at you for a long, long time.\n\n\"Reward,\" she repeats, in your exact voice. Then in the voice of a microwave: \"BEEP BEEP BEEP.\"\n\nShe offers 4 copper and \"exposure.\" You accept, mostly because she has started doing the smoke alarm noise and won't stop until you do.",
      effect: { gold: 1 },
      choices: [{ label: "Fine. Fine! Here's a seed.", to: "a3", effect: { companion: "Molly" } }],
    },
    a2c: {
      text: "You wave your arms. Molly does not move. Molly has never moved for anyone. She simply rotates her head and says, \"Rude,\" in the voice of your grandmother.\n\nYou feel deeply judged. You give her a seed out of shame.",
      effect: { hp: -1 },
      choices: [{ label: "Apologise to the bird", to: "a3", effect: { companion: "Molly" } }],
    },
    a3: {
      text: "\"Quest accepted!\" Molly announces, to no one. A golden chime plays from nowhere. You don't question it.\n\nThe road to Mount Bleatmore runs past three places:\n\n🐟 The Murkmire, a swamp full of fish-people who say only \"Mrrgl\" and run at you in groups of eleven.\n🍺 The Rusty Flagon, a tavern where the bartender knows everything, for a price.\n🌲 The Whisperwood, a forest where something small and Siamese has been stealing everyone's left boots.",
      choices: [
        { label: "🐟 Wade into the Murkmire", to: "m1" },
        { label: "🍺 Ask around at the Rusty Flagon", to: "t1" },
        { label: "🌲 Follow the trail of missing left boots", to: "w1" },
        { label: "⛰️ Skip it all and go straight up the mountain", to: "b0", req: { flag: "boots" } },
      ],
    },

    // ---- the Murkmire ----
    m1: {
      text: "The swamp burps. A head pops out of the water. Then eleven more.\n\n\"MRRGL,\" says the first fish-person.\n\"MRRRRGL,\" agree the other eleven.\n\nThey hold tiny spears and expressions of pure chaos. Their leader wears a crown made of a bucket.",
      choices: [
        { label: "Fight them all at once", to: "m2", roll: { stat: "might", dc: 13, win: "m2", fail: "m1f" } },
        { label: "Try to speak Mrrgl", to: "m3", roll: { stat: "charm", dc: 12, win: "m3", fail: "m1g" } },
        { label: "Offer them the Mystery Kebab", to: "m3", req: { item: "Mystery Kebab" }, effect: { lose: "Mystery Kebab" } },
        { label: "Ask Molly to translate", to: "m3", req: { companion: "Molly" }, roll: { stat: "wits", dc: 10, win: "m3", fail: "m1g", pet: "Molly" } },
      ],
    },
    m2: {
      text: "You fight with the fury of someone who just stepped in a swamp with new boots. Fish-people fly in every direction, landing in the reeds with little \"mrrgl!\"s of surprise.\n\nWhen the mud settles, the bucket-crowned leader climbs out of a puddle, straightens his bucket, and bows deeply. \"MRRGL,\" he says, with enormous respect. You have won the right to be their friend. They seem thrilled about this. They form a conga line.",
      effect: { stats: { might: 1 } },
      choices: [{ label: "Join the conga line", to: "m3" }],
    },
    m1f: {
      text: "You charge. They charge. It is less a battle and more a very wet hug with spears.\n\nYou're poked in places you didn't know you had. Eventually you all collapse in the mud, panting, and the bucket-crowned leader pats your head consolingly. \"Mrrgl,\" he says. You think it means \"good effort.\"",
      effect: { hp: -4 },
      choices: [{ label: "Wring out your socks and try talking instead", to: "m3", roll: { stat: "charm", dc: 10, win: "m3", fail: "m1g" } }],
    },
    m1g: {
      text: "You say \"Mrrgl.\" Unfortunately you said it with a rising tone, which in Mrrgl means \"your mother is a puddle.\"\n\nThe fish-people are DEVASTATED. Three of them cry. One throws a frog at you. It's a very good throw.",
      effect: { hp: -2 },
      choices: [{ label: "Apologise with a heartfelt interpretive dance", to: "m3", effect: { stats: { charm: 1 } } }],
    },
    m3: {
      text: "The bucket-king gurgles happily and presents you with his greatest treasure: a slightly bent, extremely shiny ladle.\n\n\"MRRGL MRRGL,\" he says solemnly, which Molly translates as: \"The Goat King's scream is too loud to fight. Find the Earmuffs of Eternal Quiet.\"\n\nThey also give you a fish. You did not ask for the fish. You now have the fish.",
      effect: { item: "Legendary Ladle", flag: "earmuffHint", gold: 6 },
      choices: [{ label: "Head back to the crossroads", to: "a3" }],
    },

    // ---- the Rusty Flagon ----
    t1: {
      text: "The Rusty Flagon smells like spilled cider and heroic decisions. A sign by the door: \"Please do not dance on the tables. (Paladins, this means you.)\"\n\nThe bartender, a dwarf named Brenda with a beard braided into a tiny chandelier, slides you a mug before you ask.\n\n\"You're here about the goat,\" she says. \"Everyone's here about the goat.\"",
      choices: [
        { label: "Buy information (3 gold)", to: "t2", req: { gold: 3 }, effect: { gold: -3 } },
        { label: "Win information at arm-wrestling", to: "t2", roll: { stat: "might", dc: 14, win: "t2", fail: "t1f" } },
        { label: "Sweet-talk Brenda", to: "t2", roll: { stat: "charm", dc: 13, win: "t2", fail: "t1g" } },
        { label: "Sit by the fire and rest (heal up)", to: "t1r" },
      ],
    },
    t1r: {
      text: "You sink into a squashy armchair by the fire. Someone's dog puts its head on your knee. A bard plays something soft and slightly off-key. For a while, nothing at all is on fire, cracking or screaming.\n\nYou feel much better. Rest is part of the quest. Brenda nods approvingly.",
      effect: { hp: 99 },
      choices: [{ label: "Back to the bar", to: "t1" }],
    },
    t1f: {
      text: "You lock hands with a paladin named Sir Gerald the Moderately Brave. He wins instantly, then apologises for six minutes and buys you a pie out of guilt.\n\nThe pie is excellent. Your arm is not.",
      effect: { hp: -2, item: "Guilt Pie" },
      choices: [{ label: "Try charming Brenda instead", to: "t2", roll: { stat: "charm", dc: 11, win: "t2", fail: "t1g" } }, { label: "Leave with dignity (and pie)", to: "a3" }],
    },
    t1g: {
      text: "You compliment Brenda's beard chandelier. She lights it up. All of it. It plays a tiny song.\n\nShe's charmed, but you've used your one compliment and she wants another. You panic and compliment her mug. It's a regular mug. She sighs and tells you anyway, because honestly the goat is giving her a headache.",
      choices: [{ label: "Listen", to: "t2" }],
    },
    t2: {
      text: "Brenda leans in. \"The Goat King isn't evil. He's got a stone stuck in his hoof. Been there three hundred years. You'd scream too.\n\nBut you can't get near him without the Earmuffs of Eternal Quiet, and those were stolen by a sneaky little thief in the Whisperwood. Cream-coloured. Dark ears. Blue eyes. Knocks things off shelves while looking you dead in the eye.\"\n\nShe hands you a map, and a coupon for one (1) free cider.",
      effect: { flag: "earmuffHint", item: "Map of Whisperwood" },
      choices: [{ label: "To the Whisperwood!", to: "w1" }, { label: "Back to the crossroads", to: "a3" }],
    },

    // ---- the Whisperwood ----
    w1: {
      text: "The Whisperwood is quiet. Too quiet. Every tree has a single left boot hanging from it like a very sad Christmas ornament.\n\nIn a sunbeam, on a mossy stump, sits a Siamese cat. Cream body. Dark seal-brown ears, face, paws and tail. Eyes the blue of a fresh mana potion.\n\nNext to him: a pair of fluffy, enchanted earmuffs. He looks at you. He puts one paw on the earmuffs. He slowly, deliberately, pushes them toward the edge of the stump.\n\nThis is Ori, the Boot Bandit of the Whisperwood.",
      choices: [
        { label: "Lunge for the earmuffs", to: "w2", roll: { stat: "might", dc: 16, win: "w3", fail: "w2" } },
        { label: "Slow-blink at him (cat diplomacy)", to: "w3", roll: { stat: "charm", dc: 11, win: "w3", fail: "w2" } },
        { label: "Offer him the fish from the swamp", to: "w3", req: { item: "Legendary Ladle" } },
        { label: "Distract him with a dangling bootlace", to: "w3", roll: { stat: "wits", dc: 12, win: "w3", fail: "w2" } },
      ],
    },
    w2: {
      text: "Ori watches you fail with total satisfaction. Then he knocks the earmuffs off the stump, catches them in his mouth, and sprints up a tree, yelling \"MRRROW\" in the tone of someone winning an argument.\n\nA left boot falls on your head.",
      effect: { hp: -2 },
      choices: [
        { label: "Sit under the tree and ignore him (reverse psychology)", to: "w3", roll: { stat: "wits", dc: 10, win: "w3", fail: "w2b" } },
        { label: "Climb after him", to: "w3", roll: { stat: "might", dc: 12, win: "w3", fail: "w2b" } },
      ],
    },
    w2b: {
      text: "Ori drops a second boot on your head. It's a different boot. He has a system.\n\nBut after a while he gets bored of being chased and comes down, plopping into your lap like he was always going to. Cats.",
      effect: { hp: -1 },
      choices: [{ label: "Accept the lap cat", to: "w3" }],
    },
    w3: {
      text: "Ori sniffs your hand. He headbutts it. He purrs so loudly that a nearby squirrel files a noise complaint.\n\nHe drops the Earmuffs of Eternal Quiet at your feet, sits on your foot, and gives you a slow blink that clearly says: \"I'm coming with you now. This was my idea.\"\n\nAs a bonus, he returns every left boot in the forest. The villagers throw a small party. You are given a medal shaped like a boot.",
      effect: { item: "Earmuffs of Eternal Quiet", companion: "Ori", flag: "boots", gold: 10 },
      choices: [{ label: "⛰️ To Mount Bleatmore!", to: "b0" }, { label: "Back to the crossroads first", to: "a3" }],
    },

    // ---- the raid ----
    b0: {
      text: "The base of Mount Bleatmore has a queue.\n\nAn enormous, hand-painted sign reads: \"RAID: THE GOAT KING · ESTIMATED WAIT: 40 MINUTES.\" Forty heroes stand in line. One is reading a book. One has brought a folding chair. One has been in the queue so long he has a beard down to his knees and simply says, \"…the queue…\" when you look at him.",
      choices: [
        { label: "Wait patiently in the queue", to: "b1", effect: { hp: 99, stats: { charm: 1 } } },
        { label: "Sneak around the queue", to: "b1", roll: { stat: "wits", dc: 13, win: "b1", fail: "b0f", pet: "Ori" } },
        { label: "Have Molly announce \"QUEUE POPPED!\" in a perfect impression of the queue bell", to: "b1", req: { companion: "Molly" } },
      ],
    },
    b0f: {
      text: "You get caught sneaking. Forty heroes turn and look at you with the cold fury of people who have been waiting forty minutes. You are sent to the back of the line.\n\nYou wait. You wait so long you learn the beard guy's whole life story. His name is Kevin. He's actually very nice.",
      effect: { hp: -1 },
      choices: [{ label: "Finally! The queue pops!", to: "b1" }],
    },
    b1: {
      text: "Inside the mountain, the cave glows with crystals. At the center, on a throne of hay bales, sits the Goat King Grumblehorns: as tall as a house, horns like twin staircases, beard like a waterfall of disappointment.\n\nHe sees you. He inhales. You feel the air leave the room.\n\n\"AAAAAAAAAAAAAAAAAAAAAAAAAAH!\"",
      choices: [
        { label: "🎧 Pop on the Earmuffs of Eternal Quiet", to: "b2", req: { item: "Earmuffs of Eternal Quiet" } },
        { label: "Scream back, louder", to: "b1f", roll: { stat: "might", dc: 18, win: "b2", fail: "b1f" } },
        { label: "Cover your ears and hope", to: "b1f" },
      ],
    },
    b1f: {
      text: "The scream hits you like a wall made of opera. You fly backward, bounce off a stalactite and land in a pile of hay. Your eyebrows are now somewhere else.\n\nThe goat looks briefly apologetic, then screams again.",
      effect: { hp: -5 },
      choices: [
        { label: "🎧 Earmuffs. Now. Please.", to: "b2", req: { item: "Earmuffs of Eternal Quiet" } },
        { label: "Retreat to the Whisperwood to find those earmuffs", to: "w1", req: { noItem: "Earmuffs of Eternal Quiet" } },
      ],
    },
    b2: {
      text: "Silence. Glorious, fluffy silence.\n\nWith the earmuffs on, you can see what's really going on: the Goat King is hopping on three legs, and a jagged pebble is wedged in his front hoof. Every time he steps on it: AAAAAH.\n\nHe's not a villain. He's a very large, very sore goat.",
      choices: [
        { label: "Remove the pebble yourself", to: "b3", roll: { stat: "wits", dc: 14, win: "b3", fail: "b2f" } },
        { label: "Have Ori sneak up and bat the pebble out", to: "b3", req: { companion: "Ori" }, roll: { stat: "wits", dc: 9, win: "b3", fail: "b2f", pet: "Ori" } },
        { label: "Use the Legendary Ladle as a hoof-pick", to: "b3", req: { item: "Legendary Ladle" } },
        { label: "Calm him down first with a lullaby", to: "b2s", roll: { stat: "charm", dc: 12, win: "b2s", fail: "b2f" } },
      ],
    },
    b2s: {
      text: "You sing a soft, slightly wobbly lullaby. The Goat King's ears droop. His eyes go heavy. He lies down with a THUMP that rearranges three villages, and holds his sore hoof out to you like a very large puppy.",
      choices: [{ label: "Gently remove the pebble", to: "b3" }],
    },
    b2f: {
      text: "You fumble. The Goat King kicks reflexively and you are launched, gently but firmly, into the ceiling. You stick there for a second like a dart, then drop.\n\nHe looks horrified and sorry. He lowers his hoof and holds it still for you. Second try.",
      effect: { hp: -3 },
      choices: [{ label: "Try again, carefully", to: "b3", roll: { stat: "wits", dc: 8, win: "b3", fail: "b2f" } }],
    },
    b3: {
      text: "PLINK. The pebble flies out and pings off the wall.\n\nThe Goat King blinks. He sets his hoof down. Nothing hurts. For the first time in three hundred years, nothing hurts.\n\nHe opens his mouth… and out comes the softest, happiest little \"maa.\"\n\nAcross Azerhoof, the shaking stops. Teacups settle. The gnome in Ironhinge finishes his soup.",
      effect: { gold: 25, item: "Pebble of Three Hundred Years" },
      choices: [{ label: "Pet the Goat King", to: "b4" }],
    },
    b4: {
      text: "The Goat King lowers his enormous head so you can scratch between his horns. He leans into it so hard you both nearly fall over.\n\n\"Thank you, {name},\" he rumbles. \"Long have I suffered. Long have I yelled. Take this, my most precious treasure.\"\n\nHe hands you… a goat. A normal-sized goat. She immediately starts eating your map.\n\n\"Her name is Cheddar. She will guide you. Mostly toward snacks.\"",
      effect: { companion: "Cheddar the goat" },
      choices: [{ label: "Return to Middlemuck as a hero", to: "end" }],
    },
    end: {
      text: (s) => `Middlemuck throws the biggest party in its history. The painted line in the square has been scrubbed away; Lionguard and Tusk Clans share a single enormous barbecue, and nobody is screaming except the bard, who is singing about you and keeps getting your name wrong.\n\nMolly sits on your shoulder taking full credit. ${s.companions.includes("Ori") ? "Ori has stolen the bard's left boot and is sleeping in it." : "Somewhere in the Whisperwood, a cat is knocking a boot off a stump, just because he can."} Cheddar has eaten the decorations.\n\nYou, {name} the {cls}, Hoof-Healer of Azerhoof, lean back by the fire. The land is quiet. Your feet are up. For once, absolutely nothing needs doing.\n\nThat's the best loot of all.`,
      end: true, choices: [],
    },
    inn: {
      text: "You wake up in a cosy bed at the Rusty Flagon. Brenda is polishing a mug and does not look surprised.\n\n\"Happens to everyone,\" she says. \"Sir Gerald faints twice a day. Breakfast's on the house.\" A cheese omelette appears. You feel restored.",
      choices: [{ label: "Head back out to the crossroads", to: "a3" }],
    },
  },
};

// =====================================================================================
// 🪄 SPIRAL POINTE ACADEMY  (a fond nod to card-battling wizard schools)
// =====================================================================================
ADV_WORLDS.spiral = {
  title: "Spiral Pointe Academy", emoji: "🪄", color: "#7d6bff",
  boss: { name: "Malpurrtaire, Dark Lord of Naps", emoji: "🐈‍⬛" },
  blurb: "Wizard school! Spell cards! A grey parrot professor who is never wrong, and a dramatic Siamese villain who wants ALL the sunbeams.",
  start: "s0", inn: "sinn",
  nodes: {
    s0: {
      text: "You arrive at Spiral Pointe Academy on the back of a flying bookshelf (economy class). Towers spiral into a candy-floss sky. A fountain in the courtyard sings opera, slightly off-key.\n\nA grey parrot in a tiny graduation cap swoops down and lands on a lectern.\n\n\"Welcome, young {name}! I am Professor Molly, Head of Ornithomancy, Keeper of the Great Library, and Champion of the Annual Peanut Eating Contest, nine years running.\" She adjusts her cap. \"Now. Every wizard studies one school of magic. Choose wisely, or at least choose quickly, class starts in four minutes.\"",
      choices: [
        { label: "🔥 Fire: dramatic, warm, occasionally sets eyebrows on fire", to: "s1", effect: { cls: "Pyromancer", stats: { might: 3, wits: 1, charm: 0 }, maxHp: 2 } },
        { label: "❄️ Ice: cool, sturdy, makes excellent slushies", to: "s1", effect: { cls: "Cryomancer", stats: { might: 1, wits: 1, charm: 1 }, maxHp: 6 } },
        { label: "⚡ Storm: HUGE damage, ~70% accuracy, 100% chaos", to: "s1", effect: { cls: "Stormcaller", stats: { might: 2, wits: 2, charm: -1 } } },
        { label: "🌿 Life: heals friends, talks to plants, plants talk back", to: "s1", effect: { cls: "Lifeweaver", stats: { might: 0, wits: 1, charm: 3 }, maxHp: 4 } },
        { label: "🔮 Myth: summons minions, mostly confused ones", to: "s1", effect: { cls: "Mythmaker", stats: { might: 1, wits: 3, charm: 0 } } },
      ],
    },
    s1: {
      text: "Your dorm room has a bed, a desk, a window with a view of a floating lake, and a deck of five blank spell cards that shimmer when you touch them.\n\nAlso, someone has left a goat in your wardrobe.\n\n\"Ah,\" says Professor Molly from the window ledge. \"That is Dean Nibbles, Dean of Students. Don't mind him. He eats the late homework. And the early homework. And homework in general.\"\n\nDean Nibbles is chewing your timetable thoughtfully.",
      choices: [
        { label: "Save the timetable", to: "s2", roll: { stat: "might", dc: 11, win: "s2a", fail: "s2" } },
        { label: "Let him have it, he seems to be enjoying it", to: "s2", effect: { stats: { charm: 1 } } },
        { label: "Offer the Dean a carrot instead", to: "s2a", roll: { stat: "charm", dc: 9, win: "s2a", fail: "s2" } },
      ],
    },
    s2: {
      text: "The timetable is gone. Dean Nibbles burps, looks at you with immense satisfaction and says \"Maaaa,\" which you choose to interpret as \"Good job.\"\n\nYou have no idea where your first class is. You'll have to wing it.",
      choices: [{ label: "Wander the halls", to: "s3" }],
    },
    s2a: {
      text: "You rescue (most of) the timetable. Dean Nibbles seems impressed and decides you are his favourite student. He follows you out of the room, clopping proudly.\n\nYour first class: \"Intro to Spell Cards, Room 3B (the room that is sometimes also a staircase).\"",
      effect: { companion: "Dean Nibbles", item: "Soggy Timetable" },
      choices: [{ label: "Go to class", to: "s3" }],
    },
    s3: {
      text: "Room 3B is, today, mostly a staircase. Students sit on the steps. Professor Molly lands on the banister.\n\n\"Spell cards!\" she announces. \"Each spell costs PIPS. You earn one pip per round. Big spells cost big pips. Today's homework: duel the training dummy.\"\n\nThe training dummy is named Gregory. Gregory has seen things. Gregory has a single tear painted on his face.",
      choices: [
        { label: "Cast a big flashy spell straight away", to: "s3f", roll: { stat: "might", dc: 14, win: "s4", fail: "s3f" } },
        { label: "Save up pips and plan carefully", to: "s4", roll: { stat: "wits", dc: 10, win: "s4", fail: "s3f" } },
        { label: "Befriend Gregory instead of fighting him", to: "s3g", roll: { stat: "charm", dc: 12, win: "s3g", fail: "s3f" } },
      ],
    },
    s3f: {
      text: "Your spell fizzles. Then it un-fizzles, very suddenly, in the wrong direction. A small cloud of glitter rains down on Professor Molly.\n\nShe stares at you, sparkling. \"…Detention,\" she says. \"Just kidding. But you are cleaning the glitter. Glitter is FOREVER.\"",
      effect: { hp: -2 },
      choices: [{ label: "Try again, slower this time", to: "s4", roll: { stat: "wits", dc: 8, win: "s4", fail: "s3f" } }],
    },
    s3g: {
      text: "You sit next to Gregory and ask him how his day is going. Nobody has ever asked Gregory that.\n\nGregory's painted tear seems to shine. The class bursts into applause. Professor Molly awards you full marks for \"Unexpected Emotional Intelligence\" and a gold star sticker, which she sticks on your forehead.",
      effect: { item: "Gold Star Sticker", stats: { charm: 1 } },
      choices: [{ label: "Wear the star with pride", to: "s4" }],
    },
    s4: {
      text: "That evening, the lights in the Great Library flicker. A cold wind blows through the halls. Every sunbeam in the school vanishes at once.\n\nA voice echoes from everywhere: \"STUDENTS OF SPIRAL POINTE. I AM MALPURRTAIRE. I HAVE TAKEN YOUR SUNBEAMS. ALL OF THEM. THEY ARE MINE NOW. I SHALL NAP IN THEM FOREVER.\"\n\nProfessor Molly ruffles her feathers grimly. \"He's back,\" she whispers. \"The most dramatic villain in Spiral history. A Siamese of enormous ego and very soft fur.\"",
      choices: [{ label: "\"How do we stop him?\"", to: "s5" }],
    },
    s5: {
      text: "\"Malpurrtaire hides in the Tower of Endless Naps,\" says Professor Molly. \"To get in, you need three things:\n\n🍪 the Cookie of Courage, from the kitchen gnomes,\n📚 the Book of Very Loud Spells, from the Forbidden Section of the library,\n🧶 the Ball of Infinite Yarn, from the Creepy Basement.\n\nChoose your path, young wizard. And {name}, bring a sweater. The basement is drafty.\"",
      choices: [
        { label: "🍪 The kitchens", to: "k1", req: { notFlag: "cookie" } },
        { label: "📚 The Forbidden Section", to: "l1", req: { notFlag: "book" } },
        { label: "🧶 The Creepy Basement", to: "c1", req: { notFlag: "yarn" } },
        { label: "🗼 To the Tower of Endless Naps!", to: "x1", req: { flag: "cookie" } },
      ],
    },
    k1: {
      text: "The kitchens are run by fourteen gnomes in fourteen tall hats. They are in the middle of a baking emergency: the Cookie of Courage is stuck in an oven that has gained sentience and is refusing to open until someone tells it a joke.",
      choices: [
        { label: "Tell the oven a joke", to: "k2", roll: { stat: "charm", dc: 12, win: "k2", fail: "k1f" } },
        { label: "Out-think the oven with a riddle", to: "k2", roll: { stat: "wits", dc: 13, win: "k2", fail: "k1f" } },
        { label: "Ask Dean Nibbles to eat the oven door", to: "k2", req: { companion: "Dean Nibbles" } },
      ],
    },
    k1f: {
      text: "\"Why did the wizard cross the road?\" you try. The oven waits. You do not know why the wizard crossed the road.\n\nThe oven blasts you with a puff of hot cinnamon air. It smells amazing. It also takes off half an eyebrow.",
      effect: { hp: -2 },
      choices: [{ label: "Try again: \"What do you call a lazy kangaroo? A POUCH POTATO!\"", to: "k2" }],
    },
    k2: {
      text: "The oven laughs so hard it pops open. The gnomes cheer and throw their hats. The Cookie of Courage glows gently, still warm.\n\nYou are not supposed to eat it. You definitely smell it, though. For courage.",
      effect: { item: "Cookie of Courage", flag: "cookie", hp: 3 },
      choices: [{ label: "Back to Professor Molly", to: "s5" }],
    },
    l1: {
      text: "The Forbidden Section is guarded by a librarian made entirely of shushing. \"SHHHHH,\" it says, before you've said anything.\n\nThe Book of Very Loud Spells sits on the top shelf, chained shut, rattling and occasionally yelling \"FIREBALL!\" through the chains.",
      choices: [
        { label: "Sneak past the librarian", to: "l2", roll: { stat: "wits", dc: 13, win: "l2", fail: "l1f" } },
        { label: "Ask nicely, in a whisper", to: "l2", roll: { stat: "charm", dc: 11, win: "l2", fail: "l1f" } },
        { label: "Have Professor Molly fly up and grab it", to: "l2", roll: { stat: "wits", dc: 7, win: "l2", fail: "l1f", pet: "Molly" } },
      ],
    },
    l1f: {
      text: "You step on a creaky floorboard. The librarian swells into a tornado of SHHHHH that blows you clean out of the Forbidden Section and into the Lost & Found, where you find three umbrellas and somebody's tooth.",
      effect: { hp: -2, item: "Spare Umbrella" },
      choices: [{ label: "Go back in. Quietly. Very quietly.", to: "l2", roll: { stat: "wits", dc: 9, win: "l2", fail: "l1f" } }],
    },
    l2: {
      text: "The Book of Very Loud Spells drops into your arms. It immediately yells \"HELLO!\" so loudly that every portrait in the library falls off the wall.\n\nThe librarian sighs in defeat. You tuck the book under your arm, where it mumbles \"lightning bolt\" sleepily.",
      effect: { item: "Book of Very Loud Spells", flag: "book" },
      choices: [{ label: "Back to Professor Molly", to: "s5" }],
    },
    c1: {
      text: "The Creepy Basement is creepy mostly because of the music. A single violin plays somewhere in the dark. When you find it, it's being played by a ghost who just really likes violin.\n\nThe Ball of Infinite Yarn is guarded by a Shadow Spider, who is mostly upset that no one ever visits.",
      choices: [
        { label: "Duel the Shadow Spider", to: "c2", roll: { stat: "might", dc: 13, win: "c2", fail: "c1f" } },
        { label: "Visit with the Shadow Spider for a bit", to: "c2", roll: { stat: "charm", dc: 10, win: "c2", fail: "c1f" } },
      ],
    },
    c1f: {
      text: "The spider wraps you up in a very thorough hug made of web. You hang upside down while it tells you about its eight favourite hobbies. You learn a lot about knitting.\n\nEventually it lets you go because it needs the web back.",
      effect: { hp: -2, stats: { wits: 1 } },
      choices: [{ label: "Promise to visit again", to: "c2" }],
    },
    c2: {
      text: "The Shadow Spider happily hands you the Ball of Infinite Yarn. \"Take it,\" it whispers. \"Malpurrtaire hasn't been able to resist yarn since he was a kitten. Nobody can.\"\n\nThe ghost plays a triumphant little tune on the violin as you leave.",
      effect: { item: "Ball of Infinite Yarn", flag: "yarn" },
      choices: [{ label: "Back to Professor Molly", to: "s5" }],
    },
    x1: {
      text: (s) => `The Tower of Endless Naps is soft. Everything is soft. The stairs are pillows. The walls are blankets. Every sunbeam stolen from the school has been piled into a single, glowing, golden heap at the top.\n\nIn the middle of it lies Malpurrtaire: a magnificent Siamese, cream as fresh milk, seal-dark mask, paws and tail, eyes so blue they glow. He wears a tiny purple cape.\n\n"So," he purrs, without opening his eyes. "A student. How… tedious."${s.items.length < 3 ? "\n\n(You get the feeling you'll want all three treasures for this…)" : ""}`,
      choices: [
        { label: "🧶 Roll the Ball of Infinite Yarn across the floor", to: "x2", req: { item: "Ball of Infinite Yarn" } },
        { label: "📚 Open the Book of Very Loud Spells", to: "x3", req: { item: "Book of Very Loud Spells" } },
        { label: "🍪 Eat the Cookie of Courage and challenge him to a duel", to: "x4", req: { item: "Cookie of Courage" }, effect: { lose: "Cookie of Courage", maxHp: 4 } },
        { label: "Go back for the other treasures", to: "s5" },
      ],
    },
    x2: {
      text: "The yarn rolls. Malpurrtaire's ears swivel. His pupils go HUGE. He tries to stay dignified. He fails. He POUNCES.\n\nFor ten glorious minutes, the Dark Lord of Naps rolls around the tower wrapped in yarn, completely forgetting he's evil.",
      effect: { flag: "distracted" },
      choices: [
        { label: "Sneak to the sunbeam pile while he's busy", to: "x5", roll: { stat: "wits", dc: 10, win: "x5", fail: "x4" } },
        { label: "📚 Use the Book of Very Loud Spells too", to: "x3", req: { item: "Book of Very Loud Spells" } },
      ],
    },
    x3: {
      text: "You open the book. It takes a deep breath and yells \"WAKE UUUUUUP!\" at a volume normally reserved for alarm clocks and toddlers.\n\nMalpurrtaire leaps four feet straight up, every hair standing on end, cape flapping, and lands in the arms of Dean Nibbles, who has followed you up the stairs and is now holding a very startled cat.",
      effect: { flag: "awake" },
      choices: [{ label: "\"Malpurrtaire, we need to talk.\"", to: "x6" }],
    },
    x4: {
      text: "\"A duel!\" Malpurrtaire leaps to his feet, cape swirling. He draws his spell cards: Nap Attack, Knock Thing Off Table and the dreaded Sit On Your Homework.\n\nThe tower crackles with magic.",
      choices: [
        { label: "Cast your strongest spell", to: "x6", roll: { stat: "might", dc: 15, win: "x6", fail: "x4f" } },
        { label: "Play defence and wait for an opening", to: "x6", roll: { stat: "wits", dc: 13, win: "x6", fail: "x4f" } },
        { label: "Compliment his cape", to: "x6", roll: { stat: "charm", dc: 11, win: "x6", fail: "x4f" } },
      ],
    },
    x4f: {
      text: "Malpurrtaire plays Sit On Your Homework. It's super effective. You are pinned under eleven pounds of smug Siamese and cannot move. He kneads your stomach. It's honestly kind of nice, apart from the claws.",
      effect: { hp: -4 },
      choices: [{ label: "Wriggle free and try again", to: "x6", roll: { stat: "might", dc: 10, win: "x6", fail: "x4f" } }],
    },
    x5: {
      text: "You tiptoe to the sunbeam pile. Up close, the sunbeams are warm and golden and hum like a happy fridge. You scoop up an armful.\n\nMalpurrtaire, still wrapped in yarn, looks up and sees you. His ears go flat. Then… his lower lip wobbles.",
      choices: [{ label: "\"…Are you okay?\"", to: "x6" }],
    },
    x6: {
      text: "Malpurrtaire sits down. His cape droops. \"Fine,\" he says. \"FINE. You want to know why I took the sunbeams?\n\nIt's COLD in this tower. It's been cold for YEARS. Every sunbeam in the school lands on some student's desk, or some professor's lectern, and never ever on me.\" He sniffs. \"I just wanted to be warm.\"\n\nProfessor Molly lands on the windowsill, looking softer than you've ever seen her. \"Oh, you silly old cat,\" she says.",
      choices: [
        { label: "Offer to share the sunbeams", to: "send" },
        { label: "Invite him to live in your dorm (it gets great afternoon sun)", to: "send", effect: { companion: "Ori (formerly Malpurrtaire)" } },
      ],
    },
    send: {
      text: (s) => `The sunbeams pour back over Spiral Pointe Academy: through every window, across every desk, into every corner. Students cheer. The opera fountain hits a high note perfectly for the first time in history.\n\nAnd from now on, by order of Professor Molly, one sunbeam every afternoon is reserved for a certain Siamese. He ${s.companions.some(c => c.startsWith("Ori")) ? "has given up villainy, renamed himself Ori, and sleeps on your homework" : "naps in it so hard he forgets to be evil"}. The cape stays on. It's part of his brand now.\n\nDean Nibbles eats your diploma at graduation. Professor Molly hands you a second one, laminated.\n\n{name} the {cls}: Sunbeam Saviour, Gregory's best friend, and top of the class (narrowly ahead of the goat).`,
      end: true, choices: [],
    },
    sinn: {
      text: "You wake up in the school infirmary. The nurse, a very calm tortoise, hands you a cup of hot cocoa with exactly the right number of marshmallows.\n\n\"Take your time,\" she says. \"Magic is hard. Rest is part of the lesson.\" Dean Nibbles is eating your get-well-soon card.",
      choices: [{ label: "Back to Professor Molly", to: "s5" }],
    },
  },
};

// =====================================================================================
// 💎 CRYSTAL STAR  (a fond nod to crystal-themed online fantasy: primals, mounts, fashion)
// =====================================================================================
ADV_WORLDS.crystal = {
  title: "Crystal Star", emoji: "💎", color: "#48b6e8",
  boss: { name: "The Primal of Laundry", emoji: "🧺" },
  blurb: "You are the Warrior of Mostly Light. Ride your goatobo, face a Primal made of laundry, and learn that fashion is the true endgame.",
  start: "c0", inn: "cinn",
  nodes: {
    c0: {
      text: "You step off the airship onto the docks of Lumina, City of a Thousand Crystals. A man in very large shoulder armour shouts \"WELCOME, ADVENTURER!\" at you, then at the next person, then at a seagull.\n\nYou are {name}, newly arrived, and according to a mysterious voice that keeps narrating your life in italics, you are \"the Warrior of… Mostly Light.\"\n\nThe guild clerk asks for your job.",
      choices: [
        { label: "🛡️ Paladin: holds the enemy's attention, and also the door for people", to: "c1", effect: { cls: "Paladin", stats: { might: 2, wits: 0, charm: 2 }, maxHp: 4 } },
        { label: "🎨 Pictomancer: paints monsters into existence (they're very nice paintings)", to: "c1", effect: { cls: "Pictomancer", stats: { might: 1, wits: 3, charm: 0 } } },
        { label: "💃 Dancer: wins fights through sheer fabulousness", to: "c1", effect: { cls: "Dancer", stats: { might: 1, wits: 1, charm: 3 } } },
        { label: "🌸 White Mage: heals everyone, sighs about it, heals them again", to: "c1", effect: { cls: "White Mage", stats: { might: 0, wits: 2, charm: 2 }, maxHp: 2 } },
      ],
    },
    c1: {
      text: "Your first quest: \"Deliver this letter to the stable master. Reward: a mount!\"\n\nThe stable master is a cheerful woman named Pip. She leads you to your new mount: a big, fluffy, yellow-feathered… goat? It has a beak. It has horns. It has very long chicken legs.\n\n\"It's a goatobo!\" says Pip. \"Half goat, half giant bird, all attitude. She bites, but only people she loves.\"\n\nThe goatobo bites you immediately.",
      effect: { companion: "Buttercup the goatobo", hp: -1 },
      choices: [{ label: "Name her Buttercup and climb on", to: "c2" }],
    },
    c2: {
      text: "As you ride out of Lumina, a parrot drops onto Buttercup's head. Grey feathers, red tail, a tiny monocle.\n\n\"Greetings! I am Molly, Scion of the Seventh Perch. I have come with a prophecy.\" She unrolls a scroll with her foot. \"'When the Primal of Laundry awakens, every sock shall lose its partner, and all the world shall have nothing to wear but WRINKLED SHIRTS.'\" She rolls the scroll back up. \"It's awakening. Today. Also I'd like a cracker.\"",
      choices: [
        { label: "Give her a cracker and ask her to join you", to: "c3", effect: { companion: "Molly" } },
        { label: "Ask who wrote the prophecy", to: "c2b" },
      ],
    },
    c2b: {
      text: "\"I did,\" says Molly. \"This morning. In crayon.\" She holds up the scroll. It is, indeed, crayon. There's a little drawing of an angry sock.\n\n\"But it's TRUE,\" she insists. In the distance, a laundry basket explodes.",
      choices: [{ label: "…Okay, she has a point. Welcome aboard.", to: "c3", effect: { companion: "Molly" } }],
    },
    c3: {
      text: "Before you can face a Primal, you must prove yourself. The Adventurers' Guild posts three tasks:\n\n🎉 A FUN (Fabulously Unplanned Nonsense) event in the meadow: \"Help! The cactus men are doing a dance-off!\"\n🏰 A dungeon: \"The Sastastic Caves. Average clear time: 20 minutes. Average arguments about the route: 3.\"\n👗 A fashion contest: \"Theme: Sleepy Chic. Prize: a hat.\"",
      choices: [
        { label: "🎉 The cactus dance-off", to: "f1", req: { notFlag: "fun" } },
        { label: "🏰 Run the dungeon", to: "d1", req: { notFlag: "dungeon" } },
        { label: "👗 Enter the fashion contest", to: "g1", req: { notFlag: "fashion" } },
        { label: "⚡ Face the Primal of Laundry", to: "p1", req: { flag: "ready" } },
      ],
    },
    f1: {
      text: "The meadow is full of small green cactus men in tiny sombreros. They have formed a dance circle. The music is incredible. They point at you. It's your turn.\n\nThere is no escape. There is only dance.",
      choices: [
        { label: "Do the robot", to: "f2", roll: { stat: "charm", dc: 12, win: "f2", fail: "f1f" } },
        { label: "Do an incredibly dramatic interpretive dance", to: "f2", roll: { stat: "charm", dc: 14, win: "f2", fail: "f1f" } },
        { label: "Have Buttercup do the dancing (goatobos have rhythm)", to: "f2", roll: { stat: "might", dc: 9, win: "f2", fail: "f1f", pet: "Buttercup the goatobo" } },
      ],
    },
    f1f: {
      text: "You trip on your own cape and roll into the circle. The cactus men gasp. Then they ALL do the roll too, assuming it's a new move. It catches on. Soon the whole meadow is rolling. You get poked by eleven cactuses, but you've started a trend.",
      effect: { hp: -3 },
      choices: [{ label: "Accept your fame", to: "f2" }],
    },
    f2: {
      text: "The cactus men erupt in tiny, prickly applause. Their chief hands you a FUN Medal and a single, perfect flower that grows from his own head. \"Gracias,\" he says, which is impressive, because he's a cactus.",
      effect: { item: "FUN Medal", flag: "fun", gold: 8 },
      choices: [{ label: "Back to the guild", to: "c3r" }],
    },
    d1: {
      text: "You join a dungeon party: a nervous tank named Bartholomew, a healer who keeps typing \"sry\" for no reason, and a damage dealer who has been AFK since he arrived and appears to be making a sandwich in real life.\n\nThe first room has three slimes and a sign that says DO NOT PULL THE WHOLE ROOM.",
      choices: [
        { label: "Fight carefully, one pack at a time", to: "d2", roll: { stat: "wits", dc: 11, win: "d2", fail: "d1f" } },
        { label: "PULL THE WHOLE ROOM", to: "d2", roll: { stat: "might", dc: 16, win: "d2", fail: "d1f" } },
        { label: "Ask Molly to scout ahead", to: "d2", roll: { stat: "wits", dc: 8, win: "d2", fail: "d1f", pet: "Molly" } },
      ],
    },
    d1f: {
      text: "Everything aggroes. Slimes, bats, a confused mimic, a sheep that wasn't even in this dungeon. Bartholomew screams. The healer types \"sry\" eleven times. The AFK guy comes back, sees the chaos, and immediately goes AFK again.\n\nSomehow you survive. Barely. You're sticky.",
      effect: { hp: -4 },
      choices: [{ label: "Carry on to the boss", to: "d2" }],
    },
    d2: {
      text: "The final boss is a Giant Squid named Linda who is, it turns out, just upset that people keep running through her living room. You all apologise and offer to wipe your feet. Linda is moved to tears (ink) and gives you her treasure: a pair of ridiculously fancy boots.\n\nThe AFK guy returns, receives the most loot, and says \"gg\".",
      effect: { item: "Ridiculously Fancy Boots", flag: "dungeon", gold: 12 },
      choices: [{ label: "Back to the guild", to: "c3r" }],
    },
    g1: {
      text: "The fashion contest is held on a glittering runway by the sea. The judge is a very serious white-and-brown Siamese named Ori, in a tiny beret, who has never once in his life been impressed.\n\nTheme: SLEEPY CHIC. Contestants include a knight in pajama armour and a mage wearing an actual duvet.",
      choices: [
        { label: "Strut down the runway with confidence", to: "g2", roll: { stat: "charm", dc: 13, win: "g2", fail: "g1f" } },
        { label: "Wear the Ridiculously Fancy Boots", to: "g2", req: { item: "Ridiculously Fancy Boots" } },
        { label: "Hold Ori's favourite toy just off the runway", to: "g2", roll: { stat: "wits", dc: 11, win: "g2", fail: "g1f" } },
      ],
    },
    g1f: {
      text: "You trip on the runway. Ori watches you fall in total silence. Then, slowly, deliberately, he knocks the judge's water glass off the table while maintaining eye contact.\n\nYou don't win. But the crowd loves the drama, and you get a Fan Favourite ribbon.",
      effect: { hp: -1, item: "Fan Favourite Ribbon" },
      choices: [{ label: "Bow anyway", to: "g2b" }],
    },
    g2: {
      text: "Ori looks at your outfit for a very long time. The crowd holds its breath. Then he does something no one has ever seen: a slow blink. The ultimate honour.\n\nYou win the Sleepy Chic crown, the hat, and, after the show, a Siamese who follows you home and sits on your hat.",
      effect: { item: "Sleepy Chic Hat", companion: "Ori", flag: "fashion", gold: 15 },
      choices: [{ label: "Back to the guild", to: "c3r" }],
    },
    g2b: {
      text: "As you leave, Ori trots after you. He looks at you as if to say \"you were terrible, and I respect it,\" and jumps onto Buttercup's saddle. Apparently you have a cat now.",
      effect: { companion: "Ori", flag: "fashion" },
      choices: [{ label: "Back to the guild", to: "c3r" }],
    },
    c3r: {
      text: (s) => {
        const done = ["fun", "dungeon", "fashion"].filter(f => s.flags[f]).length;
        if (done >= 2) s.flags.ready = true;
        return done >= 2
          ? "The guild master looks over your accomplishments, eyebrows climbing higher with every page. \"Well, well, well. Warrior of Mostly Light indeed. You're ready.\"\n\nThe ground shakes. Somewhere, a sock screams."
          : "The guild master nods. \"Good work. But a Primal is no laughing matter. Prove yourself once more.\"";
      },
      choices: [{ label: "Back to the guild board", to: "c3" }],
    },
    p1: {
      text: "The sky goes dark. The wind smells like dryer sheets. From a towering mountain of unfolded clothes rises the PRIMAL OF LAUNDRY: a colossal figure of tangled shirts, flapping towels and fitted sheets that nobody has ever folded correctly.\n\nIts voice is the sound of a washing machine on the spin cycle.\n\n\"I AM THE PILE. I AM ETERNAL. NO ONE… CAN… FOLD… ME.\"",
      choices: [
        { label: "Attack the Pile head on", to: "p2", roll: { stat: "might", dc: 15, win: "p2", fail: "p1f" } },
        { label: "Find the weak point (it's always the fitted sheet)", to: "p2", roll: { stat: "wits", dc: 13, win: "p2", fail: "p1f" } },
        { label: "Have Ori sit on it (cats compress laundry)", to: "p2", req: { companion: "Ori" }, roll: { stat: "might", dc: 8, win: "p2", fail: "p1f", pet: "Ori" } },
      ],
    },
    p1f: {
      text: "A sleeve lashes out and wraps you up like a burrito. Then a towel. Then a scarf. You are now a very warm, very confused laundry burrito.\n\nMolly pecks you free one sock at a time, muttering \"in MY prophecy this went better.\"",
      effect: { hp: -5 },
      choices: [{ label: "Back into the fight!", to: "p2", roll: { stat: "wits", dc: 10, win: "p2", fail: "p1f" } }],
    },
    p2: {
      text: "The Pile staggers. Socks rain down. Its voice wavers: \"THE… FITTED… SHEET…\"\n\nThis is it. The final phase. The Pile rises to its full height and summons its ultimate attack: LOAD OF A THOUSAND LOST SOCKS.",
      choices: [
        { label: "🧺 FOLD IT. FOLD IT ALL.", to: "p3", roll: { stat: "wits", dc: 12, win: "p3", fail: "p2f" } },
        { label: "💃 Dance until the socks find their partners", to: "p3", roll: { stat: "charm", dc: 12, win: "p3", fail: "p2f" } },
        { label: "Everyone together! Molly, Buttercup, Ori, NOW!", to: "p3", req: { companion: "Ori" } },
      ],
    },
    p2f: {
      text: "A thousand socks hit you all at once. They're surprisingly soft. You are defeated by comfort. You lie there for a while, considering your life.\n\nThen you get back up. Because the Warrior of Mostly Light always gets back up. (After a little lie-down.)",
      effect: { hp: -3 },
      choices: [{ label: "Fold with all your heart", to: "p3" }],
    },
    p3: {
      text: "With one final, mighty flourish, you fold the fitted sheet. PERFECTLY. Corners tucked. Square as a book.\n\nThe Primal of Laundry freezes. A tear runs down its pillowcase face. \"No one,\" it whispers, \"has ever done that.\"\n\nAnd with a soft whoomp, the Pile settles into a hundred neat, folded, matching stacks. Every sock in the realm finds its partner. Across Lumina, people put on fresh, warm, unwrinkled shirts and don't even know why they're smiling.",
      effect: { gold: 30, item: "The Fitted Sheet (perfectly folded)" },
      choices: [{ label: "Return to Lumina", to: "pend" }],
    },
    pend: {
      text: (s) => `Lumina throws a festival in your honour. There are fireworks, crystal lanterns and a parade where Buttercup is allowed to lead (she bites the mayor, lovingly).\n\nMolly updates her prophecy in crayon: "AND THE WARRIOR OF MOSTLY LIGHT FOLDED THE SHEET, AND IT WAS GOOD." ${s.companions.includes("Ori") ? "Ori judges the parade's fashion and finds most of it lacking, except yours." : ""}\n\nThe guild master offers you a new quest. You look at it. You look at the sunset. You put on your Sleepy Chic hat, sit down on the warm docks with your friends, and decide that the real endgame is a nap.\n\n{name} the {cls}: Warrior of Mostly Light. Folder of Sheets. Absolutely iconic.`,
      end: true, choices: [],
    },
    cinn: {
      text: "You wake up at the Lumina inn, in a bed so soft it should be illegal. A Siamese cat (it's Ori, of course) is asleep on your feet.\n\nThe innkeeper sets down a bowl of soup. \"You fainted in the most stylish way I've ever seen,\" she says. \"Rest up.\"",
      choices: [{ label: "Back to the guild", to: "c3" }],
    },
  },
};
