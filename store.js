// Storage layer. The UI only talks to `Store`, so swapping where tasks live
// (local JSON file today; phone storage or a sync backend later) only means
// writing another object with the same methods.
//
// Task shape (also documented in README.md):
// { id, date: "YYYY-MM-DD", time: "HH:MM" | null, title, notes, done, doneDate,
//   kind: "event" | "task" | "chore", priority: "optional" | "normal" | "important",
//   dueDate: "YYYY-MM-DD" | null   (time-sensitive: urgency grows until this day),
//   minutes: number | null, area: string | null   (chores),
//   createdAt, updatedAt, deleted, external: { google?: { eventId, etag } } }
//
// Check-in shape: moods["YYYY-MM-DD"] = { mood: "great".."rough" (older entries: 1-5),
//   body: "energized".."sick", period: true/false, recovery: [idea ids ticked], note, updatedAt }
// Cycle shape: { starts: ["YYYY-MM-DD" period start dates], length: 28, periodLength: 5 }

// The phone app (config.js "standalone"): no PC behind it, everything lives on this device.
const STANDALONE = (window.ARP_CONFIG || {}).mode === "standalone";

// Opened on her phone through the PC (not on the PC itself)? Then the server wants a PIN
// sign-in, and connecting Google / Microsoft has to happen on the PC (their sign-ins return to the PC).
const ON_PC = !STANDALONE && ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
if (!ON_PC && !STANDALONE) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const r = await realFetch(...args);
    if (r.status === 401) location.replace("/login");      // signed out (e.g. the PIN was changed)
    return r;
  };
}

const ApiStore = {
  async load() {
    const r = await fetch("/api/tasks");
    if (!r.ok) throw new Error("load failed");
    const data = await r.json();
    return { tasks: data.tasks, moods: data.moods || {}, cycle: data.cycle, profile: data.profile || {} };
  },
  async putProfile(profile) {
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!r.ok) throw new Error("save failed");
    return r.json();
  },
  async putCycle(cycle) {
    const r = await fetch("/api/cycle", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cycle),
    });
    if (!r.ok) throw new Error("save failed");
    return r.json();
  },
  async put(task) {
    const r = await fetch("/api/tasks/" + encodeURIComponent(task.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!r.ok) throw new Error("save failed");
    return r.json();
  },
  async remove(id) {
    const r = await fetch("/api/tasks/" + encodeURIComponent(id), { method: "DELETE" });
    if (!r.ok) throw new Error("delete failed");
  },
  async putMood(day, entry) {
    const r = await fetch("/api/moods/" + day, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!r.ok) throw new Error("save failed");
    return r.json();
  },
};

// Browser-only fallback (e.g. a future phone/PWA build with no local server).
const LocalStore = {
  KEY: "dailyPlanner.tasks",
  MOODS: "dailyPlanner.moods",
  _read(key, empty) {
    try { return JSON.parse(localStorage.getItem(key)) || empty; } catch { return empty; }
  },
  _write(key, v) { localStorage.setItem(key, JSON.stringify(v)); },
  CYCLE: "dailyPlanner.cycle",
  PROFILE: "dailyPlanner.profile",
  async load() {
    return {
      tasks: this._read(this.KEY, []), moods: this._read(this.MOODS, {}),
      cycle: this._read(this.CYCLE, null), profile: this._read(this.PROFILE, {}),
    };
  },
  async putProfile(profile) {
    const saved = { ...profile, updatedAt: new Date().toISOString() };
    this._write(this.PROFILE, saved);
    return saved;
  },
  async putCycle(cycle) {
    const saved = { ...cycle, updatedAt: new Date().toISOString() };
    this._write(this.CYCLE, saved);
    return saved;
  },
  async put(task) {
    const tasks = this._read(this.KEY, []);
    const now = new Date().toISOString();
    const i = tasks.findIndex(t => t.id === task.id);
    const saved = i >= 0 ? { ...tasks[i], ...task, updatedAt: now }
                         : { createdAt: now, deleted: false, external: {}, ...task, updatedAt: now };
    if (i >= 0) tasks[i] = saved; else tasks.push(saved);
    this._write(this.KEY, tasks);
    return saved;
  },
  async remove(id) {
    const tasks = this._read(this.KEY, []);
    const t = tasks.find(t => t.id === id);
    if (t) { t.deleted = true; t.updatedAt = new Date().toISOString(); }
    this._write(this.KEY, tasks);
  },
  async putMood(day, entry) {
    const moods = this._read(this.MOODS, {});
    moods[day] = { ...moods[day], ...entry, updatedAt: new Date().toISOString() };
    this._write(this.MOODS, moods);
    return moods[day];
  },
};

