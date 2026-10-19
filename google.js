// Google Calendar: connection settings, auto-sync and the sync button.
// The local server does the real work (gcal.py); this file is the controls.

let gStatus = null;          // { hasClient, connected, account, lastSync, lastResult, lastError }
let gCalendars = null;       // her Google calendars (once connected)
let gSyncing = false;
let gWaitingForSignIn = false;
let gSyncTimer = null;

const DEFAULT_GOOGLE = { importCalendars: ["primary"], push: { timed: true, deadlines: true, anytime: false }, auto: true };
const gPrefs = () => ({ ...DEFAULT_GOOGLE, ...(profile.google || {}), push: { ...DEFAULT_GOOGLE.push, ...((profile.google || {}).push || {}) } });

async function gPost(route, body) {
  const r = await fetch("/api/google/" + route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const res = await r.json().catch(() => ({}));
  if (res.status) gStatus = res.status;
  else if ("hasClient" in res) gStatus = res;          // some routes reply with the status itself
  if (!r.ok) throw new Error(res.error || "Google sync failed.");
  return res;
}

async function loadGoogleStatus() {
  try { gStatus = await (await fetch("/api/google/status")).json(); } catch { gStatus = null; }
}

function ago(iso) {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function syncSummary(st) {
  if (!st) return "";
  const bits = [
    st.imported && `${st.imported} new from Google`, st.updatedHere && `${st.updatedHere} updated here`,
    st.sent && `${st.sent} sent to Google`, st.updatedInGoogle && `${st.updatedInGoogle} updated in Google`,
    (st.removedHere || st.removedInGoogle) && `${(st.removedHere || 0) + (st.removedInGoogle || 0)} removed`,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "everything already matched";
}

// Run a sync. manual = she pressed the button (so tell her how it went).
async function syncGoogle(manual) {
  if (!gStatus || !gStatus.connected || gSyncing) return;
  gSyncing = true;
  if (view === "settings") renderGoogleSettings();
  try {
    const res = await gPost("sync");
    if (res.tasks) { tasks = res.tasks; renderQuietly(); }
    if (manual && res.stats) showToast(`📆 Synced with Google: ${syncSummary(res.stats)}.`);
    if (manual && res.skipped) showToast(`📆 Google Calendar syncs from ${profile.syncDeviceName || "your other device"}. Changes reach this one through Drive.`);
  } catch (e) {
    if (manual) showError("Google sync didn't work: " + e.message);
  } finally {
    gSyncing = false;
    if (view === "settings") renderGoogleSettings();
  }
}

// After she changes something, sync a little later (changes come in bursts).
function scheduleGoogleSync() {
  if (!gStatus || !gStatus.connected || !gPrefs().auto) return;
  clearTimeout(gSyncTimer);
  gSyncTimer = setTimeout(() => syncGoogle(false), 20 * 1000);
}

async function saveGooglePrefs(changes) {
  await saveProfile({ google: { ...gPrefs(), ...changes } });
  syncGoogle(false);
}

function renderGoogleSettings() {
  const box = $("google-settings");
  if (!box) return;
  box.innerHTML = "";
  if (!gStatus) { box.appendChild(el("p", "hint-small", "Loading…")); loadGoogleStatus().then(renderGoogleSettings); return; }

  // Step 1: no Google client file yet.
  if (!gStatus.hasClient && STANDALONE) {
    box.appendChild(el("p", "g-lead", "Set up this phone first: Settings → 📲 Phone app."));
    return;
  }
  if (!gStatus.hasClient) {
    box.appendChild(el("p", "g-lead", "One-time setup (about 10 minutes). Google needs the planner to be registered first:"));
    const ol = el("ol", "g-steps");
    for (const s of [
      "Go to console.cloud.google.com and create a project (any name, e.g. \"ARP Planner\").",
      "APIs & Services → Library → enable \"Google Calendar API\".",
      "OAuth consent screen → External → fill in the app name and your email → add Ariel's Gmail under Test users.",
      "Credentials → Create credentials → OAuth client ID → Application type: Desktop app → Create → Download JSON.",
      "Pick that downloaded file below.",
    ]) ol.appendChild(el("li", "", s));
    box.appendChild(ol);
    const pick = el("input");
    pick.type = "file";
    pick.accept = ".json,application/json";
    pick.addEventListener("change", async () => {
      const file = pick.files[0];
      if (!file) return;
      try {
        await gPost("client", { json: await file.text() });
        await loadGoogleStatus();
        showToast("✅ Google client added. Now connect your calendar.");
      } catch (e) { showError(e.message); }
      renderGoogleSettings();
    });
    const label = el("label", "g-file");
    label.append("📄 Choose the downloaded client file… ", pick);
    box.appendChild(label);
    box.appendChild(el("p", "hint-small", "The full step-by-step guide is GOOGLE_SETUP.md in the planner folder."));
    return;
  }

  // Step 2: connect (sign in with Google).
  if (!gStatus.connected) {
    box.appendChild(el("p", "g-lead", "Sign in with Google to connect your calendar."));
    box.appendChild(signinButtons("google", "Connect Google Calendar", connectGoogle, gWaitingForSignIn, renderGoogleSettings));
    if (SIGNIN.google) box.appendChild(pasteSigninPanel("google", async () => {
      await loadGoogleStatus();
      showToast("🎉 Google Calendar connected! Syncing now…");
      syncGoogle(true);
    }, renderGoogleSettings));
    if (gWaitingForSignIn) box.appendChild(el("p", "hint-small", "Finish signing in in the browser tab that opened, then come back here."));
    if (gStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ " + gStatus.lastError));
    return;
  }

  // Step 3: connected.
  const p = gPrefs();
  const head = el("div", "g-head");
  head.append(el("span", "g-ok", `✅ Connected${gStatus.account ? " as " + gStatus.account : ""}`));
  const sync = el("button", "g-btn", gSyncing ? "⏳ Syncing…" : "🔄 Sync now");
  sync.disabled = gSyncing;
  sync.addEventListener("click", () => syncGoogle(true));
  if (!gStatus.phoneRuns) head.appendChild(sync);
  box.appendChild(head);

  if (gStatus.phoneRuns) {
    box.appendChild(el("p", "g-lead", "📲 Her phone app runs the Google Calendar sync now. This PC shares the planner with it through Drive, so changes here still reach Google."));
  }
  box.appendChild(el("p", "hint-small",
    `Last synced ${ago(gStatus.lastSync)}${gStatus.lastResult ? ": " + syncSummary(gStatus.lastResult) : ""}.`));
  if (gStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ Last problem: " + gStatus.lastError));

  // Which of her Google calendars to show in the planner.
  box.appendChild(el("div", "g-sub", "📥 Show these Google calendars in the planner"));
  const cals = el("div", "g-cals");
  if (!gCalendars) {
    cals.appendChild(el("span", "hint-small", "Loading your calendars…"));
    gPost("calendars").then(r => { gCalendars = r.calendars; renderGoogleSettings(); }).catch(() => {});
  } else {
    for (const c of gCalendars.filter(c => !c.isPlanner)) {
      const id = c.primary ? "primary" : c.id;
      const on = p.importCalendars.includes(id) || (c.primary && p.importCalendars.includes(c.id));
      const lab = el("label", "check g-cal");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = on;
      cb.addEventListener("change", () => saveGooglePrefs({
        importCalendars: cb.checked ? [...p.importCalendars, id] : p.importCalendars.filter(x => x !== id && x !== c.id),
      }));
      const dot = el("span", "g-dot");
      dot.style.background = c.color || "#888";
      lab.append(cb, dot, c.name + (c.primary ? " (main)" : ""));
      cals.appendChild(lab);
    }
  }
  box.appendChild(cals);

  // What to send to Google.
  box.appendChild(el("div", "g-sub", `📤 Send to your "ARP Planner" Google calendar`));
  const opts = el("div", "g-cals");
  for (const [key, text] of [["timed", "Events and tasks with a time"], ["deadlines", "Deadlines (as all-day, on the due date)"],
    ["anytime", "Anytime tasks and chores (as all-day)"]]) {
    const lab = el("label", "check g-cal");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!p.push[key];
    cb.addEventListener("change", () => saveGooglePrefs({ push: { ...p.push, [key]: cb.checked } }));
    lab.append(cb, text);
    opts.appendChild(lab);
  }
  const auto = el("label", "check g-cal");
  const acb = el("input");
  acb.type = "checkbox";
  acb.checked = p.auto;
  acb.addEventListener("change", () => saveGooglePrefs({ auto: acb.checked }));
  auto.append(acb, "Sync automatically (when the planner opens, every 10 minutes, and after changes)");
  opts.appendChild(auto);
  box.appendChild(opts);

  box.appendChild(el("p", "hint-small",
    "Deleting a Google event here only hides it in the planner. It's never removed from your own Google calendars."));
  const dis = el("button", "g-btn danger-link", "Disconnect Google");
  dis.addEventListener("click", async () => {
    if (!dis.dataset.armed) { dis.dataset.armed = "1"; dis.textContent = "Click again to disconnect"; return; }
    try {
      const r = await gPost("disconnect");
      if (r.tasks) tasks = r.tasks;
      gCalendars = null;
      showToast("Disconnected from Google Calendar.");
    } catch (e) { showError(e.message); }
    render();
  });
  box.appendChild(dis);
}

async function connectGoogle() {
  try {
    const r = await gPost("connect");
    window.open(r.url, "_blank");
    gWaitingForSignIn = true;
    renderGoogleSettings();
    // Wait (up to 5 minutes) for the sign-in to land on the local server.
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      await new Promise(res => setTimeout(res, 2000));
      await loadGoogleStatus();
      if (gStatus && gStatus.connected) {
        gWaitingForSignIn = false;
        showToast("🎉 Google Calendar connected! Syncing now…");
        renderGoogleSettings();
        return syncGoogle(true);
      }
    }
  } catch (e) {
    showError(e.message);
  }
  gWaitingForSignIn = false;
  renderGoogleSettings();
}

// Sync when the planner opens, then every 10 minutes while it's open.
(async function startGoogle() {
  await loadGoogleStatus();
  if (gStatus && gStatus.connected && gPrefs().auto) setTimeout(() => syncGoogle(false), 1500);
  setInterval(() => { if (gPrefs().auto) syncGoogle(false); }, 10 * 60 * 1000);
})();
