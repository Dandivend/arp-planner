// The phone app's own Settings card (where the PC planner has "📱 Her phone"), and
// "Set up this phone": the PC planner opens this app with #setup=<code>, which carries the
// Google and Microsoft client settings (never her data or sign-ins; those come later, from
// her own sign-in and her Google Drive). The part after # never leaves her phone.

// Read a setup code (from the #setup= link, or pasted by hand).
function readSetupCode(code) {
  const text = decodeURIComponent((code || "").trim().replace(/^.*#setup=/, ""));
  let cfg;
  try { cfg = JSON.parse(decodeURIComponent(escape(atob(text.replace(/-/g, "+").replace(/_/g, "/"))))); }
  catch { throw new Error("That setup code didn't work. Make a fresh one on the PC planner and try again."); }
  if (!cfg || !cfg.google || !cfg.google.client_id) throw new Error("That setup code is missing the Google settings. Set up Google on the PC first.");
  return cfg;
}

async function applySetupCode(code) {
  const cfg = readSetupCode(code);
  await PhoneSetup.set({ google: cfg.google, microsoft: cfg.microsoft || null, from: cfg.from || null, at: new Date().toISOString() });
  showToast("📲 This phone is set up! Next: sign in to Google so your planner comes over.");
  openSettingsSection("phone-settings");
  renderPhoneApp();
}

async function renderPhoneApp() {
  const box = $("phone-settings");
  if (!box) return;
  const setup = await PhoneSetup.get();
  const g = await PhoneGoogle.status();
  const d = await PhoneDrive.state();
  box.innerHTML = "";

  if (!setup) {
    box.appendChild(el("p", "g-lead", "Welcome to the ARP Planner phone app! 💛 Set it up once from the planner on Logan's PC, " +
      "so your planner comes over and Google and To Do can connect:"));
    const ol = el("ol", "g-steps");
    for (const s of ["Turn on Tailscale and open the PC planner (the address Logan gave you).",
      "Settings → 📱 Her phone → 📲 Set up the phone app.",
      "It opens this app again and finishes by itself."]) ol.appendChild(el("li", "", s));
    box.appendChild(ol);
    box.appendChild(el("div", "g-sub", "Or paste a setup code"));
    const row = el("div", "ms-id-row");
    const input = el("input");
    input.placeholder = "Setup code from the PC planner";
    const go = el("button", "g-btn primary", "Set up");
    go.addEventListener("click", async () => { try { await applySetupCode(input.value); } catch (e) { showError(e.message); } });
    row.append(input, go);
    box.appendChild(row);
    return;
  }

  if (!g.connected) {
    box.appendChild(el("p", "g-lead", "✅ Phone set up. Next: sign in to Google. Your planner comes over from your Google Drive, " +
      "and Google Calendar connects at the same time."));
    box.appendChild(signinButtons("google", "Sign in to Google", null, false, renderPhoneApp));
    if (SIGNIN.google) box.appendChild(pasteSigninPanel("google", async () => {
      showToast("🎉 Signed in! Bringing in your planner…");
      if (typeof loadGoogleStatus === "function") await loadGoogleStatus();
      await PhoneDrive.sync(true).catch(e => showError("Couldn't reach your Google Drive: " + e.message));
    }, renderPhoneApp));
    if (g.lastError) box.appendChild(el("p", "g-error", "⚠️ " + g.lastError));
    return;
  }

  const head = el("div", "g-head");
  head.append(el("span", "g-ok", `☁️ Shared with Logan's PC through ${g.account ? g.account + "'s" : "your"} Google Drive`));
  const sync = el("button", "g-btn", PhoneDrive.busy ? "⏳ Syncing…" : "🔄 Sync now");
  sync.disabled = PhoneDrive.busy;
  sync.addEventListener("click", async () => {
    try {
      const r = await PhoneDrive.sync(true);
      showToast(r && (r.changedHere || r.uploaded) ? "☁️ Synced with your Google Drive." : "☁️ Everything already matched.");
    } catch (e) { showError("Drive sync didn't work: " + e.message); }
    renderPhoneApp();
  });
  head.appendChild(sync);
  box.appendChild(head);
  box.appendChild(el("p", "hint-small", `Last synced ${ago(d.lastSync)}. Your planner lives on this phone and works offline; ` +
    "changes go to your Drive whenever you're online, and Logan's PC picks them up from there."));
  if (d.lastError) box.appendChild(el("p", "g-error", "⚠️ Last problem: " + d.lastError));
  // Which device runs the Calendar / To Do syncs (see mayRunSyncs in drive.js).
  const me = await ThisDevice.id(), p = DeviceStore.data.profile;
  if (p.syncDevice === me) {
    box.appendChild(el("p", "hint-small", "📆 Google Calendar and ✔️ To Do sync from this device. Their cards are above."));
  } else {
    box.appendChild(el("p", "hint-small", p.syncDevice
      ? `📆 Google Calendar and ✔️ To Do sync from ${p.syncDeviceName || "your other device"}. This one gets everything through your Drive.`
      : "📆 Google Calendar and ✔️ To Do aren't syncing from any device yet."));
    const take = el("button", "link-btn", "Sync them from this device instead");
    take.title = "Only one device runs those syncs, so they never double up.";
    take.addEventListener("click", async () => {
      await takeSyncsHere();
      showToast("📆✔️ Calendar and To Do sync from this device now.");
      if (typeof syncGoogle === "function") syncGoogle(false);
      if (typeof syncMicrosoft === "function") syncMicrosoft(false);
      renderPhoneApp();
    });
    box.appendChild(take);
  }
  // A fresh sign-in without disconnecting (Disconnect would cancel the PC's Drive sign-in too).
  const again = el("button", "link-btn", "🔁 Sign in to Google again");
  again.title = "Get a fresh Google sign-in. Nothing is disconnected.";
  again.addEventListener("click", () => startPasteSignin("google", false, renderPhoneApp));
  box.appendChild(again);
  if (SIGNIN.google) box.appendChild(pasteSigninPanel("google", async () => {
    showToast("🔁 Signed in to Google again.");
    if (typeof loadGoogleStatus === "function") await loadGoogleStatus();
    PhoneDrive.soon(500);
  }, renderPhoneApp));
}

if (STANDALONE) {
  // The phone card has a different job here.
  const h = $("phone-settings") && $("phone-settings").closest(".fit-card").querySelector("h3");
  if (h) h.textContent = "📲 Phone app";
  if (location.hash.startsWith("#setup=")) {
    const code = location.hash;
    history.replaceState(null, "", location.pathname);        // keep the code out of her history
    setTimeout(() => applySetupCode(code).catch(e => showError(e.message)), 300);
  }
}
