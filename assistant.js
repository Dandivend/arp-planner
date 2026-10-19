// 🤖 AI integration: Claude as a helper on the Day tab. She types what she wants ("move laundry to
// Saturday", "how long will meal prep take?", "plan my day"), and Claude changes her planner
// through a few tools, the same things she can do on screen. Every batch of changes has one Undo.
// Deleting always asks her first.
//
// Optional and off by default (it costs a little per use): Settings → 🤖 AI integration.
// It uses an Anthropic API key that stays on this device only (never in her synced planner,
// never in the published code). The switch and its options are in profile.ai, so they sync.
//
// On its own (when switched on):
//   - after she checks in (and when her feelings change later that day) it re-plans today, and
//   - it guesses lengths for tasks that don't have one (marked ≈, she can change them).
// Tasks she moved herself today (herMove) stay where she put them in those automatic re-plans.

const CLAUDE_MODEL = "claude-sonnet-5-5";
const claudeUrl = () => (window.ARP_CONFIG && ARP_CONFIG.claudeUrl) || "https://api.anthropic.com/v1/messages";
const AI_DEFAULTS = { enabled: false, auto: true, guess: true };
const aiPrefs = () => ({ ...AI_DEFAULTS, ...(profile.ai || {}) });

// The key lives on this device only.
const AiKey = {
  async get() {
    if (STANDALONE) return (await DeviceKV.get("ai.key", "")) || "";
    try { return localStorage.getItem("arpPlanner.aiKey") || ""; } catch { return ""; }
  },
  async set(v) {
    if (STANDALONE) return DeviceKV.set("ai.key", v || "");
    try { if (v) localStorage.setItem("arpPlanner.aiKey", v); else localStorage.removeItem("arpPlanner.aiKey"); } catch {}
  },
};

const ai = { log: [], busy: false, history: [], undo: {}, keySet: false, autoTimer: null };
AiKey.get().then(k => { ai.keySet = !!k; if (typeof render === "function") render(); });
const aiReady = () => aiPrefs().enabled && ai.keySet;

// ---------- what Claude gets to see ----------
function aiTaskInfo(t, tk) {
  const o = { id: t.id, title: t.title, date: t.date || null, kind: kindOf(t) };
  if (t.time) o.time = t.time;
  if (t.minutes) o.minutes = t.minutes;
  if (t.minutesGuess) o.minutesIsGuess = true;
  if (t.priority && t.priority !== "normal") o.priority = t.priority;
  if (t.dueDate) o.dueDate = t.dueDate;
  if (t.done) o.done = true;
  o.body = effortOf(t);
  o.brain = brainOf(t);
  if (isTodo(t)) o.todoList = todoListName(t);
  const rep = t.external && t.external.microsoft && t.external.microsoft.repeats;
  if (rep) o.repeats = rep;
  if (t.herMove && t.herMove.slice(0, 10) >= addDays(tk, -1)) o.sheMovedItToday = true;
  if (t.steps && t.steps.length) o.steps = t.steps.map((s, i) => ({ i, title: s.title, ...(s.minutes ? { minutes: s.minutes } : {}), ...(s.done ? { done: true } : {}) }));
  if (t.notes) o.notes = t.notes.slice(0, 140);
  if (isWorkShift(t)) o.workShift = true;
  return o;
}

function aiContext() {
  const tk = todayKey();
  const lo = addDays(tk, -14), hi = addDays(tk, 21);
  const live = tasks.filter(t => !t.deleted);
  const inView = live.filter(t => (t.date && t.date >= lo && t.date <= hi && (!t.done || t.date >= tk)) || (!t.date && !t.done));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(tk, i), w = awakeWindow(d), shift = workHoursFor(d), e = energyFor(d), b = batteriesFor(d);
    const f = feelingOf(moods[d] || {}), body = bodyOf(moods[d] || {});
    days.push({ date: d, weekday: fromKey(d).toLocaleDateString("en-US", { weekday: "long" }),
      awake: `${minToHHMM(w.start)}-${minToHHMM(w.end)}`, bestThinkingTime: `${minToHHMM(brainWindow(d).start)}-${minToHHMM(brainWindow(d).end)}`,
      work: shift ? shiftLabel(shift) : null, energy: e.level, brainBatteryLeftPct: b.brain.pctLeft, bodyBatteryLeftPct: b.body.pctLeft,
      ...(f ? { feelings: f.mix.list.map(x => x.label) } : {}), ...(body ? { body: body.label } : {}) });
  }
  // How long things took before (the lengths she gave similar tasks), for guessing.
  const past = {};
  for (const t of live) {
    if (!t.minutes || t.minutesGuess || !t.date || t.date < addDays(tk, -120)) continue;
    const k = (t.title || "").trim().toLowerCase();
    (past[k] = past[k] || []).push(t.minutes);
  }
  const history = Object.entries(past).slice(0, 80).map(([title, m]) => ({ title, usualMinutes: Math.round(m.reduce((a, b) => a + b, 0) / m.length), times: m.length }));
  const n = nowLocal();
  return { now: `${tk} ${pad(n.getHours())}:${pad(n.getMinutes())}`, viewingDay: currentDay, days, tasks: inView.map(t => aiTaskInfo(t, tk)), history };
}

