// The phone app shares her planner through one file in her Google Drive, "ARP Planner data.json".
// Her phone merges with it when the app opens, after she changes something, and every few
// minutes while it's open; the PC planner does the same (drive.py). Merge rules: syncs/merge.js.
// Google / To Do links come from whichever device runs that sync (profile.syncOwner).

const DRIVE_FILE = "ARP Planner data.json";
const DRIVE_EVERY = 3 * 60 * 1000;        // while the app is open
const DRIVE_AFTER_CHANGE = 15 * 1000;     // changes come in bursts

const PhoneDrive = {
  busy: false,
  timer: null,
  state: async () => (await DeviceKV.get("drive.state", {})) || {},
  async saveState(changes) { await DeviceKV.set("drive.state", { ...(await this.state()), ...changes }); },

  async _findFile() {
    const s = await this.state();
    if (s.fileId) {
      try { return await PhoneGoogle.request("drive", "GET", "/files/" + s.fileId, null, { fields: "id,modifiedTime,trashed" }); }
      catch (e) { if (e.status !== 404) throw e; }
    }
    // Only files this planner made are visible to it (drive.file), so the name is enough.
    const res = await PhoneGoogle.request("drive", "GET", "/files", null, {
      q: `name = '${DRIVE_FILE}' and trashed = false`, spaces: "drive", orderBy: "modifiedTime desc",
      fields: "files(id,modifiedTime)",
    });
    const f = (res.files || [])[0] || null;
    if (f) await this.saveState({ fileId: f.id });
    return f;
  },

  _content(data) {
    return JSON.stringify({ app: "ARP Planner", version: 1, savedAt: new Date().toISOString(), savedBy: "phone",
      tasks: data.tasks, moods: data.moods, cycle: data.cycle, profile: data.profile });
  },

  async _upload(fileId, data) {
    if (fileId) {
      return PhoneGoogle.request("upload", "PATCH", "/files/" + fileId, null, { uploadType: "media", fields: "id,modifiedTime" },
        { raw: this._content(data), headers: { "Content-Type": "application/json" } });
    }
    const boundary = "arp" + randomB64(12);
    const raw = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: DRIVE_FILE, mimeType: "application/json", description: "ARP Planner: Ariel's planner, shared between her phone and the PC." }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${this._content(data)}\r\n--${boundary}--`;
    return PhoneGoogle.request("upload", "POST", "/files", null, { uploadType: "multipart", fields: "id,modifiedTime" },
      { raw, headers: { "Content-Type": "multipart/related; boundary=" + boundary } });
  },

  // One round: bring in what the PC changed, send up what changed here.
  async sync(manual) {
    if (this.busy || !(await PhoneGoogle.status()).connected) return null;
    this.busy = true;
    const result = { downloaded: false, uploaded: false, changedHere: false };
    try {
      const s = await this.state();
      const file = await this._findFile();
      let remote = null;
      if (file && (file.modifiedTime !== s.lastModified || manual)) {
        const text = await PhoneGoogle.request("drive", "GET", "/files/" + file.id, null, { alt: "media" }, { text: true });
        remote = JSON.parse(text);
        result.downloaded = true;
        // The PC's copy of her planner has arrived: her phone may take the Calendar / To Do syncs over.
        if (remote.savedBy === "pc") await this.saveState({ pcSeen: true });
        result.changedHere = await DeviceStore.mergeIn(remote);
      }
      const local = DeviceStore.data;
      // Upload if the Drive copy is missing, or differs from what's here now.
      const needUpload = !file || s.dirty || (remote && !samePlanner(local, remote));
      let modified = file ? file.modifiedTime : null;
      if (needUpload) {
        const up = await this._upload(file && file.id, local);
        modified = up.modifiedTime;
        result.uploaded = true;
        if (up.id) await this.saveState({ fileId: up.id });
      }
      await this.saveState({ lastModified: modified, lastSync: new Date().toISOString(), lastError: null, dirty: false });
      if (result.changedHere && typeof reloadFromStore === "function") await reloadFromStore();
      return result;
    } catch (e) {
      await this.saveState({ lastError: e.message, lastErrorAt: new Date().toISOString() });
      if (manual) throw e;
      return null;
    } finally {
      this.busy = false;
      if (typeof view !== "undefined" && view === "settings" && typeof renderPhoneApp === "function") renderPhoneApp();
    }
  },

  // Before her phone takes the Google / To Do syncs over from the PC it must have the PC's copy of
  // her planner (with its links), or her events and to-dos would come in a second time.
  async readyToTakeOver() {
    if ((await this.state()).pcSeen) return;
    await this.sync(false);
    if ((await this.state()).pcSeen) return;
    throw new PhoneApiError("Waiting for your planner to arrive from Logan's PC: connect your Google Drive there first " +
      "(PC planner → Settings → 📱 Her phone → ☁️ Connect her Google Drive).");
  },

  // Sync a little later (after a change), or soon (after signing in).
  soon(ms = DRIVE_AFTER_CHANGE) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(false), ms);
  },
};

if (STANDALONE) {
  DeviceStore.onChange = () => { PhoneDrive.saveState({ dirty: true }); PhoneDrive.soon(); };
  setTimeout(() => PhoneDrive.sync(false), 1200);
  setInterval(() => { if (!document.hidden) PhoneDrive.sync(false); }, DRIVE_EVERY);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) PhoneDrive.soon(500); });
}
