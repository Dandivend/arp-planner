// To Do tab + the Day tab's "Could fit in" list.
// To-dos come from her Microsoft To Do lists (microsoft.js / mstodo.py). A to-do with a due
// date is simply a task on that day; one with no date (date = null) waits here until she
// plans it for a day, which sets its due date in To Do too.

let todoFilter = "all";        // which list the To Do tab shows ("all" or a list id)
try { todoFilter = localStorage.getItem("arpPlanner.todoList") || "all"; } catch {}

const todoItems = () => tasks.filter(t => !t.deleted && isTodo(t));
const syncedLists = () => ((msStatus && msStatus.lists) || []).filter(l => l.synced);
const shortDay = day => fromKey(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const byImportance = (a, b) => (b.priority === "important") - (a.priority === "important") || (a.createdAt || "").localeCompare(b.createdAt || "");

// Put a to-do on a day (or take it off its day with null).
function planTodo(t, day) {
  persist({ ...t, date: day });
  if (day) showToast(`📅 "${t.title}" is now on ${day === todayKey() ? "today" : shortDay(day)}.`);
}

// ---------- To Do tab ----------
function renderTodo() {
  const box = $("todo-body");
  box.innerHTML = "";
  const st = msStatus;
  $("todo-sync").hidden = !(st && st.connected);
  $("todo-sync").disabled = msSyncing;
  $("todo-sync").textContent = msSyncing ? "⏳ Syncing…" : "🔄 Sync now";
  $("todo-synced").textContent = st && st.connected ? `Synced ${ago(st.lastSync)}` : "";

  if (!st || !st.connected) {
    const card = el("div", "home-card todo-empty");
    card.append(el("p", "", st && st.lastError
      ? "⚠️ " + st.lastError
      : "Connect Microsoft To Do to see your lists here, plan to-dos into your days, and tick them off from the planner."));
    const go = el("button", "g-btn primary", "⚙️ Set it up in Settings");
    go.addEventListener("click", () => openSettingsSection("microsoft-settings"));
    card.appendChild(go);
    box.appendChild(card);
    return;
  }

  const lists = syncedLists();

  // Add a to-do.
  const add = el("form", "todo-add");
  const input = el("input");
  input.placeholder = "Add a to-do… (e.g. Clean the garage)";
  input.maxLength = 200;
  const pick = el("select");
  for (const l of lists) pick.add(new Option(l.name, l.id));
  if (todoFilter !== "all" && lists.some(l => l.id === todoFilter)) pick.value = todoFilter;
  const when = el("input");
  when.type = "date";
  when.title = "Optional: the day you want to do it";
  const btn = el("button", "g-btn primary", "+ Add");
  btn.type = "submit";
  add.append(input, pick, when, btn);
  add.addEventListener("submit", async e => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title || !pick.value) return;
    await persist({
      id: newId(), date: when.value || null, time: null, title, notes: "", done: false, doneDate: null,
      kind: "task", priority: "normal", dueDate: null, minutes: null, area: null, effort: "light", workout: null,
      createdAt: new Date().toISOString(), deleted: false,
      external: { microsoft: { listId: pick.value, pending: true, imported: true } },
    });
    syncMicrosoft(false);          // send it to To Do straight away
    setTimeout(() => { const i = document.querySelector(".todo-add input"); if (i) i.focus(); }, 0);
  });
  if (!lists.length) {
    box.appendChild(el("p", "hint-small", "Tick at least one list in ⚙️ Settings → Microsoft To Do to bring your to-dos in."));
  } else {
    box.appendChild(add);
  }

  // Which list.
  if (lists.length > 1) {
    const chips = el("div", "todo-filter");
    for (const [id, name] of [["all", "All lists"], ...lists.map(l => [l.id, l.name])]) {
      const b = el("button", "sort-btn" + (todoFilter === id ? " active" : ""), name);
      b.addEventListener("click", () => {
        todoFilter = id;
        try { localStorage.setItem("arpPlanner.todoList", id); } catch {}
        renderTodo();
      });
      chips.appendChild(b);
    }
    box.appendChild(chips);
  }

  const tk = todayKey();
  const mine = todoItems().filter(t => todoFilter === "all" || t.external.microsoft.listId === todoFilter);
  const open = mine.filter(t => !t.done);
  const groups = [
    ["⚠️ Overdue", open.filter(t => t.date && t.date < tk).sort((a, b) => a.date.localeCompare(b.date)), "overdue"],
    ["📅 Today", open.filter(t => t.date === tk).sort(byImportance), ""],
    ["🗓️ Coming up", open.filter(t => t.date && t.date > tk).sort((a, b) => a.date.localeCompare(b.date) || byImportance(a, b)), ""],
    ["💭 No day yet", open.filter(t => !t.date).sort(byImportance), ""],
    ["✅ Done lately", mine.filter(t => t.done && (t.doneDate || "") >= addDays(tk, -7))
      .sort((a, b) => (b.doneDate || "").localeCompare(a.doneDate || "")).slice(0, 15), "done-group"],
  ];
  let shown = 0;
  for (const [title, items, cls] of groups) {
    if (!items.length) continue;
    shown += items.length;
    const sec = el("div", "todo-group " + cls);
    sec.appendChild(el("h3", "todo-group-title", `${title} · ${items.length}`));
    const ul = el("ul", "task-list");
    for (const t of items) ul.appendChild(todoRow(t));
    sec.appendChild(ul);
    box.appendChild(sec);
  }
  if (!shown && lists.length) box.appendChild(el("p", "empty", "All clear! Nothing on your list. 🎉"));
}

