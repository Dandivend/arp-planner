// Google Calendar sync for the phone app: a line-by-line port of gcal.py's sync (keep the two
// in step). See gcal.py's header for what it does. Fingerprints (own_hash / imported_hash) come
// out exactly as Python makes them, so links made on the PC carry straight over.
//
// The sync works on a copy of her tasks and then hands its results back with
// DeviceStore.applySync, so an edit she makes while it runs isn't lost.

const ARP_CALENDAR_NAME = "ARP Planner";
const GCAL_FOOTER = "Added by ARP Planner";
const GCAL_PAST_DAYS = 14, GCAL_FUTURE_DAYS = 120;
const enc = s => encodeURIComponent(s);

// (date, time or null, minutes or null) for an event, on her clock.
function eventTimes(ev) {
  const start = ev.start || {}, end = ev.end || {};
  if (start.dateTime) {
    const s = SyncTZ.toLocal(start.dateTime);
    const mins = Math.max(0, Math.floor((Date.parse(end.dateTime || start.dateTime) - Date.parse(start.dateTime)) / 60000)) || null;
    return [s.day, s.time, mins];
  }
  return [start.date, null, null];
}

// The last day of an all-day event that runs several days (Google's end date is the day after), or
// null. Kept on the task as spanEnd, so a week of leave covers the whole week.
function spanEndOf(ev) {
  const s = (ev.start || {}).date, e = (ev.end || {}).date;
  return s && e && e > SyncTZ.addDays(s, 1) ? SyncTZ.addDays(e, -1) : null;
}

function taskToEvent(t) {
  let title = t.title || "(untitled)";
  if (t.dueDate && !t.time) title = "⏰ " + title + " (due)";
  if (t.done) title = "✅ " + title;
  const body = {
    summary: title,
    description: (((t.notes || "").trim() + "\n\n" + GCAL_FOOTER).trim()),
    extendedProperties: { private: { arpId: t.id } },
  };
  if (t.time) {
    body.start = { dateTime: SyncTZ.localIso(t.date, t.time) };
    body.end = { dateTime: SyncTZ.localIso(t.date, t.time, t.minutes || 30) };
  } else {
    const day = t.dueDate || t.date;
    body.start = { date: day };
    body.end = { date: SyncTZ.addDays(day, 1) };
  }
  return body;
}

function cleanEventTitle(summary) {
  let s = (summary || "").trim();
  const done = s.startsWith("✅");
  if (done) s = s.slice(1).trim();
  if (s.startsWith("⏰")) {
    s = s.slice(1).trim();
    if (s.endsWith("(due)")) s = s.slice(0, -5).trim();
  }
  return [s || "(No title)", done];
}

function cleanEventNotes(desc) {
  let d = (desc || "").replace(/\r/g, "");
  if (d.endsWith(GCAL_FOOTER)) d = d.slice(0, -GCAL_FOOTER.length);
  return d.trim().slice(0, 1000);
}

// Fingerprint of what we send to Google for one of her tasks.
async function ownHash(t) {
  if (!(t.dueDate || t.date)) return "no-day";
  const ev = taskToEvent(t);
  return pyHash([ev.summary, ev.description, ev.start, ev.end]);
}

// Fingerprint of the fields we sync back for an imported Google event.
const importedHash = t => pyHash([t.title ?? null, t.date ?? null, t.time ?? null, t.minutes ?? null, !!t.deleted]);

function applyEvent(ev, t, own) {
  const [day, hhmm, mins] = eventTimes(ev);
  const [title, done] = cleanEventTitle(ev.summary);
  t.title = title;
  if (own && t.dueDate && !t.time && !hhmm) {
    t.dueDate = day;                       // a deadline moved in Google
  } else {
    t.date = day;
    t.time = hhmm;
    if (hhmm) t.minutes = mins;
  }
  if (own) {
    t.notes = cleanEventNotes(ev.description);
    if (done !== !!t.done) {
      t.done = done;
      t.doneDate = done ? SyncTZ.today() : null;
    }
  }
}

function newTaskFromEvent(ev, calendarId, imported) {
  const [day, hhmm, mins] = eventTimes(ev);
  const [title, done] = cleanEventTitle(ev.summary);
  const now = new Date().toISOString();
  const hex = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
  return {
    id: "g-" + hex, date: day, time: hhmm, title, notes: cleanEventNotes(ev.description), done, doneDate: null, spanEnd: spanEndOf(ev),
    kind: hhmm ? "event" : "task", priority: "normal", dueDate: null, minutes: mins, area: null, effort: "light",
    workout: null, createdAt: now, updatedAt: now, deleted: false,
    external: { google: { calendarId, eventId: ev.id, updated: ev.updated, imported } },
  };
}