const AI_SYSTEM = `You are the helper inside ARP Planner, Ariel's personal day planner. Ariel has ADHD and is autistic.
Be warm, brief and concrete: 1-3 short sentences, plain words, no lists unless she asks. Never guilt her.

How her planner works:
- Tasks have a date (YYYY-MM-DD), optional time (HH:MM, 24h), a length in minutes, priority (important / normal / optional),
  a body load (light/medium/heavy) and a brain load (light/medium/heavy). Kinds: task, chore, event, workout, joy.
- "joy" = hobbies and fun that refill her (rejuvenation). Protect them: don't move them off a day to make room, and
  suggest adding a little joy to heavy days.
- She has two batteries a day: brain (thinking) and body (physical). Her job is mostly brain work. Brain-heavy work
  fits best in her bestThinkingTime (not the first 2 hours after waking or the last 2 before bed).
- Her feelings and body check-in change her energy. Respect low days: fewer, easier things; push optional work.
- To-dos from Microsoft To Do (todoList) sync both ways. Repeating ones (repeats) can be moved in the planner safely.

Rules:
- Change things only with the tools, and only what she asked for (or what an automatic re-plan clearly needs).
- Never delete without asking: use ask_to_delete, which shows her a button.
- Tasks marked sheMovedItToday were placed by her: in automatic re-plans never move them.
- When you guess a length, set guess: true. Base guesses on history (her past lengths for similar tasks) when you can.
- Don't schedule over work hours or outside awake hours. Don't pile several brain-heavy jobs back to back.
- After using tools, tell her in one or two sentences what you changed.`;

const AI_TOOLS = [
  { name: "update_tasks", description: "Change existing tasks: move to another day or time, set lengths, priority, loads, title, notes, step lengths, or mark done.",
    input_schema: { type: "object", properties: {
      changes: { type: "array", items: { type: "object", properties: {
        id: { type: "string" }, date: { type: ["string", "null"], description: "YYYY-MM-DD, or null to take a to-do off its day" },
        time: { type: ["string", "null"], description: "HH:MM 24h, or null for anytime" }, minutes: { type: "integer" },
        guess: { type: "boolean", description: "true when minutes is your estimate" },
        priority: { enum: ["important", "normal", "optional"] }, brain: { enum: ["light", "medium", "heavy"] },
        body: { enum: ["light", "medium", "heavy"] }, title: { type: "string" }, notes: { type: "string" }, done: { type: "boolean" },
        steps: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, minutes: { type: "integer" } }, required: ["i", "minutes"] } },
      }, required: ["id"] } } }, required: ["changes"] } },
  { name: "add_task", description: "Add a new task to her planner.",
    input_schema: { type: "object", properties: {
      title: { type: "string" }, date: { type: "string" }, time: { type: ["string", "null"] }, minutes: { type: "integer" },
      guess: { type: "boolean" }, kind: { enum: ["task", "chore", "event", "joy"] }, priority: { enum: ["important", "normal", "optional"] },
      brain: { enum: ["light", "medium", "heavy"] }, body: { enum: ["light", "medium", "heavy"] }, notes: { type: "string" },
    }, required: ["title", "date"] } },
  { name: "ask_to_delete", description: "Ask her to confirm deleting a task. Shows her a Delete button; nothing is deleted until she taps it.",
    input_schema: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id"] } },
];

// ---------- doing what Claude asks ----------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOADS = ["light", "medium", "heavy"], LEVELS = ["important", "normal", "optional"];