// ---------- the phone app ----------
// This device's own storage: IndexedDB (big and durable), or localStorage if that's unavailable.
// Also holds the sync modules' sign-ins and state (syncs/*.js), under their own keys.
const DeviceKV = (() => {
  let db = null;
  const open = () => db || (db = new Promise((resolve, reject) => {
    const req = indexedDB.open("arp-planner", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const viaLocal = {
    get: (key, empty) => { try { return JSON.parse(localStorage.getItem("arp." + key)) ?? empty; } catch { return empty; } },
    set: (key, value) => localStorage.setItem("arp." + key, JSON.stringify(value)),
  };
  return {
    async get(key, empty = null) {
      try {
        const d = await open();
        const v = await new Promise((resolve, reject) => {
          const r = d.transaction("kv").objectStore("kv").get(key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        return v === undefined ? empty : v;
      } catch { return viaLocal.get(key, empty); }
    },
    async set(key, value) {
      try {
        const d = await open();
        await new Promise((resolve, reject) => {
          const tx = d.transaction("kv", "readwrite");
          tx.objectStore("kv").put(value, key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch { viaLocal.set(key, value); }
    },
  };
})();

const nowIso = () => new Date().toISOString();

// Her planner on the phone: the same answers the PC's server gives, kept in DeviceKV.
// After every change `onChange` runs (syncs/drive.js uses it to share the change).
const DeviceStore = {
  data: null,
  onChange: () => {},
  async load() {
    if (!this.data) {
      this.data = {
        tasks: await DeviceKV.get("tasks", []), moods: await DeviceKV.get("moods", {}),
        cycle: await DeviceKV.get("cycle", { starts: [], length: 28, periodLength: 5 }),
        profile: await DeviceKV.get("profile", {}),
      };
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
    }
    const d = this.data;
    return { tasks: d.tasks.map(t => ({ ...t })), moods: { ...d.moods }, cycle: { ...d.cycle }, profile: { ...d.profile } };
  },
  async _save(...keys) {
    for (const k of keys) await DeviceKV.set(k, this.data[k]);
    try { this.onChange(keys); } catch {}
  },
  // Merge another copy in (her Drive copy, syncs/merge.js). Done in one step with no waiting in
  // between, so an edit she makes at that moment can't be lost. Returns true if anything changed.
  async mergeIn(other) {
    await this.load();
    // Only the device that runs the Calendar / To Do syncs keeps its own links; any other copy of
    // the app (her desktop) takes them from the shared copy, like the PC does.
    const runsSyncs = !this.data.profile.syncDevice || this.data.profile.syncDevice === (await DeviceKV.get("device.id", null));
    const merged = mergePlanner(this.data, other, runsSyncs ? "phone" : "viewer");
    if (samePlanner(merged, this.data)) return false;
    this.data = merged;
    for (const k of ["tasks", "moods", "cycle", "profile"]) await DeviceKV.set(k, this.data[k]);
    return true;
  },
  // The Google / To Do syncs work on a copy of her tasks (they wait on the network a lot)…
  snapshotTasks() {
    const tasks = JSON.parse(JSON.stringify(this.data.tasks));
    return { tasks, before: new Map(this.data.tasks.map(t => [t.id, t.updatedAt])) };
  },
  // …and hand their results back here. A task she edited while the sync ran keeps her edit
  // and only takes the sync's link for `service` ("google" / "microsoft").
  async applySync(copy, before, service) {
    const cur = this.data.tasks;
    const at = new Map(cur.map((t, i) => [t.id, i]));
    let changed = false;
    for (const t of copy) {
      const i = at.get(t.id);
      if (i === undefined) { cur.push(t); changed = true; continue; }
      let next;
      if (cur[i].updatedAt === before.get(t.id)) next = t;
      else {
        const external = { ...(cur[i].external || {}) };
        const link = (t.external || {})[service];
        if (link) external[service] = link; else delete external[service];
        next = { ...cur[i], external };
      }
      if (stableJson(next) !== stableJson(cur[i])) { cur[i] = next; changed = true; }
    }
    if (changed) await this._save("tasks");
    return changed;
  },
  // Replace everything at once.
  async replaceAll(data) {
    this.data = { tasks: data.tasks || [], moods: data.moods || {}, cycle: data.cycle || { starts: [], length: 28, periodLength: 5 },
      profile: data.profile || {} };
    for (const k of ["tasks", "moods", "cycle", "profile"]) await DeviceKV.set(k, this.data[k]);
  },
  async putProfile(profile) {
    await this.load();
    this.data.profile = { ...this.data.profile, ...profile, updatedAt: nowIso() };
    await this._save("profile");
    return { ...this.data.profile };
  },
  async putCycle(cycle) {
    await this.load();
    this.data.cycle = { ...this.data.cycle, ...cycle, updatedAt: nowIso() };
    await this._save("cycle");
    return { ...this.data.cycle };
  },
  async put(task) {
    await this.load();
    const tasks = this.data.tasks, now = nowIso();
    const i = tasks.findIndex(t => t.id === task.id);
    let saved;
    if (i >= 0) {
      // The page never edits Google / To Do links: keep the stored ones (a sync may have just set them).
      const external = { ...(task.external || {}) };
      for (const service of ["google", "microsoft"]) {
        const link = (tasks[i].external || {})[service];
        if (link) external[service] = link;
      }
      saved = { ...tasks[i], ...task, external, updatedAt: now };
      tasks[i] = saved;
    } else {
      saved = { createdAt: now, deleted: false, done: false, notes: "", time: null, external: {}, ...task, updatedAt: now };
      tasks.push(saved);
    }
    await this._save("tasks");
    return { ...saved };
  },
  async remove(id) {
    await this.load();
    const t = this.data.tasks.find(x => x.id === id);
    if (t) { t.deleted = true; t.updatedAt = nowIso(); }
    await this._save("tasks");
  },
  async putMood(day, entry) {
    await this.load();
    this.data.moods[day] = { ...this.data.moods[day], ...entry, updatedAt: nowIso() };
    await this._save("moods");
    return { ...this.data.moods[day] };
  },
};

const Store = STANDALONE ? DeviceStore : location.protocol.startsWith("http") ? ApiStore : LocalStore;
