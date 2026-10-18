// Google Health: a read-only check of which health data reaches her Google account
// (from her Galaxy Watch via Samsung Health -> Health Connect -> Google Health).
// The server does the work (ghealth.py); this is the Settings card.

let hStatus = null;          // { hasClient, connected, lastError, lastCheck, checkedAt }
let hBusy = false;
let hWaiting = false;

async function hPost(route, body) {
  const r = await fetch("/api/health/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const res = await r.json().catch(() => ({}));
  if (res.status) hStatus = res.status;
  if (!r.ok) throw new Error(res.error || "That didn't work.");
  return res;
}

async function loadHealthStatus() {
  try { hStatus = await (await fetch("/api/health/status")).json(); } catch { hStatus = null; }
}

// Turn Google's error text into something she can act on.
function healthHint(err) {
  const e = err || "";
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(e)) return "The Google Health API isn't turned on in your Google Cloud project yet (see the steps above).";
  if (/not.*link|NOT_FOUND.*identity|404.*identity/i.test(e)) return "Her Google account doesn't seem to be linked in the Google Health app yet.";
  if (/PERMISSION_DENIED|403/i.test(e)) return "Google said no. Make sure the Health scopes are added under Data Access and she's a test user.";
  return "";
}

function renderHealthSettings() {
  const box = $("health-settings");
  if (!box) return;
  box.innerHTML = "";
  if (STANDALONE) {
    box.appendChild(el("p", "hint-small", "💻 The Galaxy Watch check runs in the planner on Logan's PC (Google Health only talks to servers, not to phone apps)."));
    return;
  }
  if (!hStatus) { box.appendChild(el("p", "hint-small", "Loading…")); loadHealthStatus().then(renderHealthSettings); return; }

  if (!hStatus.hasClient) {
    box.appendChild(el("p", "hint-small", "Set up Google Calendar above first. Health uses the same Google project."));
    return;
  }

  if (!hStatus.connected) {
    box.appendChild(el("p", "g-lead", "A first, read-only check: does her Galaxy Watch data reach Google? Nothing is changed or saved to the planner yet."));
    const ol = el("ol", "g-steps");
    for (const s of [
      "On her phone: Samsung Health → Settings → Health Connect → let Samsung Health share sleep, exercise, steps and heart rate.",
      "Install the Google Health app on her phone and sign in with her Google account (this links it).",
      "Google Cloud (your ARP Planner project): APIs & Services → Library → enable \"Google Health API\".",
      "Google Auth Platform → Data Access → Add or remove scopes → tick the Google Health API sleep, activity_and_fitness and health_metrics_and_measurements \"readonly\" ones → Update → Save.",
      "Audience → Test users → add her Gmail address.",
      "Connect below. She signs in with HER Google account, on her own phone or here.",
    ]) ol.appendChild(el("li", "", s));
    box.appendChild(ol);
    box.appendChild(signinButtons("health", "Connect Google Health", connectHealth, hWaiting, renderHealthSettings));
    if (SIGNIN.health) box.appendChild(pasteSigninPanel("health", async () => {
      await loadHealthStatus();
      showToast("❤️ Google Health connected. Checking her data…");
      runHealthCheck();
    }, renderHealthSettings));
    if (hStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ " + hStatus.lastError + " " + healthHint(hStatus.lastError)));
    return;
  }

  const head = el("div", "g-head");
  head.append(el("span", "g-ok", "✅ Google Health connected"));
  const run = el("button", "g-btn", hBusy ? "⏳ Checking…" : "🔍 Check what data is there");
  run.disabled = hBusy;
  run.addEventListener("click", runHealthCheck);
  head.appendChild(run);
  box.appendChild(head);
  if (hStatus.lastError) box.appendChild(el("p", "g-error", "⚠️ " + hStatus.lastError + " " + healthHint(hStatus.lastError)));

  const c = hStatus.lastCheck;
  if (c) {
    box.appendChild(el("p", "hint-small", `Checked ${ago(hStatus.checkedAt)} (last 2 weeks).`));
    const ul = el("ul", "health-results");
    for (const t of c.types) {
      const li = el("li", t.error ? "bad" : t.count ? "good" : "none");
      li.appendChild(el("b", "", t.label));
      li.append(" ", t.error ? "❌ couldn't read it" : t.count ? `✅ ${t.count}${t.more ? "+" : ""} found` : "⚪ nothing yet");
      if (t.sources && t.sources.length) li.appendChild(el("span", "health-src", " · from " + t.sources.join(", ")));
      if (t.error) li.appendChild(el("div", "health-err", t.error + " " + healthHint(t.error)));
      ul.appendChild(li);
    }
    box.appendChild(ul);
    if (c.devices && c.devices.length) box.appendChild(el("p", "hint-small", "⌚ Devices on the account: " + c.devices.join(", ")));
    const any = c.types.some(t => t.count);
    box.appendChild(el("p", "hint-small", any
      ? "🎉 Data is coming through. Tell Claude, and the sync can be built from this."
      : "Nothing came through yet. If she only just linked Google Health, give it a day of wearing the watch and check again."));
  }

  const dis = el("button", "g-btn danger-link", "Disconnect Google Health");
  dis.addEventListener("click", async () => {
    if (!dis.dataset.armed) { dis.dataset.armed = "1"; dis.textContent = "Click again to disconnect"; return; }
    try { await hPost("disconnect"); } catch (e) { showError(e.message); }
    renderHealthSettings();
  });
  box.appendChild(dis);
}

async function runHealthCheck() {
  hBusy = true;
  renderHealthSettings();
  try { await hPost("probe"); } catch (e) { showError("Google Health check didn't work: " + e.message); }
  hBusy = false;
  renderHealthSettings();
}

async function connectHealth() {
  try {
    const r = await hPost("connect");
    window.open(r.url, "_blank");
    hWaiting = true;
    renderHealthSettings();
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      await new Promise(res => setTimeout(res, 2000));
      await loadHealthStatus();
      if (hStatus && hStatus.connected) {
        hWaiting = false;
        showToast("❤️ Google Health connected. Checking her data…");
        return runHealthCheck();
      }
    }
  } catch (e) {
    showError(e.message);
  }
  hWaiting = false;
  renderHealthSettings();
}