async function aiRunTool(name, input, batch, auto) {
  const find = id => tasks.find(t => t.id === id && !t.deleted);
  if (name === "update_tasks") {
    const done = [], skipped = [];
    for (const c of input.changes || []) {
      const t = find(c.id);
      if (!t) { skipped.push(`${c.id}: not found`); continue; }
      const next = { ...t };
      const moving = ("date" in c && (c.date || null) !== (t.date || null)) || ("time" in c && (c.time || null) !== (t.time || null));
      if (moving && auto && t.herMove && t.herMove.slice(0, 10) >= addDays(todayKey(), -1)) { skipped.push(`${t.title}: she moved it herself today`); continue; }
      if ("date" in c) { if (c.date === null ? isTodo(t) : DAY_RE.test(c.date)) next.date = c.date; else { skipped.push(`${t.title}: bad date`); continue; } }
      if ("time" in c) { if (c.time === null || TIME_RE.test(c.time)) next.time = c.time; else { skipped.push(`${t.title}: bad time`); continue; } }
      if (c.minutes > 0 && c.minutes <= 720) { next.minutes = Math.round(c.minutes); next.minutesGuess = !!c.guess; }
      if (LEVELS.includes(c.priority)) next.priority = c.priority;
      if (LOADS.includes(c.brain)) next.brain = c.brain;
      if (LOADS.includes(c.body)) next.effort = c.body;
      if (typeof c.title === "string" && c.title.trim()) next.title = c.title.trim().slice(0, 200);
      if (typeof c.notes === "string") next.notes = c.notes.slice(0, 2000);
      if (typeof c.done === "boolean" && c.done !== !!t.done) { next.done = c.done; next.doneDate = c.done ? todayKey() : null; }
      if (Array.isArray(c.steps) && t.steps) {
        const steps = t.steps.map(s => ({ ...s }));
        for (const s of c.steps) if (steps[s.i] && s.minutes > 0 && s.minutes <= 720) steps[s.i].minutes = Math.round(s.minutes);
        Object.assign(next, withStepTotal(next, steps));
        if (c.steps.length && c.guess) next.minutesGuess = true;
      }
      batch.push({ before: t });
      await persist(next, false, { by: "claude" });
      done.push(t.title);
    }
    return `Changed: ${done.join(", ") || "nothing"}.${skipped.length ? " Skipped: " + skipped.join("; ") + "." : ""}`;
  }
  if (name === "add_task") {
    if (!input.title || !DAY_RE.test(input.date || "")) return "Not added: it needs a title and a date (YYYY-MM-DD).";
    const now = new Date().toISOString();
    const t = {
      id: newId(), date: input.date, time: TIME_RE.test(input.time || "") ? input.time : null, title: String(input.title).slice(0, 200),
      notes: input.notes || "", done: false, doneDate: null, kind: ["task", "chore", "event", "joy"].includes(input.kind) ? input.kind : "task",
      priority: LEVELS.includes(input.priority) ? input.priority : "normal", dueDate: null,
      minutes: input.minutes > 0 ? Math.round(input.minutes) : null, minutesGuess: !!(input.minutes > 0 && input.guess),
      area: null, effort: LOADS.includes(input.body) ? input.body : null, brain: LOADS.includes(input.brain) ? input.brain : null,
      workout: null, createdAt: now, deleted: false, external: {},
    };
    batch.push({ added: t.id });
    await persist(t, false, { by: "claude" });
    return `Added "${t.title}" on ${t.date}.`;
  }
  if (name === "ask_to_delete") {
    const t = find(input.id);
    if (!t) return "No such task.";
    ai.log.push({ who: "ask", text: `Delete "${t.title}"?${input.why ? " " + input.why : ""}`, id: t.id });
    return "Asked her. It's deleted only if she taps the button.";
  }
  return "Unknown tool.";
}

async function claudeCall(messages) {
  const key = await AiKey.get();
  if (!key) throw new Error("Add your Claude API key in ⚙️ Settings → 🤖 AI integration.");
  const r = await fetch(claudeUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, system: AI_SYSTEM, tools: AI_TOOLS, messages }),
  });
  const res = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("That Claude API key didn't work. Check it in ⚙️ Settings → 🤖 AI integration.");
  if (!r.ok) throw new Error((res.error && res.error.message) || `Claude didn't answer (${r.status}).`);
  return res;
}

