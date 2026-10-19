// Microsoft To Do: connection settings, auto-sync and the sync button.
// The local server does the real work (mstodo.py); this file is the controls.
// Shares the small helpers (ago, el, showToast...) with google.js / app.js.

let msStatus = null;         // { hasClient, connected, account, lastSync, lastResult, lastError }
let msLists = null;          // her To Do lists (once connected)
let msSyncing = false;
let msWaitingForSignIn = false;
let msSyncTimer = null;

// importLists null = every list, including ones shared with her, until she unticks one.
const DEFAULT_MS = { importLists: null,push: { anytime: true, timed: false, workouts: false }, auto: true };
const msPrefs = () => ({ ...DEFAULT_MS, ...(profile.microsoft || {}), push: { ...DEFAULT_MS.push, ...((profile.microsoft || {}).push || {}) } });

async function msPost(route, body) {
  const r = await fetch("/api/microsoft/" + route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const res = await r.json().catch(() => ({}));
  if (res.status) msStatus = res.status;
  else if ("hasClient" in res) msStatus = res;
  if (!r.ok) throw new Error(res.error || "To Do sync failed.");
  return res;
}

async function loadMsStatus() {
  try { msStatus = await (await fetch("/api/microsoft/status")).json(); } catch { msStatus = null; }
}

function msSummary(st) {
  if (!st) return "";
  const bits = [
    st.imported && `${st.imported} new from To Do`, st.updatedHere && `${st.updatedHere} updated here`,
    st.sent && `${st.sent} sent to To Do`, st.updatedThere && `${st.updatedThere} updated in To Do`,
    (st.removedHere || st.removedThere) && `${(st.removedHere || 0) + (st.removedThere || 0)} removed`,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "everything already matched";
}

async function syncMicrosoft(manual) {
  if (!msStatus || !msStatus.connected || msSyncing) return;
  msSyncing = true;
  msRefreshViews();
  try {
    const res = await msPost("sync");
    if (res.tasks) { tasks = res.tasks; renderQuietly(); }
    if (manual && res.stats) showToast(`✔️ Synced with To Do: ${msSummary(res.stats)}.`);
  } catch (e) {
    if (manual) showError("To Do sync didn't work: " + e.message);
  } finally {
    msSyncing = false;
    msRefreshViews();
  }
}

function msRefreshViews() {
  if (view === "settings") renderMicrosoftSettings();
  else if (view === "todo" && !userIsEditing()) renderTodo();
}

function scheduleMicrosoftSync() {
  if (!msStatus || !msStatus.connected || !msPrefs().auto) return;
  clearTimeout(msSyncTimer);
  msSyncTimer = setTimeout(() => syncMicrosoft(false), 20 * 1000);
}

async function saveMsPrefs(changes) {
  await saveProfile({ microsoft: { ...msPrefs(), ...changes } });
  syncMicrosoft(false);
}

function msCheck(text, checked, onChange) {
  const lab = el("label", "check g-cal");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  lab.append(cb, text);
  return lab;
}

function renderMicrosoftSettings() {
  const box = $("microsoft-settings");
  if (!box) return;
  box.innerHTML = "";
  if (!msStatus) { box.appendChild(el("p", "hint-small", "Loading…")); loadMsStatus().then(renderMicrosoftSettings); return; }

  // Step 1: no app ID yet.
  if (!msStatus.hasClient && STANDALONE) {
    box.appendChild(el("p", "g-lead", "Set up this phone first: Settings → 📲 Phone app."));
    return;
  }
  if (!msStatus.hasClient) {
    box.appendChild(el("p", "g-lead", "One-time setup (about 5 minutes). Microsoft needs the planner to be registered first:"));
    const ol = el("ol", "g-steps");
    for (const s of [
      "Go to portal.azure.com → search \"App registrations\" → New registration.",
      "Name it \"ARP Planner\". Supported accounts: \"Personal Microsoft accounts only\".",
      "Redirect URI: pick \"Public client/native (mobile & desktop)\" and type http://localhost → Register.",
      "Copy the \"Application (client) ID\" from the Overview page and paste it below.",
    ]) ol.appendChild(el("li", "", s));
    box.appendChild(ol);
    const row = el("div", "ms-id-row");
    const input = el("input");
    input.type = "text";
    input.placeholder = "Application (client) ID, e.g. 1a2b3c4d-…";
    input.spellcheck = false;
    const save = el("button", "g-btn primary", "Save");
    save.addEventListener("click", async () => {
      try {
        await msPost("client", { clientId: input.value });
        await loadMsStatus();
        showToast("✅ App ID saved. Now connect To Do.");
      } catch (e) { showError(e.message); }
      renderMicrosoftSettings();
    });
    input.addEventListener("keydown", e => { if (e.key === "Enter") save.click(); });
    row.append(input, save);
    box.appendChild(row);
    box.appendChild(el("p", "hint-small", "The full step-by-step guide is MICROSOFT_SETUP.md in the planner folder."));
    return;
  }

  // Step 2: connect (sign in with Microsoft).
  if (!msStatus.connected) {
    box.appendChild(el("p", "g-lead", msStatus.needsSignIn
      ? "Microsoft wants you to sign in again (it does that now and then). Tap below; your to-dos are all still here."
      : "Sign in with Microsoft to connect To Do."));
    box.appendChild(signinButtons("microsoft", "Connect Microsoft To Do", connectMicrosoft, msWaitingForSignIn, renderMicrosoftSettings));
    if (SIGNIN.microsoft) box.appendChild(pasteSigninPanel("microsoft", async () => {
      await loadMsStatus();
      showToast("🎉 Microsoft To Do connected! Syncing now…");
      syncMicrosoft(true);
    }, renderMicrosoftSettings));
    if (msWaitingForSignIn) box.appendChild(el("p", "hint-small", "Finish signing in in the browser tab that opened, then come back here."));
    if (msStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ " + msStatus.lastError));
    return;
  }

  // Step 3: connected.
  const p = msPrefs();
  const head = el("div", "g-head");
  head.append(el("span", "g-ok", `✅ Connected${msStatus.account ? " as " + msStatus.account : ""}`));
  const sync = el("button", "g-btn", msSyncing ? "⏳ Syncing…" : "🔄 Sync now");
  sync.disabled = msSyncing;
  sync.addEventListener("click", () => syncMicrosoft(true));
  if (!msStatus.phoneRuns) head.appendChild(sync);
  box.appendChild(head);
  if (msStatus.phoneRuns) {
    box.appendChild(el("p", "g-lead", "📲 Her phone app runs the To Do sync now. This PC shares the planner with it through Drive, so changes here still reach To Do."));
  }
  box.appendChild(el("p", "hint-small",
    `Last synced ${ago(msStatus.lastSync)}${msStatus.lastResult ? ": " + msSummary(msStatus.lastResult) : ""}.`));
  if (msStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ Last problem: " + msStatus.lastError));

  // Which of her lists to bring in.
  box.appendChild(el("div", "g-sub", "📥 Bring in to-dos from these lists"));
  const lists = el("div", "g-cals");
  if (!msLists) {
    lists.appendChild(el("span", "hint-small", "Loading your lists…"));
    msPost("lists").then(r => { msLists = r.lists; renderMicrosoftSettings(); }).catch(() => {});
  } else {
    const visible = msLists.filter(l => !l.isPlanner && !l.flagged);
    const idOf = l => (l.default ? "defaultList" : l.id);
    const chosen = p.importLists || visible.map(idOf);          // nothing picked yet = all of them
    for (const l of visible) {
      const id = idOf(l);
      const on = chosen.includes(id) || (l.default && chosen.includes(l.id));
      const label = l.name + (l.default ? " (main)" : "") + (l.shared ? " · 👥 shared with you" : "");
      lists.appendChild(msCheck(label, on, checked => saveMsPrefs({
        importLists: checked ? [...chosen, id] : chosen.filter(x => x !== id && x !== l.id),
      })));
    }
  }
  box.appendChild(lists);

  // What to send to To Do.
  box.appendChild(el("div", "g-sub", `📤 Send to your "ARP Planner" list in To Do`));
  const opts = el("div", "g-cals");
  for (const [key, text] of [["anytime", "Anytime tasks, chores and deadlines"], ["timed", "Events and tasks with a time (with a reminder)"],
    ["workouts", "Workouts"]]) {
    opts.appendChild(msCheck(text, !!p.push[key], checked => saveMsPrefs({ push: { ...p.push, [key]: checked } })));
  }
  opts.appendChild(msCheck("Sync automatically (when the planner opens, every 10 minutes, and after changes)", p.auto,
    checked => saveMsPrefs({ auto: checked })));
  box.appendChild(opts);

  box.appendChild(el("p", "hint-small",
    "Ticking things off, renaming, ⭐ Important and due dates sync both ways. Deleting a to-do from one of your own lists here only hides it here; it stays in To Do."));
  const dis = el("button", "g-btn danger-link", "Disconnect Microsoft");
  dis.addEventListener("click", async () => {
    if (!dis.dataset.armed) { dis.dataset.armed = "1"; dis.textContent = "Click again to disconnect"; return; }
    try {
      const r = await msPost("disconnect");
      if (r.tasks) tasks = r.tasks;
      msLists = null;
      showToast("Disconnected from Microsoft To Do.");
    } catch (e) { showError(e.message); }
    render();
  });
  box.appendChild(dis);
}

async function connectMicrosoft() {
  try {
    const r = await msPost("connect");
    window.open(r.url, "_blank");
    msWaitingForSignIn = true;
    renderMicrosoftSettings();
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      await new Promise(res => setTimeout(res, 2000));
      await loadMsStatus();
      if (msStatus && msStatus.connected) {
        msWaitingForSignIn = false;
        showToast("🎉 Microsoft To Do connected! Syncing now…");
        renderMicrosoftSettings();
        return syncMicrosoft(true);
      }
    }
  } catch (e) {
    showError(e.message);
  }
  msWaitingForSignIn = false;
  renderMicrosoftSettings();
}

// Sync when the planner opens (a few seconds after Google, so they don't collide), then every 10 minutes.
(async function startMicrosoft() {
  await loadMsStatus();
  if (msStatus && msStatus.connected && msPrefs().auto) setTimeout(() => syncMicrosoft(false), 4000);
  setInterval(() => { if (msPrefs().auto) syncMicrosoft(false); }, 10 * 60 * 1000);
})();
