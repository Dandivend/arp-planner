// Microsoft To Do sync for the phone app: a line-by-line port of mstodo.py (keep the two in
// step; see its header for what the sync does). Fingerprints match Python's exactly, so the
// links the PC made carry over when her phone takes the sync over.
//
// Sign-in: a web page may only redeem Microsoft sign-ins sent to a "Single-page application"
// redirect address: this app's own address (added in the Azure app registration). So here it's
// a normal redirect (no pasting): Microsoft sends her back to the app with ?code=…. Those
// sign-ins last 24 hours; after that the app quietly signs in again (a quick hop to Microsoft
// and back, only when she isn't in the middle of something).

const MS_URLS = {
  login: "https://login.microsoftonline.com",
  graph: "https://graph.microsoft.com/v1.0",
  ...((window.ARP_CONFIG || {}).microsoft || {}),
};
const MS_SCOPE = "offline_access User.Read Tasks.ReadWrite";
const ARP_LIST_NAME = "ARP Planner";
const MS_PAST_DAYS = 14, MS_FUTURE_DAYS = 120;
const MS_GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

class TodoError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// The address Microsoft sends her back to: this app (registered as a single-page app in Azure).
const msRedirect = () => location.origin + location.pathname.replace(/index\.html$/, "");

// ---------- how long a to-do takes ("2 hours", "1 hour 30 mins", "an hour") ----------
const MS_H = String.raw`\b(?:half an?|\d+(?:\.\d+)?|an?|one)\s*(?:hours?|hrs?|h)\b`;
const MS_M = String.raw`\b\d+\s*(?:minutes?|mins?|m)\b`;
const MS_DURATION = String.raw`(?<h>${MS_H})(?:\s*(?:and\s*)?(?<m>${MS_M}))?|(?<m2>${MS_M})`;

function durationMatch(text) {
  for (const mt of (text || "").matchAll(new RegExp(MS_DURATION, "gi"))) {
    const h = mt.groups.h, mm = mt.groups.m || mt.groups.m2;
    let total = 0;
    if (h) {
      const n = h.toLowerCase().split(/\s+/)[0];
      total += n === "half" ? 30 : ["a", "an", "one"].includes(n) ? 60 : parseFloat(n.match(/^[\d.]+/)[0]) * 60;
    }
    if (mm) total += parseInt(mm.match(/\d+/)[0], 10);
    if (total > 0 && total <= 24 * 60) return [mt, Math.round(total)];
  }
  return [null, null];
}
const parseMinutes = text => durationMatch(text)[1];

function formatMinutesMs(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  const parts = [...(h ? [`${h} hour${h > 1 ? "s" : ""}`] : []), ...(mm ? [`${mm} min${mm > 1 ? "s" : ""}`] : [])];
  return parts.join(" ") || "0 mins";
}

// A name to match on: "Wash (30 min)" and "wash" are the same step.
const msNameKey = text => (text || "").toLowerCase().replace(new RegExp(MS_DURATION, "gi"), "").replace(/[^a-z0-9]+/g, " ").trim();

// {task name + step name: minutes}, from the most recent tasks where she set a step's time.
function stepMemory(tasks) {
  const best = new Map();
  for (const t of tasks) {
    if (t.deleted) continue;
    for (const s of t.steps || []) {
      if (!s.minutes) continue;
      const key = msNameKey(t.title) + "\u0000" + msNameKey(s.title), when = t.updatedAt || "";
      if (!best.has(key) || when >= best.get(key)[0]) best.set(key, [when, s.minutes]);
    }
  }
  return new Map([...best].map(([k, v]) => [k, v[1]]));
}

// Her notes as they should read in To Do: a length she changed in the planner replaces the one written there.
function notesOut(t) {
  const notes = t.notes || "", mins = t.minutes;
  if (!mins) return notes;
  const [mt, cur] = durationMatch(notes);
  if (cur === mins) return notes;
  if (mt) return notes.slice(0, mt.index) + formatMinutesMs(mins) + notes.slice(mt.index + mt[0].length);
  const m = (t.external || {}).microsoft || {};
  if ((m.imported || m.pending) && parseMinutes(t.title) !== mins) return (formatMinutesMs(mins) + "\n" + notes).trim();
  return notes;
}

