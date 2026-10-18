// Signing in to Google / Microsoft from a device that isn't the PC (her phone).
//
// Google and Microsoft only send a sign-in back to the PC itself (http://127.0.0.1 or
// http://localhost). On her phone that last page can't load ("This site can't be reached"),
// so she copies its address and pastes it into the planner, which finishes the sign-in on
// the PC. The code in that address only works once, for a few minutes, with this planner.
//
// Two ways in:
//   here:   she's on her phone using the planner: open the sign-in, come back, paste.
//   remote: on the PC, a link is sent to her phone; what her phone ends on is sent back and pasted here.

const SIGNIN = {};   // service -> { link, pasted, remote }

const SIGNIN_INFO = {
  google: { api: "/api/google/", starts: "http://127.0.0.1", name: "Google" },
  health: { api: "/api/health/", starts: "http://127.0.0.1", name: "Google" },
  drive: { api: "/api/drive/", starts: "http://127.0.0.1", name: "Google" },
  microsoft: { api: "/api/microsoft/", starts: "http://localhost", name: "Microsoft" },
};

async function signinPost(service, route, body) {
  const r = await fetch(SIGNIN_INFO[service].api + route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.error || "That didn't work.");
  return res;
}

// Start a paste-back sign-in. remote = make a link for her phone (from the PC).
async function startPasteSignin(service, remote, rerender) {
  try {
    const fresh = !!SIGNIN[service];
    const { url } = await signinPost(service, "connect");
    SIGNIN[service] = { link: url, pasted: "", remote };
    // (Starting over looks the same on screen, so say it worked.)
    if (fresh) showToast(remote ? "🔄 Fresh sign-in ready. Copy the link again and send her the new one." : "🔄 Fresh sign-in ready. Open the sign-in again.");
  } catch (e) { showError(e.message); }
  rerender();
}

function pasteSigninPanel(service, onDone, rerender) {
  const s = SIGNIN[service];
  const info = SIGNIN_INFO[service];
  const p = el("div", "phone-signin");

  if (s.remote) {
    p.appendChild(el("div", "g-sub", "1. Send her this link (text or email)"));
    const row = el("div", "ms-id-row");
    const link = el("input");
    link.readOnly = true;
    link.value = s.link;
    link.addEventListener("focus", () => link.select());
    const copy = el("button", "g-btn primary", "📋 Copy link");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(s.link); } catch { link.select(); document.execCommand("copy"); }
      showToast("📋 Link copied. Paste it into a text to her.");
    });
    row.append(link, copy);
    p.appendChild(row);
    p.appendChild(el("div", "g-sub", "2. On her phone"));
  } else {
    p.appendChild(el("div", "g-sub", "1. Sign in"));
    const open = el("a", "g-btn primary signin-open", `🔗 Open the ${info.name} sign-in`);
    open.href = s.link;
    open.target = "_blank";
    open.rel = "noopener";
    p.appendChild(open);
    p.appendChild(el("div", "g-sub", "2. In the tab that opens"));
  }
  const ol = el("ol", "g-steps");
  for (const t of [
    `Pick ${s.remote ? "her" : "your"} account and sign in.`,
    info.name === "Google" ? "If it says \"Google hasn't verified this app\": tap Advanced → Go to ARP Planner. It's your own app." : "Tap Accept / Yes to let ARP Planner use your tasks.",
    "Tick the boxes and tap Continue / Allow.",
    `It ends on "This site can't be reached". That's expected! Tap the address bar and copy the whole address (it starts with ${info.starts}).`,
    s.remote ? "Text that address back to you." : "Come back to this tab.",
  ]) ol.appendChild(el("li", "", t));
  p.appendChild(ol);

  p.appendChild(el("div", "g-sub", `3. Paste that address here${s.remote ? " (within about 5 minutes)" : ""}`));
  const row = el("div", "ms-id-row");
  const paste = el("input");
  paste.placeholder = `${info.starts}:…?state=…&code=…`;
  paste.value = s.pasted;
  paste.addEventListener("input", () => { s.pasted = paste.value; });
  const finish = el("button", "g-btn primary", "✅ Finish connecting");
  finish.addEventListener("click", async () => {
    finish.disabled = true;
    try {
      await signinPost(service, "finish", { url: paste.value });
      delete SIGNIN[service];
      await onDone();
    } catch (e) {
      showError(e.message);
      finish.disabled = false;
    }
    rerender();
  });
  paste.addEventListener("keydown", e => { if (e.key === "Enter") finish.click(); });
  row.append(paste, finish);
  p.appendChild(row);
  const again = el("button", "link-btn", "Start over with a fresh sign-in");
  again.addEventListener("click", () => startPasteSignin(service, s.remote, rerender));
  p.appendChild(again);
  return p;
}

// The "connect" buttons for a service's Settings card. onPc = the normal on-this-PC sign-in.
function signinButtons(service, label, onPc, waiting, rerender) {
  const row = el("div", "g-head");
  if (STANDALONE && service === "microsoft") {
    // The phone app: Microsoft sends her straight back into the app (no pasting).
    const btn = el("button", "g-btn primary", `🔗 ${label}`);
    btn.addEventListener("click", async () => {
      try { location.href = (await signinPost(service, "connect")).url; } catch (e) { showError(e.message); }
    });
    row.append(btn);
    return row;
  }
  if (ON_PC) {
    const here = el("button", "g-btn primary", waiting ? "⏳ Waiting for the sign-in…" : `💻 ${label} on this computer`);
    here.disabled = waiting;
    here.addEventListener("click", onPc);
    const phone = el("button", "g-btn", "📱 Sign in on her phone");
    phone.addEventListener("click", () => startPasteSignin(service, true, rerender));
    row.append(here, phone);
  } else {
    const btn = el("button", "g-btn primary", `🔗 ${label}`);
    btn.addEventListener("click", () => startPasteSignin(service, false, rerender));
    row.append(btn);
  }
  return row;
}