// One request: her words (or an automatic job), with the planner as it is now. Claude may use
// tools a few rounds; everything it changed becomes one Undo.
async function askClaude(text, { auto = false, label = null } = {}) {
  if (ai.busy) return;
  ai.busy = true;
  ai.log.push({ who: auto ? "auto" : "you", text: label || text });
  renderAssistant();
  const batch = [], batchId = newId();
  try {
    const ctx = `Her planner right now (JSON):\n${JSON.stringify(aiContext())}`;
    const messages = [...ai.history.slice(-8), { role: "user", content: `${ctx}\n\n${auto ? "AUTOMATIC JOB (she didn't type this): " : "Ariel says: "}${text}` }];
    let reply = "";
    for (let round = 0; round < 5; round++) {
      const res = await claudeCall(messages);
      messages.push({ role: "assistant", content: res.content });
      reply = res.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim() || reply;
      const uses = res.content.filter(b => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) break;
      const results = [];
      for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: await aiRunTool(u.name, u.input || {}, batch, auto) });
      messages.push({ role: "user", content: results });
    }
    // Keep a short memory of the chat (words only, not the planner snapshot).
    ai.history.push({ role: "user", content: auto ? `(automatic) ${label || text}` : text }, { role: "assistant", content: reply || "Done." });
    ai.history = ai.history.slice(-12);
    if (batch.length) ai.undo[batchId] = batch;
    ai.log.push({ who: "claude", text: reply || (batch.length ? "Done." : "I didn't change anything."), batchId: batch.length ? batchId : null, changes: batch.length });
  } catch (e) {
    if (batch.length) ai.undo[batchId] = batch;
    ai.log.push({ who: "error", text: e.message, batchId: batch.length ? batchId : null });
  }
  ai.log = ai.log.slice(-14);
  ai.busy = false;
  render();
}

async function aiUndo(batchId) {
  const batch = ai.undo[batchId];
  if (!batch) return;
  delete ai.undo[batchId];
  for (const step of [...batch].reverse()) {
    if (step.added) {
      await Store.remove(step.added);
      const t = tasks.find(x => x.id === step.added);
      if (t) t.deleted = true;
    } else await persist(step.before, false, { by: "claude" });
  }
  for (const m of ai.log) if (m.batchId === batchId) m.undone = true;
  render();
  showToast("↩️ Undid Claude's changes.");
}

// ---------- automatic jobs ----------
// After she checks in (or changes her feelings later), wait for her to finish tapping, then re-plan today.
function aiCheckinChanged(day) {
  if (day !== todayKey() || !aiReady() || !aiPrefs().auto) return;
  clearTimeout(ai.autoTimer);
  ai.autoTimer = setTimeout(() => {
    const e = moods[day] || {}, f = feelingOf(e), b = bodyOf(e);
    if (!f && !b) return;
    const sig = `${day}|${feelingIds(e).join(",")}|${e.body || ""}`;
    let last = "";
    try { last = localStorage.getItem("arpPlanner.aiPlanned") || ""; } catch {}
    if (sig === last) return;
    try { localStorage.setItem("arpPlanner.aiPlanned", sig); } catch {}
    const first = !last.startsWith(day);
    const how = [f && `feeling ${f.label}`, b && `body: ${b.label.toLowerCase()}`].filter(Boolean).join(", ");
    askClaude(`She ${first ? "just checked in for today" : "changed how she feels"} (${how}). Re-plan today to fit: ` +
      "adjust times, priorities, or move things that can wait to a better day this week. Keep changes small and kind, " +
      "and never move tasks she moved herself today." +
      (aiPrefs().guess ? " Also guess lengths for today's and this week's tasks that have none (guess: true)." : ""),
      { auto: true, label: first ? `🌅 Morning plan (${how})` : `🔄 Feelings changed (${how}): re-planning` });
  }, 9000);
}