function cleanTodoNotes(body) {
  body = body || {};
  let text = body.content || "";
  if ((body.contentType || "").toLowerCase() === "html") {
    text = text.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "");
    const ta = document.createElement("textarea");
    ta.innerHTML = text;
    text = ta.value;
  }
  text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  return text.trim().slice(0, 1000);
}

// ---------- To Do dates <-> planner ----------
function dueDay(todo) {
  const d = todo.dueDateTime || {};
  const raw = (d.dateTime || "").slice(0, 19);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 10) || null;
  if (raw.endsWith("00:00:00") || !["UTC", "Z"].includes((d.timeZone || "UTC").toUpperCase())) return raw.slice(0, 10);
  return SyncTZ.toLocal(raw + "Z").day;
}
const dueBody = day => (day ? { dateTime: day + "T12:00:00", timeZone: "UTC" } : null);   // noon UTC: the same date almost everywhere
function reminderBody(day, hhmm) {
  return { dateTime: new Date(SyncTZ.localMs(day, hhmm)).toISOString().slice(0, 19), timeZone: "UTC" };
}
const dueValue = t => t.dueDate || t.date || null;

function taskToTodo(t) {
  const body = {
    title: t.title || "(untitled)",
    body: { content: notesOut(t), contentType: "text" },
    importance: t.priority === "important" ? "high" : "normal",
    status: t.done ? "completed" : "notStarted",
    dueDateTime: dueBody(dueValue(t)),
  };
  if (t.time && t.date) {
    body.isReminderOn = true;
    body.reminderDateTime = reminderBody(t.date, t.time);
  }
  return body;
}

// The fields of a to-do that differ from the planner's task (only these get sent).
function toDoChanges(t, todo) {
  const want = taskToTodo(t), out = {};
  if (want.title !== (todo.title || "").trim()) out.title = want.title;
  if (want.body.content.trim().slice(0, 1000) !== cleanTodoNotes(todo.body)) out.body = want.body;
  if (want.importance !== (todo.importance === "high" ? "high" : "normal")) out.importance = want.importance;
  if (want.status !== (todo.status === "completed" ? "completed" : "notStarted")) out.status = want.status;
  // Never write a repeating to-do's due date: To Do splits it into a copy (the duplicate chores).
  if (!todo.recurrence && dueValue(t) !== dueDay(todo)) out.dueDateTime = want.dueDateTime;
  if (want.reminderDateTime) {
    const have = ((todo.reminderDateTime || {}).dateTime || "").slice(0, 16);
    if (!todo.isReminderOn || have !== want.reminderDateTime.dateTime.slice(0, 16)) {
      out.isReminderOn = true;
      out.reminderDateTime = want.reminderDateTime;
    }
  }
  return out;
}

function todoHash(t) {
  const b = taskToTodo(t);
  return pyHash([b.title, b.body.content, b.importance, b.status, b.dueDateTime, b.reminderDateTime || null]);
}

function applyTodo(todo, t, m) {
  t.title = (todo.title || "").trim() || "(No title)";
  t.notes = cleanTodoNotes(todo.body);
  const mins = parseMinutes(t.notes) || parseMinutes(t.title);
  if (mins || m.imported) t.minutes = mins;           // her to-dos: the length written in To Do (none = no length)
  if (todo.importance === "high") t.priority = "important";
  else if (t.priority === "important") t.priority = "normal";
  const done = todo.status === "completed";
  if (done !== !!t.done) { t.done = done; t.doneDate = done ? SyncTZ.today() : null; }
  const d = dueDay(todo);
  if (t.dueDate) {                                     // a planner deadline: To Do's due date is the deadline
    if (d) { t.dueDate = d; t.date = [t.date || d, d].sort()[0]; }
    else t.dueDate = null;                             // due date removed in To Do: keep the day it's planned for
  } else if (m.keepDate && d === m.dueSeen) {
    // a repeating to-do she moved in the planner only: keep her day
  } else {
    t.date = d;                                        // the day it's planned for (null = no date yet)
    delete m.keepDate; delete m.dueSeen;
  }
}

