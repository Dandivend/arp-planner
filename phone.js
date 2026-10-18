// 📱 Phone access (Settings, on the PC): let her phone use this PC's planner over Wi-Fi.
// The server side is phone.py; this file is the Settings card.

let pStatus = null;   // { enabled, hasPin, listening, addresses, phones, startup }

async function pPost(route, body) {
  const r = await fetch("/api/phone/" + route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.error || "That didn't work.");
  if ("enabled" in res) pStatus = res;
  return res;
}

async function loadPhoneStatus() {
  try { pStatus = await (await fetch("/api/phone/status")).json(); } catch { pStatus = null; }
}

// On her phone, the phone-access settings (PIN etc.) stay PC-only, so nobody can lock the PC out.
function renderPcOnlyNotes() {
  const box = $("phone-settings");
  if (!box) return;
  box.innerHTML = "";
  box.appendChild(phoneAppSection(false));
  box.appendChild(el("p", "hint-small", "💻 The PIN and phone settings can only be changed on the PC."));
}

// ☁️ Her Google Drive: where this PC and her phone app share the planner (drive.py). It must be
// HER Google account (her phone app signs in with it); she signs in on her phone and pastes back.
let driveStatus = null;
function driveSection(onPc) {
  const box = el("div", "drive-sec");
  const rerender = () => { const b = $("phone-settings"); if (b) (ON_PC ? renderPhoneSettings : renderPcOnlyNotes)(); };
  if (!driveStatus) {
    box.appendChild(el("p", "hint-small", "Checking her Google Drive…"));
    fetch("/api/drive/status").then(r => r.json()).then(s => { driveStatus = s; rerender(); }).catch(() => {});
    return box;
  }
  const d = driveStatus;
  if (!d.hasClient) {
    box.appendChild(el("p", "hint-small", "☁️ Set up Google Calendar first: her Drive uses the same Google client."));
    return box;
  }
  if (!d.connected) {
    box.appendChild(el("p", "g-lead", "☁️ Connect her Google Drive: the PC and her phone app share the planner through one file there. " +
      "Sign in with ARIEL's Google account (the same one her phone app uses)."));
    box.appendChild(signinButtons("drive", "Connect her Google Drive", async () => {
      try { window.open((await signinPost("drive", "connect")).url, "_blank"); } catch (e) { showError(e.message); }
    }, false, rerender));
    if (SIGNIN.drive) box.appendChild(pasteSigninPanel("drive", async () => {
      driveStatus = null;
      showToast("☁️ Her Google Drive is connected. Sharing the planner with it now…");
      await fetch("/api/drive/sync", { method: "POST", body: "{}" }).catch(() => {});
    }, rerender));
    return box;
  }
  const head = el("div", "g-head");
  head.append(el("span", "g-ok", `☁️ Shared through ${d.account ? d.account + "'s" : "her"} Google Drive`));
  const sync = el("button", "g-btn", "🔄 Sync now");
  sync.addEventListener("click", async () => {
    sync.disabled = true;
    try {
      const r = await (await fetch("/api/drive/sync", { method: "POST", body: "{}" })).json();
      if (r.error) throw new Error(r.error);
      driveStatus = r.status;
      if (r.data) await reloadFromStore();
      showToast("☁️ Synced with her Google Drive.");
    } catch (e) { showError("Drive sync didn't work: " + e.message); }
    rerender();
  });
  head.appendChild(sync);
  box.appendChild(head);
  box.appendChild(el("p", "hint-small", `Last synced ${ago(d.lastSync)}` + (d.phoneSeen ? ` · her phone app last saved ${ago(d.phoneSeen)}` : "") +
    ". It also syncs by itself every few minutes while the planner runs."));
  if (d.lastError) box.appendChild(el("p", "g-error", "⚠️ " + d.lastError));
  // A fresh sign-in without disconnecting (Disconnect would cancel her phone app's Google sign-in too).
  box.appendChild(signinButtons("drive", "Sign in to her Drive again", async () => {
    try { window.open((await signinPost("drive", "connect")).url, "_blank"); } catch (e) { showError(e.message); }
  }, false, rerender));
  if (SIGNIN.drive) box.appendChild(pasteSigninPanel("drive", async () => {
    driveStatus = null;
    showToast("🔁 Her Google Drive is signed in again.");
    await fetch("/api/drive/sync", { method: "POST", body: "{}" }).catch(() => {});
  }, rerender));
  if (onPc) {
    const dis = el("button", "g-btn danger-link", "Disconnect her Drive");
    dis.addEventListener("click", async () => {
      if (!dis.dataset.armed) { dis.dataset.armed = "1"; dis.textContent = "Click again to disconnect"; return; }
      try { await signinPost("drive", "disconnect"); } catch (e) { showError(e.message); }
      driveStatus = null;
      rerender();
    });
    box.appendChild(dis);
  }
  return box;
}