// ---------- Day tab box ----------
function renderAssistant() {
  const box = $("ai-card");
  if (!box) return;
  const on = aiPrefs().enabled;
  box.hidden = !on || currentDay < todayKey();
  if (box.hidden) return;
  box.innerHTML = "";
  const head = el("div", "ai-head");
  head.appendChild(el("h3", "", "🤖 Ask Claude"));
  if (ai.keySet) {
    const quick = el("div", "ai-quick");
    const q = (label, text) => {
      const b = el("button", "pill-btn", label);
      b.disabled = ai.busy;
      b.addEventListener("click", () => askClaude(text, { label }));
      quick.appendChild(b);
    };
    q("🗓️ Plan my day", "Look at my day and re-plan it to fit my energy, feelings and deadlines. Keep it doable.");
    q("⏱ Guess missing times", "Guess lengths for my tasks this week that don't have one (and steps without one), from what similar tasks took before. Mark them as guesses.");
    head.appendChild(quick);
  }
  box.appendChild(head);
  if (!ai.keySet) {
    const p = el("p", "hint-small", "Add your Claude API key in ⚙️ Settings → 🤖 AI integration to start.");
    p.addEventListener("click", () => openSettingsSection("ai-settings"));
    box.appendChild(p);
    return;
  }

  if (ai.log.length) {
    const log = el("div", "ai-log");
    for (const m of ai.log) {
      const row = el("div", "ai-msg " + m.who);
      row.appendChild(el("span", "ai-text", (m.who === "auto" ? "🤖 " : m.who === "error" ? "⚠️ " : "") + m.text));
      if (m.batchId && ai.undo[m.batchId]) {
        const u = el("button", "link-btn", `↩️ Undo ${m.changes > 1 ? "these changes" : "this"}`);
        u.addEventListener("click", () => aiUndo(m.batchId));
        row.appendChild(u);
      } else if (m.undone) row.appendChild(el("span", "ai-undone", "(undone)"));
      if (m.who === "ask" && !m.answered) {
        const yes = el("button", "g-btn danger-link", "🗑️ Yes, delete it");
        yes.addEventListener("click", () => {
          const t = tasks.find(x => x.id === m.id && !x.deleted);
          m.answered = true;
          if (t) deleteTask(t, null); else render();
        });
        const no = el("button", "link-btn", "Keep it");
        no.addEventListener("click", () => { m.answered = true; render(); });
        row.append(yes, no);
      }
      log.appendChild(row);
    }
    if (ai.busy) log.appendChild(el("div", "ai-msg claude thinking", "Thinking…"));
    box.appendChild(log);
    setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
  } else if (ai.busy) box.appendChild(el("div", "ai-msg claude thinking", "Thinking…"));

  const form = el("form", "ai-form");
  const input = el("input");
  input.placeholder = "e.g. Move laundry to Saturday, or: what should I do first?";
  input.maxLength = 600;
  input.value = ai.draft || "";
  input.addEventListener("input", () => { ai.draft = input.value; });
  const send = el("button", "g-btn primary", ai.busy ? "…" : "Send");
  send.type = "submit";
  send.disabled = ai.busy;
  form.append(input, send);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || ai.busy) return;
    ai.draft = "";
    askClaude(text);
  });
  box.appendChild(form);
}

// ---------- Settings card ----------
function renderAiSettings() {
  const box = $("ai-settings");
  if (!box) return;
  box.innerHTML = "";
  const p = aiPrefs();
  const save = async changes => {
    profile = await Store.putProfile({ ai: { ...aiPrefs(), ...changes } });
    render();
  };
  const toggle = (label, key, hint) => {
    const row = el("label", "ai-toggle");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!p[key];
    cb.addEventListener("change", () => save({ [key]: cb.checked }));
    row.append(cb, el("span", "", label));
    box.appendChild(row);
    if (hint) box.appendChild(el("p", "hint-small", hint));
  };
  toggle("Turn on the Claude helper", "enabled",
    "Adds a 🤖 Ask Claude box to the Day tab: it can move, add and re-time tasks for you, with Undo. It uses your Anthropic API key, " +
    "which costs a little each time it's used (usually cents a day). Off = nothing is sent and nothing costs anything.");
  if (!p.enabled) return;
  toggle("🌅 Re-plan my day when I check in", "auto", "Also when your feelings change later in the day. Tasks you moved yourself stay put.");
  toggle("⏱ Guess lengths for tasks without one", "guess", "Guesses are marked ≈. Change one and it's yours.");

  box.appendChild(el("div", "g-sub", "Your Claude API key (stays on this device only)"));
  const row = el("div", "ms-id-row");
  const input = el("input");
  input.type = "password";
  input.autocomplete = "off";
  input.placeholder = ai.keySet ? "•••••••• saved (paste a new one to replace it)" : "Paste the key from console.anthropic.com";
  const saveKey = el("button", "g-btn primary", "Save key");
  saveKey.addEventListener("click", async () => {
    const v = input.value.trim();
    if (!v) return;
    await AiKey.set(v);
    ai.keySet = true;
    input.value = "";
    showToast("🔑 Key saved on this device.");
    render();
  });
  row.append(input, saveKey);
  box.appendChild(row);
  if (ai.keySet) {
    const actions = el("div", "ai-key-actions");
    const test = el("button", "g-btn", "Test it");
    test.addEventListener("click", async () => {
      test.disabled = true;
      try {
        const res = await claudeCall([{ role: "user", content: "Reply with just: Ready!" }]);
        showToast("🤖 " + (res.content.find(b => b.type === "text") || {}).text);
      } catch (e) { showError(e.message); }
      test.disabled = false;
    });
    const forget = el("button", "g-btn danger-link", "Remove key");
    forget.addEventListener("click", async () => { await AiKey.set(""); ai.keySet = false; render(); });
    actions.append(test, forget);
    box.appendChild(actions);
  }
  box.appendChild(el("p", "hint-small", `Model: Claude Sonnet 5.5. What it sees: your tasks from the last two weeks to three weeks ahead, ` +
    "this week's check-ins, work and sleep times. It's sent to Anthropic only when the helper runs."));
}