const isChoreList = name => (name || "").toLowerCase().includes("chore");

function newTaskFromTodo(todo, listId, imported, chore = false) {
  const now = new Date().toISOString();
  const hex = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
  const t = {
    id: "m-" + hex, date: null, time: null, title: "", notes: "", done: false, doneDate: null, kind: chore ? "chore" : "task",
    priority: "normal", dueDate: null, minutes: null, area: null, effort: chore ? null : "light",
    workout: null, createdAt: now, updatedAt: now, deleted: false, external: {},
  };
  const m = { listId, taskId: todo.id, updated: todo.lastModifiedDateTime, imported, shaped: true };
  applyTodo(todo, t, m);
  return [t, m];
}

const PhoneMS = {
  busy: false,
  memory: new Map(),
  async client() { return ((await PhoneSetup.get()) || {}).microsoft || null; },
  token: () => DeviceKV.get("ms.token", null),
  state: async () => (await DeviceKV.get("ms.state", {})) || {},
  async saveState(changes) { await DeviceKV.set("ms.state", { ...(await this.state()), ...changes }); },
  async endpoint(kind) { return `${MS_URLS.login}/${((await this.client()) || {}).tenant || "consumers"}/oauth2/v2.0/${kind}`; },

  async status() {
    const tok = await this.token(), s = await this.state();
    return { hasClient: !!(await this.client()), connected: !!(tok && tok.refresh_token), account: s.account || null,
      lastSync: s.lastSync || null, lastResult: s.lastResult || null, lastError: s.lastError || null, lists: s.lists || [],
      phoneApp: true, needsSignIn: !!s.needsSignIn };
  },

  async saveClient(clientId, tenant) {
    clientId = (clientId || "").trim();
    if (!MS_GUID.test(clientId)) {
      throw new TodoError("That doesn't look like an Application (client) ID. It's 36 characters like " +
        "1a2b3c4d-1234-5678-9abc-0123456789ab, on the app's Overview page in Azure.");
    }
    const setup = (await PhoneSetup.get()) || {};
    await PhoneSetup.set({ ...setup, microsoft: { client_id: clientId, tenant: tenant || "consumers" } });
  },

  // The sign-in address. silent: try without showing anything (her Microsoft session is still on).
  async connect(silent = false) {
    const c = await this.client();
    if (!c) throw new PhoneApiError("Set up this phone first (Settings → 📲 Phone app).");
    const verifier = randomB64(48);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = "ms" + randomB64(16);
    const pending = Object.fromEntries(Object.entries(await DeviceKV.get("ms.pending", {})).slice(-4));
    pending[state] = { verifier, redirect: msRedirect(), silent, at: Date.now() };
    await DeviceKV.set("ms.pending", pending);
    const q = { client_id: c.client_id, redirect_uri: msRedirect(), response_type: "code", response_mode: "query",
      scope: MS_SCOPE, code_challenge: challenge, code_challenge_method: "S256", state,
      prompt: silent ? "none" : "select_account" };
    const account = (await this.state()).account;
    if (silent && account) q.login_hint = account;
    return { url: (await this.endpoint("authorize")) + "?" + new URLSearchParams(q) };
  },

  async _tokenRequest(fields) {
    let r;
    try {
      r = await fetch(await this.endpoint("token"), { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
    } catch { throw new TodoError("Couldn't reach Microsoft. Are you online?"); }
    const res = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = (res.error_description || "").split("\r\n")[0];
      throw new TodoError(`Microsoft sign-in failed (${res.error || r.status}): ${detail.slice(0, 300)}`, r.status);
    }
    return res;
  },

  // Microsoft sent her back here (?code=…&state=…, or ?error=…).
  async finish(params) {
    const pending = await DeviceKV.get("ms.pending", {});
    const p = pending[params.state];
    if (!p) throw new PhoneApiError("This sign-in link has expired. Start again from Settings.");
    delete pending[params.state];
    await DeviceKV.set("ms.pending", pending);
    if (params.error) {
      if (p.silent) { await this.saveState({ needsSignIn: true }); return false; }    // she has to sign in herself
      const desc = (params.error_description || "").split("\r\n")[0];
      throw new PhoneApiError(`Microsoft sign-in didn't finish (${params.error}). ${desc}`.trim());
    }
    const c = await this.client();
    const tok = await this._tokenRequest({ client_id: c.client_id, scope: MS_SCOPE, code: params.code,
      redirect_uri: p.redirect, grant_type: "authorization_code", code_verifier: p.verifier });
    tok.expires_at = Date.now() / 1000 + Number(tok.expires_in || 3600);
    await DeviceKV.set("ms.token", tok);
    await this.saveState({ needsSignIn: false, renewTried: null });
    try {
      const me = await this.request("GET", "/me");
      await this.saveState({ account: me.userPrincipalName || me.mail || me.displayName, lastError: null });
    } catch {}
    return true;
  },

  async accessToken() {
    const tok = await this.token();
    if (!tok || !tok.refresh_token) throw new TodoError("Not connected to Microsoft.");
    if ((tok.expires_at || 0) - Date.now() / 1000 < 60) {
      const c = (await this.client()) || {};
      let fresh;
      try {
        fresh = await this._tokenRequest({ client_id: c.client_id || "", scope: MS_SCOPE, refresh_token: tok.refresh_token,
          grant_type: "refresh_token" });
      } catch (e) {
        if (/invalid_grant|interaction_required/.test(e.message)) {
          // Single-page-app sign-ins only last a day: next time she opens the app, sign in again quietly.
          await DeviceKV.set("ms.token", null);
          await this.saveState({ renew: true });
          throw new TodoError("Your Microsoft sign-in expired. Press Connect to sign in again.");
        }
        throw e;
      }
      Object.assign(tok, fresh, { expires_at: Date.now() / 1000 + Number(fresh.expires_in || 3600) });
      await DeviceKV.set("ms.token", tok);
    }
    return tok.access_token;
  },

  async request(method, path, body, query) {
    let url = path.startsWith("http") ? path : MS_URLS.graph + path;
    if (query) url += (url.includes("?") ? "&" : "?") + new URLSearchParams(query);
    const headers = { Authorization: "Bearer " + (await this.accessToken()) };
    if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
    let r;
    try { r = await fetch(url, { method, headers, body: body !== undefined && body !== null ? JSON.stringify(body) : undefined }); }
    catch { throw new TodoError("Couldn't reach Microsoft. Are you online?"); }
    if (!r.ok) {
      if (r.status === 404 && method === "DELETE") return {};
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      throw new TodoError(`Microsoft To Do error ${r.status} on ${method} ${path.split("?")[0]}: ${detail}`, r.status);
    }
    const raw = await r.text();
    return raw ? JSON.parse(raw) : {};
  },

  async paged(path, query) {
    let items = [], url = path, q = query;
    while (url) {
      const res = await this.request("GET", url, null, q);
      items = items.concat(res.value || []);
      url = res["@odata.nextLink"]; q = null;
    }
    return items;
  },

  async lists() {
    const arp = (await this.state()).arpListId;
    return (await this.paged("/me/todo/lists")).map(l => ({ id: l.id, name: l.displayName || "(untitled list)",
      default: l.wellknownListName === "defaultList", flagged: l.wellknownListName === "flaggedEmails",
      shared: !!l.isShared && l.isOwner === false, isPlanner: l.id === arp }));
  },

  // Open to-dos of a list, with their steps (checklistItems) when Microsoft allows it.
  async openTodos(listId) {
    const path = `/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
    const openOnly = { $filter: "status ne 'completed'", $top: "100" };
    for (const query of [{ ...openOnly, $expand: "checklistItems" }, openOnly]) {
      try { return await this.paged(path, query); }
      catch (e) { if (e.status !== 400) throw e; }
    }
    return (await this.paged(path)).filter(x => x.status !== "completed");
  },

  // A to-do's steps <-> the task's sub-checkboxes (t.steps), like mstodo._sync_steps.
  async syncSteps(t, todo, taskPath, stats, touch) {
    if (!("checklistItems" in todo)) return;
    const m = t.external.microsoft;
    const base = m.stepsBase || {};
    const local = new Map((t.steps || []).map(s => [s.id, !!s.done]));
    const mins = new Map((t.steps || []).map(s => [s.id, s.minutes]));
    const steps = [];
    for (const item of todo.checklistItems) {
      const sid = item.id, there = !!item.isChecked;
      const here = local.has(sid) ? local.get(sid) : there;
      let done = there;
      if (here !== (sid in base ? base[sid] : there) && here !== there) {      // ticked or unticked in the planner
        await this.request("PATCH", `${taskPath}/checklistItems/${encodeURIComponent(sid)}`, { isChecked: here });
        done = here;
        stats.updatedThere++;
      }
      const title = (item.displayName || "").trim();
      const minutes = mins.get(sid) || parseMinutes(title) || this.memory.get(msNameKey(t.title) + "\u0000" + msNameKey(title)) || null;
      steps.push({ id: sid, title, done, minutes });
    }
    if (stableJson(steps) !== stableJson(t.steps || [])) { t.steps = steps; touch(t); }
    m.stepsBase = Object.fromEntries(steps.map(s => [s.id, s.done]));
    const known = steps.reduce((sum, s) => sum + (s.minutes || 0), 0);
    if (known) {
      const length = steps.every(s => s.minutes) ? known : Math.max(t.minutes || 0, known);
      if (t.minutes !== length) { t.minutes = length; touch(t); }
    }
  },

  async ensurePlannerList(lists) {
    const arp = (await this.state()).arpListId;
    if (arp && lists.some(l => l.id === arp)) return arp;
    for (const l of lists) {                             // reconnecting / taking over? reuse the list she has
      if (l.name === ARP_LIST_NAME) { await this.saveState({ arpListId: l.id }); return l.id; }
    }
    const created = await this.request("POST", "/me/todo/lists", { displayName: ARP_LIST_NAME });
    await this.saveState({ arpListId: created.id });
    lists.push({ id: created.id, name: ARP_LIST_NAME, default: false, flagged: false, shared: false, isPlanner: true });
    return created.id;
  },

  // Bring one linked task and its to-do into line (the planner wins a tie), like mstodo._settle.
  async settle(t, todo, listId, stats, touch, taskUrl, changedThere) {
    const m = t.external.microsoft;
    const out = notesOut(t);
    if (out !== (t.notes || "")) { t.notes = out; touch(t); }
    if ((await todoHash(t)) !== m.hash) {
      const changes = toDoChanges(t, todo);
      if (todo.recurrence && dueValue(t) !== dueDay(todo)) { m.keepDate = t.date ?? null; m.dueSeen = dueDay(todo); }   // moved here only
      if (Object.keys(changes).length) {
        const res = await this.request("PATCH", taskUrl(listId, todo.id), changes);
        todo = (res && Object.keys(res).length) ? res : todo;
        stats.updatedThere++;
      }
      m.updated = todo.lastModifiedDateTime; m.hash = await todoHash(t);
    } else if (changedThere) {
      applyTodo(todo, t, m);
      m.updated = todo.lastModifiedDateTime; m.hash = await todoHash(t);
      touch(t);
      stats.updatedHere++;
    }
    m.closed = !!t.done && todo.status === "completed";
  },

  // Two-way sync of `tasks` (changed in place), like mstodo.MSTodo.sync. Returns the summary.
  async sync(tasks, profileNow) {
    const prefs = { ...DEFAULT_MS, ...((profileNow || {}).microsoft || {}) };
    const push = { ...DEFAULT_MS.push, ...(prefs.push || {}) };
    const stats = { sent: 0, updatedThere: 0, imported: 0, updatedHere: 0, removedHere: 0, removedThere: 0 };
    this.memory = stepMemory(tasks);
    const today = SyncTZ.today();
    const loDay = SyncTZ.addDays(today, -MS_PAST_DAYS), hiDay = SyncTZ.addDays(today, MS_FUTURE_DAYS);
    const link = t => (t.external || {}).microsoft;
    const dropLink = t => { if (t.external) delete t.external.microsoft; };
    const touch = t => { t.updatedAt = new Date().toISOString(); };
    const taskUrl = (listId, taskId) => `/me/todo/lists/${encodeURIComponent(listId)}/tasks` + (taskId ? "/" + encodeURIComponent(taskId) : "");
    const wanted = t => {
      if (t.deleted) return false;
      const g = (t.external || {}).google;
      if (g && g.imported) return false;                 // her Google calendar events stay in Google
      const kind = t.kind || (t.time ? "event" : "task");
      const ok = kind === "workout" ? push.workouts : t.time ? push.timed : push.anytime;
      if (!ok) return false;
      if (link(t)) return true;                          // already there: keep it in step (done ones too)
      const day = t.dueDate || t.date || "";
      return !t.done && loDay <= day && day < hiDay;
    };

    const lists = await this.lists();
    const plannerList = await this.ensurePlannerList(lists);
    const listIds = new Set(lists.map(l => l.id));
    const defaultId = (lists.find(l => l.default) || {}).id || null;
    const selected = new Set();
    if (prefs.importLists === null || prefs.importLists === undefined) {
      for (const l of lists) if (l.id !== plannerList && !l.flagged) selected.add(l.id);
    }
    for (let x of prefs.importLists || []) {
      x = x === "defaultList" ? defaultId : x;
      if (x && listIds.has(x) && x !== plannerList) selected.add(x);
    }
    const listNames = Object.fromEntries(lists.map(l => [l.id, l.name]));

    // Tidy up to-dos brought in by older versions of the planner (once each).
    for (const t of tasks) {
      const m = link(t);
      if (!m) continue;
      if ("floating" in m || "rolled" in m) {
        if (m.imported) {
          if (m.floating) t.date = null;
          else if (t.dueDate) { t.date = t.dueDate; t.dueDate = null; }
        }
        delete m.floating; delete m.rolled;
        touch(t);
      }
      if (m.imported && !m.shaped) {
        if (!t.minutes) t.minutes = parseMinutes(t.notes) || parseMinutes(t.title);
        if (isChoreList(listNames[m.listId]) && (t.kind || "task") === "task") {
          t.kind = "chore";
          if (t.effort === "light") t.effort = null;
        }
        m.shaped = true;
        touch(t);
      }
    }

    // 0) To-dos she added in the planner's To Do tab: create them in the list she picked.
    for (const t of tasks) {
      const m = link(t);
      if (!m || !m.pending) continue;
      if (t.deleted || !listIds.has(m.listId)) { dropLink(t); continue; }
      const todo = await this.request("POST", taskUrl(m.listId), taskToTodo(t));
      t.external.microsoft = { listId: m.listId, taskId: todo.id, imported: m.listId !== plannerList,
        updated: todo.lastModifiedDateTime, hash: await todoHash(t) };
      stats.sent++;
    }

    // 1) Each synced list: copy to-dos in, and send changes made here.
    for (const listId of [plannerList, ...[...selected].sort()]) {
      const own = listId === plannerList;
      let remote;
      try { remote = await this.openTodos(listId); }
      catch (e) { if (e.status === 403 || e.status === 404) continue; throw e; }
      const linked = new Map();
      for (const t of tasks) { const m = link(t); if (m && m.listId === listId && m.taskId) linked.set(m.taskId, t); }
      const seen = new Set();
      for (const todo of remote) {
        seen.add(todo.id);
        let t = linked.get(todo.id);
        if (!t) {
          if (own) {
            // Reconnecting? Link an unlinked planner task with the same title instead of duplicating it.
            const title = (todo.title || "").trim();
            t = tasks.find(x => !link(x) && wanted(x) && (x.title || "").trim() === title) || null;
            if (t) {
              t.external = { ...(t.external || {}), microsoft: { listId, taskId: todo.id, updated: todo.lastModifiedDateTime, imported: false, hash: null } };
              linked.set(todo.id, t);
              await this.settle(t, todo, listId, stats, touch, taskUrl, false);
              await this.syncSteps(t, todo, taskUrl(listId, todo.id), stats, touch);
              continue;
            }
          }
          const [nt, m] = newTaskFromTodo(todo, listId, !own, !own && isChoreList(listNames[listId]));
          m.hash = await todoHash(nt);
          nt.external.microsoft = m;
          tasks.push(nt);
          linked.set(todo.id, nt);
          await this.syncSteps(nt, todo, taskUrl(listId, todo.id), stats, touch);
          stats.imported++;
          continue;
        }
        if (t.deleted || (own && !wanted(t))) continue;   // hidden here (her list) or handled in step 3 (ARP list)
        await this.settle(t, todo, listId, stats, touch, taskUrl, todo.lastModifiedDateTime !== link(t).updated);
        await this.syncSteps(t, todo, taskUrl(listId, todo.id), stats, touch);
      }
      // Linked to-dos that weren't in the open list: finished or deleted in To Do.
      for (const [taskId, t] of linked) {
        if (seen.has(taskId)) continue;
        const m = link(t);
        const changedHere = (await todoHash(t)) !== m.hash;
        if (m.closed && !changedHere) continue;          // done on both sides already
        if (t.deleted && !own) continue;
        if (own && !wanted(t)) continue;
        let todo;
        try { todo = await this.request("GET", taskUrl(listId, taskId)); }
        catch (e) {
          if (e.status !== 404) throw e;
          // Deleted in To Do.
          dropLink(t);
          if (!(own && changedHere) && !t.deleted) { t.deleted = true; touch(t); stats.removedHere++; }
          continue;
        }
        await this.settle(t, todo, listId, stats, touch, taskUrl, todo.lastModifiedDateTime !== m.updated);
      }
    }

    // 2) Lists she unticked: remove their copies here (To Do is untouched).
    for (const t of tasks) {
      const m = link(t);
      if (m && m.imported && !selected.has(m.listId)) {
        dropLink(t);
        if (!t.deleted) { t.deleted = true; touch(t); stats.removedHere++; }
      }
    }

    // 3) Her planner tasks -> the ARP Planner list.
    for (const t of tasks) {
      let m = link(t);
      if (m && m.imported) continue;
      if (m && m.listId !== plannerList) { dropLink(t); m = null; }   // its old list is gone
      if (!wanted(t)) {
        if (m) {
          await this.request("DELETE", taskUrl(plannerList, m.taskId));
          dropLink(t);
          stats.removedThere++;
        }
        continue;
      }
      if (m) continue;                                     // kept in step by step 1
      const todo = await this.request("POST", taskUrl(plannerList), taskToTodo(t));
      t.external = { ...(t.external || {}), microsoft: { listId: plannerList, imported: false, taskId: todo.id,
        updated: todo.lastModifiedDateTime, hash: await todoHash(t) } };
      stats.sent++;
    }

    const shown = lists.filter(l => l.id !== plannerList && !l.flagged)
      .map(l => ({ id: l.id, name: l.name, default: l.default, synced: selected.has(l.id) }));
    await this.saveState({ lastSync: new Date().toISOString(), lastResult: stats, lastError: null, lists: shown });
    return stats;
  },

  // The /api/microsoft/… routes the To Do Settings card and To Do tab call (planner.pyw's _microsoft).
  async route(route, body) {
    if (route === "status") return this.status();
    if (route === "client") { await this.saveClient(body.clientId, body.tenant); return this.status(); }
    if (route === "connect") return this.connect(false);
    if (route === "finish") {
      // A pasted address (or the test relay): …?state=…&code=…
      const text = (body.url || "").trim();
      const params = Object.fromEntries(new URLSearchParams((text.includes("?") ? text.split("?").slice(1).join("?") : text).split("#")[0]));
      await this.finish(params);
      return this.status();
    }
    if (route === "lists") return { lists: await this.lists() };
    if (route === "sync") {
      if (this.busy) return { busy: true };
      this.busy = true;
      try {
        // Taking the sync over from the PC: bring in the PC's latest links first (Drive), then mark
        // this phone as the one that syncs To Do, and share that right away.
        await DeviceStore.load();
        if (syncOwnerOf(DeviceStore.data.profile, "microsoft") !== "phone") {
          await PhoneDrive.sync(false);
          await DeviceStore.putProfile({ syncOwner: { ...(DeviceStore.data.profile.syncOwner || {}), microsoft: "phone" } });
          await PhoneDrive.sync(false);
        }
        const { tasks: copy, before } = DeviceStore.snapshotTasks();
        const stats = await this.sync(copy, DeviceStore.data.profile);
        await DeviceStore.applySync(copy, before, "microsoft");
        return { ok: true, stats, tasks: DeviceStore.data.tasks.map(t => ({ ...t })), status: await this.status() };
      } finally { this.busy = false; }
    }
    if (route === "disconnect") {
      await DeviceKV.set("ms.token", null);
      await DeviceKV.set("ms.state", {});
      // Forget the links. Copies of to-dos from her own lists go away (they live in To Do).
      const { tasks: copy, before } = DeviceStore.snapshotTasks();
      for (const t of copy) {
        const m = (t.external || {}).microsoft;
        if (!m) continue;
        delete t.external.microsoft;
        if (m.imported && !t.deleted) t.deleted = true;
        t.updatedAt = new Date().toISOString();
      }
      await DeviceStore.applySync(copy, before, "microsoft");
      return { ok: true, tasks: DeviceStore.data.tasks.map(t => ({ ...t })), status: await this.status() };
    }
    throw new PhoneApiError("not found", 404);
  },
};

if (STANDALONE) {
  PhoneApi.on("/api/microsoft/", async (route, body) => {
    try { return await PhoneMS.route(route, body); }
    catch (e) {
      if (e instanceof TodoError) {
        await PhoneMS.saveState({ lastError: e.message, lastErrorAt: new Date().toISOString() });
        throw new PhoneApiError(e.message, 502);
      }
      throw e;
    }
  });

  // Back from Microsoft's sign-in page: ?code=…&state=ms… (or ?error=…). Finished once the whole
  // app has loaded (this file loads before app.js).
  const q = new URLSearchParams(location.search);
  if ((q.get("state") || "").startsWith("ms") && (q.get("code") || q.get("error"))) {
    const params = Object.fromEntries(q);
    history.replaceState(null, "", msRedirect());            // keep the code out of her history
    addEventListener("load", async () => {
      try {
        const ok = await PhoneMS.finish(params);
        if (typeof loadMsStatus === "function") await loadMsStatus();
        if (ok) {
          showToast("🎉 Microsoft To Do connected! Syncing now…");
          if (typeof syncMicrosoft === "function") syncMicrosoft(false);
        }
      } catch (e) { showError(e.message); }
    });
  }

  // A day-old sign-in: renew it quietly when she opens the app (not while she's busy, and not
  // more than once every half hour, so a "needs her" answer can't bounce the app around).
  const renewIfDue = async () => {
    const s = await PhoneMS.state();
    if (!s.renew || s.needsSignIn || (await PhoneMS.token()) || document.hidden) return;
    if (s.renewTried && Date.now() - s.renewTried < 30 * 60 * 1000) return;
    if ((typeof userIsEditing === "function" && userIsEditing()) || document.querySelector("dialog[open]")) return;
    await PhoneMS.saveState({ renewTried: Date.now(), renew: false });
    location.href = (await PhoneMS.connect(true)).url;
  };
  setTimeout(renewIfDue, 2500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(renewIfDue, 1000); });
}