const PhoneCalendar = {
  busy: false,
  api: (method, path, body, query) => PhoneGoogle.request("calendar", method, path, body, query),

  async calendars() {
    let items = [], token = null;
    do {
      const q = { maxResults: 250 };
      if (token) q.pageToken = token;
      const res = await this.api("GET", "/users/me/calendarList", null, q);
      items = items.concat(res.items || []);
      token = res.nextPageToken;
    } while (token);
    const arp = (await PhoneGoogle.state()).arpCalendarId;
    return items.map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary,
      color: c.backgroundColor, isPlanner: c.id === arp }));
  },

  async events(calId, timeMin, timeMax) {
    let items = [], token = null;
    do {
      const q = { timeMin, timeMax, singleEvents: "true", showDeleted: "true", maxResults: 2500 };
      if (token) q.pageToken = token;
      const res = await this.api("GET", `/calendars/${enc(calId)}/events`, null, q);
      items = items.concat(res.items || []);
      token = res.nextPageToken;
    } while (token);
    return items;
  },

  async ensurePlannerCalendar() {
    const id = (await PhoneGoogle.state()).arpCalendarId;
    if (id) {
      try { await this.api("GET", `/calendars/${enc(id)}`); return id; }
      catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
    }
    // Reconnecting / taking over from the PC: reuse her ARP Planner calendar instead of making a second one.
    for (const c of await this.calendars()) {
      if (c.name === ARP_CALENDAR_NAME) { await PhoneGoogle.saveState({ arpCalendarId: c.id }); return c.id; }
    }
    const cal = await this.api("POST", "/calendars", { summary: ARP_CALENDAR_NAME, description: "Tasks and events from ARP Planner.",
      timeZone: SyncTZ.zone() });
    await PhoneGoogle.saveState({ arpCalendarId: cal.id });
    return cal.id;
  },

  // Two-way sync of `tasks` (changed in place), like gcal.GCal.sync. Returns the summary.
  async sync(tasks, profileNow) {
    const prefs = { ...DEFAULT_GOOGLE, ...((profileNow || {}).google || {}) };
    const push = { ...DEFAULT_GOOGLE.push, ...(prefs.push || {}) };
    const stats = { sent: 0, updatedInGoogle: 0, imported: 0, updatedHere: 0, removedHere: 0, removedInGoogle: 0 };
    const zoneName = (profileNow || {}).timeZone || "";
    const rezone = ((await PhoneGoogle.state()).zone || "") !== zoneName;
    const today = SyncTZ.today();
    const loDay = SyncTZ.addDays(today, -GCAL_PAST_DAYS), hiDay = SyncTZ.addDays(today, GCAL_FUTURE_DAYS);
    const timeMin = SyncTZ.localIso(loDay, "00:00"), timeMax = SyncTZ.localIso(hiDay, "00:00");
    const byId = new Map(tasks.map(t => [t.id, t]));
    const link = t => (t.external || {}).google;
    const account = (await PhoneGoogle.state()).account;
    // "primary" and the account's own address are the same calendar (a copy linked one way mustn't
    // come in again the other way, e.g. right after her phone takes the sync over from the PC).
    const sameCal = (a, b) => a === b || (!!account && ["primary", account].includes(a) && ["primary", account].includes(b));
    const find = (calId, eventId) => tasks.find(t => { const g = link(t); return g && g.eventId === eventId && sameCal(g.calendarId, calId); }) || null;
    const touch = t => { t.updatedAt = new Date().toISOString(); };
    const dropLink = t => { if (t.external) delete t.external.google; };
    // A removed duplicate that shares its event with a copy that stays lets go of it (so removing
    // the duplicate never deletes the event the other copy still uses).
    const liveEvents = new Set(tasks.filter(t => !t.deleted && link(t) && link(t).eventId).map(t => link(t).eventId));
    for (const t of tasks) if (t.deleted && link(t) && liveEvents.has(link(t).eventId)) { dropLink(t); touch(t); }

    const plannerCal = await this.ensurePlannerCalendar();

    // 1) The ARP Planner calendar: changes she made to her tasks in Google.
    for (const ev of await this.events(plannerCal, timeMin, timeMax)) {
      const arpId = ((ev.extendedProperties || {}).private || {}).arpId;
      let t = arpId ? byId.get(arpId) || null : find(plannerCal, ev.id);
      const g = t ? link(t) : null;
      if (ev.status === "cancelled") {
        // Deleted in Google: delete here too, unless she changed it here since.
        if (t && g && g.eventId === ev.id && !t.deleted && (await ownHash(t)) === g.hash) {
          t.deleted = true;
          dropLink(t);
          touch(t);
          stats.removedHere++;
        }
        continue;
      }
      if (t && g && arpId && g.calendarId === plannerCal && g.eventId !== ev.id) {
        // A second copy of the same task (shouldn't happen, but tidy it up if it does).
        await this.api("DELETE", `/calendars/${enc(plannerCal)}/events/${enc(ev.id)}`);
        stats.removedInGoogle++;
        continue;
      }
      if (t && !g && arpId) {
        // Lost its link: link it back up rather than sending a duplicate. Step 3 brings it up to date.
        t.external = { ...(t.external || {}), google: { calendarId: plannerCal, eventId: ev.id, updated: ev.updated, hash: null } };
        continue;
      }
      if (!t) {
        if (arpId) continue;                       // its task is gone; step 3 cleans the event up
        // An event she added straight to the ARP Planner calendar.
        t = newTaskFromEvent(ev, plannerCal, false);
        t.external.google.hash = await ownHash(t);
        tasks.push(t);
        byId.set(t.id, t);
        stats.imported++;
        continue;
      }
      if (!g || g.eventId !== ev.id) continue;
      if (rezone && t.id.startsWith("g-")) {
        // Made in Google: its moment is fixed, so read it in the new zone.
        applyEvent(ev, t, true);
        g.updated = ev.updated; g.hash = await ownHash(t);
        touch(t);
        stats.updatedHere++;
        continue;
      }
      const changedThere = ev.updated !== g.updated;
      const changedHere = (await ownHash(t)) !== g.hash;
      if (changedThere && !changedHere) {
        applyEvent(ev, t, true);
        g.updated = ev.updated; g.hash = await ownHash(t);
        touch(t);
        stats.updatedHere++;
      }
    }

    // 2) Her own calendars: copy events in, and send back time/title changes made here.
    for (const calId of prefs.importCalendars || []) {
      if (calId === plannerCal) continue;
      let events;
      try { events = await this.events(calId, timeMin, timeMax); }
      catch (e) { if ([403, 404, 410].includes(e.status)) continue; throw e; }
      for (const ev of events) {
        if (((ev.extendedProperties || {}).private || {}).arpId) continue;      // one of ours
        let t = find(calId, ev.id);
        if (ev.status === "cancelled") {
          if (t && !t.deleted) { t.deleted = true; touch(t); stats.removedHere++; }
          continue;
        }
        if (!t) {
          t = newTaskFromEvent(ev, calId, true);
          t.external.google.hash = await importedHash(t);
          tasks.push(t);
          byId.set(t.id, t);
          stats.imported++;
          continue;
        }
        const g = link(t);
        if (t.deleted) continue;                                  // hidden here on purpose; Google keeps it
        const se = spanEndOf(ev);
        if ((t.spanEnd || null) !== se) { t.spanEnd = se; touch(t); }
        const changedThere = rezone || ev.updated !== g.updated;
        const changedHere = (await importedHash(t)) !== g.hash;
        if (changedHere) {
          const patch = { summary: t.title };
          if (t.time) {
            patch.start = { dateTime: SyncTZ.localIso(t.date, t.time) };
            patch.end = { dateTime: SyncTZ.localIso(t.date, t.time, t.minutes || 30) };
          } else {
            patch.start = { date: t.date };
            patch.end = { date: SyncTZ.addDays(t.spanEnd && t.spanEnd > t.date ? t.spanEnd : t.date, 1) };   // (keep a multi-day event's length)
          }
          const res = await this.api("PATCH", `/calendars/${enc(calId)}/events/${enc(ev.id)}`, patch);
          g.updated = res.updated; g.hash = await importedHash(t);
          stats.updatedInGoogle++;
        } else if (changedThere) {
          applyEvent(ev, t, false);
          g.updated = ev.updated; g.hash = await importedHash(t);
          touch(t);
          stats.updatedHere++;
        }
      }
    }

    // 2b) Calendars she unticked: remove their copies from the planner (Google is untouched).
    const selected = new Set(prefs.importCalendars || []);
    const stillShown = calId => selected.has(calId) || (calId === "primary" && selected.has(account)) ||
      (calId === account && selected.has("primary"));
    for (const t of tasks) {
      const g = link(t);
      if (g && g.imported && !stillShown(g.calendarId)) {
        dropLink(t);
        if (!t.deleted) { t.deleted = true; touch(t); stats.removedHere++; }
      }
    }

    // 3) Her tasks -> the ARP Planner calendar.
    const base = `/calendars/${enc(plannerCal)}/events`;
    for (const t of tasks) {
      const g = link(t);
      if (g && g.imported) continue;
      const timed = !!t.time, deadline = !!t.dueDate && !t.time;
      const day = (deadline ? t.dueDate : t.date) || "";
      const wanted = !t.deleted && loDay <= day && day < hiDay && (timed ? push.timed : deadline ? push.deadlines : push.anytime);
      if (!wanted) {
        if (g && g.eventId && g.calendarId === plannerCal && (t.deleted || !day || (loDay <= day && day < hiDay))) {
          await this.api("DELETE", `${base}/${enc(g.eventId)}`);
          dropLink(t);
          stats.removedInGoogle++;
        }
        continue;
      }
      const body = taskToEvent(t), h = await ownHash(t);
      if (!g || g.calendarId !== plannerCal || !g.eventId) {
        const ev = await this.api("POST", base, body);
        t.external = { ...(t.external || {}), google: { calendarId: plannerCal, eventId: ev.id, updated: ev.updated, hash: h } };
        stats.sent++;
      } else if (g.hash !== h) {
        const ev = await this.api("PATCH", `${base}/${enc(g.eventId)}`, body);
        g.updated = ev.updated; g.hash = h;
        stats.updatedInGoogle++;
      }
    }

    await PhoneGoogle.saveState({ lastSync: new Date().toISOString(), lastResult: stats, lastError: null, zone: zoneName });
    return stats;
  },

  // The /api/google/… routes that need the calendar (the rest are in google-auth.js).
  async route(route, body = {}) {
    if (route === "calendars") return { calendars: await this.calendars() };
    if (route === "theirs") {
      // Read-only: the events on a calendar someone shared with her (the Logan tab).
      if (!body.calendarId) return { events: [] };
      const res = await this.api("GET", `/calendars/${encodeURIComponent(body.calendarId)}/events`, null, {
        timeMin: body.timeMin, timeMax: body.timeMax, singleEvents: "true", orderBy: "startTime", maxResults: 2500 });
      return { events: (res.items || []).filter(e => e.status !== "cancelled").map(e => {
        const s = e.start || {}, en = e.end || {};
        return { id: e.id, title: e.summary || "Busy", allDay: !!s.date, start: s.dateTime || s.date, end: en.dateTime || en.date,
          location: e.location || "", notes: (e.description || "").slice(0, 500) };
      }) };
    }
    if (route === "sync") {
      if (this.busy) return { busy: true };
      this.busy = true;
      try {
        // Taking the sync over from the PC: first bring in the PC's latest links (Drive),
        // then mark this phone as the one that syncs Google, and share that right away.
        await DeviceStore.load();
        // Another device (her phone, or her desktop) runs this sync: this one just shares through Drive.
        if (!(await mayRunSyncs())) {
          return { ok: true, skipped: true, stats: null, tasks: DeviceStore.data.tasks.map(t => ({ ...t })),
            status: await PhoneGoogle.status() };
        }
        if (syncOwnerOf(DeviceStore.data.profile, "google") !== "phone") {
          await PhoneDrive.readyToTakeOver();
          await PhoneDrive.sync(false);
          await DeviceStore.putProfile({ syncOwner: { ...(DeviceStore.data.profile.syncOwner || {}), google: "phone" } });
          await PhoneDrive.sync(false);
        }
        const { tasks: copy, before } = DeviceStore.snapshotTasks();
        const stats = await this.sync(copy, DeviceStore.data.profile);
        await DeviceStore.applySync(copy, before, "google");
        return { ok: true, stats, tasks: DeviceStore.data.tasks.map(t => ({ ...t })), status: await PhoneGoogle.status() };
      } finally { this.busy = false; }
    }
    if (route === "disconnect") {
      await PhoneGoogle.disconnect();
      // Forget the links. Copies of her Google events go away (they live in Google).
      const { tasks: copy, before } = DeviceStore.snapshotTasks();
      for (const t of copy) {
        const g = (t.external || {}).google;
        if (!g) continue;
        delete t.external.google;
        if (g.imported && !t.deleted) t.deleted = true;
        t.updatedAt = new Date().toISOString();
      }
      await DeviceStore.applySync(copy, before, "google");
      return { ok: true, tasks: DeviceStore.data.tasks.map(t => ({ ...t })), status: await PhoneGoogle.status() };
    }
    throw new PhoneApiError("not found", 404);
  },
};