// 📲 The phone app (the planner living on her phone, no PC needed). Its address is where
// publish.ps1 put it (GitHub Pages); "Set up" opens it with the Google / Microsoft settings.
function phoneAppSection(onPc) {
  const sec = el("div", "phone-app");
  sec.appendChild(el("div", "g-sub", "📲 The phone app (works without this PC)"));
  const url = (profile.phoneAppUrl || "").trim();
  if (onPc) {
    const row = el("div", "ms-id-row");
    const input = el("input");
    input.placeholder = "Its address, e.g. https://yourname.github.io/arp-planner/";
    input.value = url;
    const save = el("button", "g-btn", "Save");
    save.addEventListener("click", async () => {
      let v = input.value.trim();
      if (v && !/^https:\/\//.test(v)) return showError("The phone app's address starts with https://");
      if (v && !v.endsWith("/")) v += "/";
      await saveProfile({ phoneAppUrl: v });
      showToast("📲 Saved.");
    });
    row.append(input, save);
    sec.appendChild(row);
  }
  sec.appendChild(driveSection(onPc));
  if (!url) {
    sec.appendChild(el("p", "hint-small", onPc ? "Publish it first (PHONE_APP_SETUP.md), then put its address here."
      : "Logan hasn't published the phone app yet."));
    return sec;
  }
  const go = el("button", "g-btn primary", onPc ? "📲 Copy her setup link" : "📲 Set up the phone app");
  go.addEventListener("click", async () => {
    try {
      const r = await (await fetch("/api/phone/setupcode")).json();
      if (r.error) throw new Error(r.error);
      const link = (r.appUrl || url) + "#setup=" + r.code;
      if (onPc) {
        try { await navigator.clipboard.writeText(link); } catch {}
        showToast("📋 Setup link copied. Text it to her, or open the PC planner on her phone and tap Set up there.");
      } else {
        location.href = link;          // opens the phone app, which finishes the setup
      }
    } catch (e) { showError(e.message); }
  });
  sec.appendChild(go);
  sec.appendChild(el("p", "hint-small", onPc
    ? "The link carries only the Google and Microsoft app settings, never her data or sign-ins. Her planner reaches the phone through her own Google sign-in and her Google Drive."
    : "It opens the phone app; then tap Chrome's ⋮ → Install app (or Add to Home screen) and sign in to Google there."));
  return sec;
}

function renderPhoneSettings() {
  const box = $("phone-settings");
  if (!box) return;
  box.innerHTML = "";
  if (!pStatus) { box.appendChild(el("p", "hint-small", "Loading…")); loadPhoneStatus().then(renderPhoneSettings); return; }
  const s = pStatus;

  box.appendChild(phoneAppSection(true));
  box.appendChild(el("div", "g-sub", "💻 Her phone using this PC's planner"));
  box.appendChild(el("p", "g-lead", "Use the planner on her phone too: on this house's Wi-Fi, or from anywhere with Tailscale. Her phone needs a PIN; this PC doesn't."));

  // PIN
  const pinRow = el("div", "ms-id-row");
  const pin = el("input");
  pin.type = "password";
  pin.inputMode = "numeric";
  pin.maxLength = 8;
  pin.placeholder = s.hasPin ? "New PIN (4–8 numbers)" : "Pick a PIN (4–8 numbers)";
  const savePin = el("button", "g-btn" + (s.hasPin ? "" : " primary"), s.hasPin ? "Change PIN" : "Set PIN");
  savePin.addEventListener("click", async () => {
    try {
      await pPost("setup", { pin: pin.value });
      showToast(s.hasPin ? "🔑 PIN changed. Phones will need the new one." : "🔑 PIN set.");
    } catch (e) { showError(e.message); }
    renderPhoneSettings();
  });
  pin.addEventListener("keydown", e => { if (e.key === "Enter") savePin.click(); });
  pinRow.append(pin, savePin);
  box.appendChild(pinRow);

  // On / off
  const on = el("label", "check g-cal");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = s.enabled;
  cb.disabled = !s.hasPin;
  cb.addEventListener("change", async () => {
    try { await pPost("setup", { enabled: cb.checked }); } catch (e) { showError(e.message); }
    renderPhoneSettings();
  });
  on.append(cb, s.hasPin ? "Let her phone use the planner" : "Let her phone use the planner (set a PIN first)");
  box.appendChild(on);

  // Restart needed to start (or stop) listening on the Wi-Fi.
  if (s.enabled !== s.listening) {
    const warn = el("div", "phone-restart");
    warn.appendChild(el("span", "", s.enabled
      ? "One more step: restart the planner so her phone can reach it."
      : "Restart the planner to stop listening on the Wi-Fi (her phone is already locked out)."));
    const btn = el("button", "g-btn primary", "🔄 Restart planner");
    btn.addEventListener("click", restartPlanner);
    warn.appendChild(btn);
    box.appendChild(warn);
  }

  if (s.enabled && s.listening) {
    const anywhere = s.addresses.filter(a => a.kind === "anywhere");
    const home = s.addresses.filter(a => a.kind === "home");
    box.appendChild(el("div", "g-sub", "📱 On her phone, open Chrome and go to:"));
    const list = el("div", "phone-addrs");
    for (const a of anywhere.slice(0, 1)) {
      list.appendChild(el("code", "phone-addr", a.url));
      list.appendChild(el("span", "hint-small", "🌍 From anywhere, through Tailscale (it needs to be on, on both devices)"));
    }
    for (const a of home.slice(0, 2)) {
      list.appendChild(el("code", "phone-addr" + (anywhere.length ? " small" : ""), a.url));
      list.appendChild(el("span", "hint-small", "🏠 Only on this house's Wi-Fi"));
    }
    if (!s.addresses.length) list.appendChild(el("span", "g-error", "Couldn't find this PC's network address. Is it connected?"));
    box.appendChild(list);
    if (!anywhere.length) box.appendChild(el("p", "hint-small",
      "Is she somewhere else? Install Tailscale on this PC and her phone (see TAILSCALE_SETUP.md), then a 🌍 address appears here."));
    const ol = el("ol", "g-steps");
    for (const t of [
      "Type the PIN.",
      "Chrome menu ⋮ → \"Add to Home screen\" for an ARP Planner icon.",
      "If the page won't load: on this PC a Windows Firewall box may have popped up for Python. Allow it on Private networks. Also check the PC's Wi-Fi is set to a Private network.",
    ]) ol.appendChild(el("li", "", t));
    box.appendChild(ol);
    box.appendChild(el("p", "hint-small", "It only works while this PC is on (and awake)."));
  }

  // Start with Windows
  const st = el("label", "check g-cal");
  const scb = el("input");
  scb.type = "checkbox";
  scb.checked = s.startup;
  scb.addEventListener("change", async () => {
    try {
      await pPost("startup", { on: scb.checked });
      showToast(scb.checked ? "✅ The planner will start (hidden) when Windows starts." : "Won't start with Windows any more.");
    } catch (e) { showError("Couldn't change that: " + e.message); }
    renderPhoneSettings();
  });
  st.append(scb, "Start the planner (hidden) when this PC starts, so her phone can use it right away");
  box.appendChild(st);

  if (s.phones) {
    const forget = el("button", "g-btn danger-link", `Sign out ${s.phones === 1 ? "the phone" : `all ${s.phones} phones`}`);
    forget.addEventListener("click", async () => {
      if (!forget.dataset.armed) { forget.dataset.armed = "1"; forget.textContent = "Click again to sign out"; return; }
      try { await pPost("forget"); showToast("Signed out. Phones will need the PIN again."); } catch (e) { showError(e.message); }
      renderPhoneSettings();
    });
    box.appendChild(forget);
  }
}

async function restartPlanner() {
  try { await pPost("restart"); } catch (e) { return showError(e.message); }
  showToast("🔄 Restarting… one moment.");
  // Wait for the new server to answer, then reload this window.
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await fetch("/api/phone/status");
      if (r.ok) { location.reload(); return; }
    } catch {}
  }
  showError("The planner didn't come back. Close this window and open ARP Planner again.");
}