// A normal task row (so ticking off still gets an animal) plus "when" controls.
function todoRow(t) {
  const li = taskRow(t, false);
  const tk = todayKey();
  if (t.date && !t.done) {
    const meta = li.querySelector(".meta") || li.querySelector(".body").appendChild(el("div", "meta"));
    const late = daysBetween(t.date, tk);
    const label = late > 0 ? `Overdue by ${plural(late, "day")}` : t.date === tk ? "Today" : t.date === addDays(tk, 1) ? "Tomorrow" : shortDay(t.date);
    meta.prepend(el("span", "chip " + (late > 0 ? "todo-late" : "todo-day"), "📅 " + label));
  }
  if (!t.done) {
    const actions = li.querySelector(".row-actions");
    if (t.date !== tk) {
      const today = el("button", "move-btn", "→ Today");
      today.title = "Do it today";
      today.addEventListener("click", e => { e.stopPropagation(); planTodo(t, tk); });
      actions.prepend(today);
    }
    const when = el("input", "todo-date");
    when.type = "date";
    when.value = t.date || "";
    when.title = "Pick a day for this";
    when.addEventListener("click", e => e.stopPropagation());
    when.addEventListener("change", () => planTodo(t, when.value || null));
    actions.prepend(when);
  }
  return li;
}

// ---------- Day tab: "Could fit in" ----------
function renderFitIn() {
  fillFitIn();
  // The divider under "+ Add a task" only shows when there's something below it. On narrow
  // screens (her phone) the activity-ideas panel moves below the tasks too.
  const ideasBelow = matchMedia("(max-width: 960px)").matches;
  $("tips-divider").hidden = $("fitin-card").hidden && $("suggest-card").hidden && !ideasBelow;
}

function fillFitIn() {
  const card = $("fitin-card");
  if (!card) return;
  const day = currentDay, tk = todayKey();
  if (day < tk) { card.hidden = true; return; }      // no point suggesting things for the past
  const items = todoItems().filter(t => !t.done && (!t.date || (day === tk && t.date < tk)))
    .sort((a, b) => (!!b.date - !!a.date) || byImportance(a, b));    // overdue first, then ⭐
  card.hidden = !items.length;
  if (!items.length) return;

  const ft = freeTimeLeft(day, planDay(day).active);
  $("fitin-free").textContent = ft.past ? "🌙 Past bedtime: maybe tomorrow"
    : ft.seconds <= 0 ? "😣 No free time left: maybe another day"
    : `⏳ About ${formatHrsMin(ft.seconds)} free ${day === tk ? "left today" : "that day"}`;
  card.classList.toggle("no-room", ft.past || ft.seconds <= 0);

  const ul = $("fitin-list");
  ul.innerHTML = "";
  const dayName = day === tk ? "today" : fromKey(day).toLocaleDateString(undefined, { weekday: "short" });
  for (const t of items.slice(0, 5)) {
    const li = el("li", "fitin-item");
    const text = el("div", "fitin-text");
    text.appendChild(el("span", "fitin-title", (t.priority === "important" ? "⭐ " : "") + t.title));
    const meta = el("span", "fitin-meta", todoListName(t));
    const left = minutesLeft(t);
    if (left) {
      meta.append(` · ⏱ ${lengthLabel(t, m => formatHrsMin(m * 60))}`);
      if (!ft.past && ft.seconds > 0) {
        const fits = left * 60 <= ft.seconds;
        meta.append(" · ", el("b", fits ? "fits-yes" : "fits-no", fits ? "✅ fits" : "too long for the time left"));
      }
    }
    if (t.date) meta.append(" · ", el("b", "todo-late-text", `overdue since ${shortDay(t.date)}`));
    text.appendChild(meta);
    const add = el("button", "move-btn", `+ Add to ${dayName}`);
    add.addEventListener("click", () => planTodo(t, day));
    li.append(text, add);
    ul.appendChild(li);
  }
  const more = $("fitin-more");
  more.hidden = items.length <= 5;
  more.textContent = `+${items.length - 5} more in the To Do tab ›`;
  more.onclick = () => showView("todo");
}

$("todo-sync").addEventListener("click", () => syncMicrosoft(true).then(() => view === "todo" && renderTodo()));
