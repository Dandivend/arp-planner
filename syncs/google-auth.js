// The phone app's Google sign-in (the PC does this in gcal.py).
//
// It uses the same "Desktop app" Google client as the PC, so her phone and the PC can both
// open the planner's file in her Google Drive (Drive ties a file to the client that made it).
// Desktop clients send the sign-in back to http://127.0.0.1, which can't load on a phone,
// so it's the paste-back sign-in she already knows: copy that address, paste it here.
// The client's ID and "secret" (Google doesn't treat a desktop app's secret as secret) come
// from "Set up this phone", never from the published code. Sign-ins stay on this device.

const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file";
const GOOGLE_REDIRECT = "http://127.0.0.1:8765/oauth2callback";
// Test hooks (config.js): ARP_CONFIG.google = { auth, token, revoke, calendar, drive, upload }.
const GOOGLE_URLS = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  calendar: "https://www.googleapis.com/calendar/v3",
  drive: "https://www.googleapis.com/drive/v3",
  upload: "https://www.googleapis.com/upload/drive/v3",
  ...((window.ARP_CONFIG || {}).google || {}),
};

class GoogleError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomB64 = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

// "Set up this phone" leaves { google: { client_id, client_secret }, microsoft: { client_id, tenant } }.
const PhoneSetup = {
  get: () => DeviceKV.get("setup", null),
  set: v => DeviceKV.set("setup", v),
};

// The ?state=…&code=… of a sign-in address pasted back (same checks as gcal.link_params).
function linkParams(pasted, pending, starts) {
  const text = (pasted || "").trim();
  const query = (text.includes("?") ? text.split("?").slice(1).join("?") : text).split("#")[0].trim();
  const params = Object.fromEntries(new URLSearchParams(query));
  if (!params.state || !(params.code || params.error)) {
    throw new PhoneApiError(`That doesn't look like the right address. It should start with ${starts} and contain ` +
      "\"code=\". Copy the whole address from the browser's address bar.");
  }
  if (!pending[params.state]) throw new PhoneApiError("That sign-in is from an older attempt. Start it again.");
  return params;
}

const PhoneGoogle = {
  async client() { return ((await PhoneSetup.get()) || {}).google || null; },
  token: () => DeviceKV.get("google.token", null),
  state: async () => (await DeviceKV.get("google.state", {})) || {},
  async saveState(changes) { await DeviceKV.set("google.state", { ...(await this.state()), ...changes }); },

  async status() {
    const tok = await this.token(), s = await this.state();
    return {
      hasClient: !!(await this.client()), connected: !!(tok && tok.refresh_token),
      account: s.account || null, lastSync: s.lastSync || null, lastResult: s.lastResult || null,
      lastError: s.lastError || null, phoneApp: true,
    };
  },

  async connect() {
    const c = await this.client();
    if (!c) throw new PhoneApiError("Set up this phone first (Settings → 📲 Phone app).");
    const verifier = randomB64(48);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = randomB64(16);
    // Keep only the latest few attempts (she may start over).
    const pending = Object.fromEntries(Object.entries(await DeviceKV.get("google.pending", {})).slice(-4));
    pending[state] = { verifier, at: Date.now() };
    await DeviceKV.set("google.pending", pending);
    const q = new URLSearchParams({
      client_id: c.client_id, redirect_uri: GOOGLE_REDIRECT, response_type: "code", scope: GOOGLE_SCOPES,
      code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent", state,
    });
    return { url: GOOGLE_URLS.auth + "?" + q };
  },

  async _tokenRequest(fields) {
    let r;
    try {
      r = await fetch(GOOGLE_URLS.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields) });
    } catch { throw new GoogleError("Couldn't reach Google. Are you online?"); }
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new GoogleError(`Google sign-in failed (${r.status}): ${res.error || ""} ${res.error_description || ""}`.trim(), r.status);
    return res;
  },

  async finish(pasted) {
    const pending = await DeviceKV.get("google.pending", {});
    const params = linkParams(pasted, pending, "http://127.0.0.1");
    if (params.error) throw new PhoneApiError(`Google sign-in was cancelled (${params.error}).`);
    const { verifier } = pending[params.state];
    delete pending[params.state];
    await DeviceKV.set("google.pending", pending);
    const c = await this.client();
    const tok = await this._tokenRequest({
      client_id: c.client_id, client_secret: c.client_secret, code: params.code, code_verifier: verifier,
      redirect_uri: GOOGLE_REDIRECT, grant_type: "authorization_code",
    });
    tok.expires_at = Date.now() / 1000 + Number(tok.expires_in || 3600);
    await DeviceKV.set("google.token", tok);
    try {
      const primary = await this.request("calendar", "GET", "/calendars/primary");
      await this.saveState({ account: primary.id, lastError: null });
    } catch {}
  },

  // A fresh access token (refreshed a minute before it runs out).
  async accessToken() {
    const tok = await this.token();
    if (!tok || !tok.refresh_token) throw new GoogleError("Not connected to Google.");
    if ((tok.expires_at || 0) - Date.now() / 1000 < 60) {
      const c = await this.client();
      let fresh;
      try {
        fresh = await this._tokenRequest({ client_id: c.client_id, client_secret: c.client_secret,
          refresh_token: tok.refresh_token, grant_type: "refresh_token" });
      } catch (e) {
        if (/invalid_grant/.test(e.message)) {
          await DeviceKV.set("google.token", null);
          throw new GoogleError("Your Google sign-in expired. Press Connect to sign in again.");
        }
        throw e;
      }
      Object.assign(tok, fresh, { expires_at: Date.now() / 1000 + Number(fresh.expires_in || 3600) });
      await DeviceKV.set("google.token", tok);
    }
    return tok.access_token;
  },

  // A Google API call. api: "calendar" | "drive" | "upload". Returns parsed JSON ({} if empty).
  async request(api, method, path, body, query, extra = {}) {
    const url = GOOGLE_URLS[api] + path + (query ? "?" + new URLSearchParams(query) : "");
    const headers = { Authorization: "Bearer " + (await this.accessToken()), ...(extra.headers || {}) };
    let payload = extra.raw;
    if (body !== undefined && body !== null) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let r;
    try { r = await fetch(url, { method, headers, body: payload }); }
    catch { throw new GoogleError("Couldn't reach Google. Are you online?"); }
    if (!r.ok) {
      if ((r.status === 404 || r.status === 410) && method === "DELETE") return {};
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      throw new GoogleError(`Google error ${r.status} on ${method} ${path.split("?")[0]}: ${detail}`, r.status);
    }
    if (extra.text) return r.text();
    const raw = await r.text();
    return raw ? JSON.parse(raw) : {};
  },

  async disconnect() {
    const tok = await this.token();
    if (tok && tok.refresh_token) {
      try { await fetch(GOOGLE_URLS.revoke, { method: "POST", mode: "no-cors", body: new URLSearchParams({ token: tok.refresh_token }) }); } catch {}
    }
    await DeviceKV.set("google.token", null);
    await DeviceKV.set("google.state", {});
  },
};

// The /api/google/… routes the Google Settings card calls (planner.pyw's _google, on the PC).
// Calendar syncing itself is syncs/gcal.js (PhoneCalendar).
if (STANDALONE) {
  PhoneApi.on("/api/google/", async (route, body) => {
    try {
      if (route === "status") return await PhoneGoogle.status();
      if (route === "client") throw new PhoneApiError("On the phone app the Google client comes from \"Set up this phone\".");
      if (route === "connect") return await PhoneGoogle.connect();
      if (route === "finish") {
        await PhoneGoogle.finish(body.url);
        PhoneDrive.soon(500);                       // bring in her planner from Drive right away
        return await PhoneGoogle.status();
      }
      if (typeof PhoneCalendar !== "undefined") return await PhoneCalendar.route(route, body);
      if (route === "calendars") return { calendars: [] };
      if (route === "sync") return { ok: true, stats: null, status: await PhoneGoogle.status() };
      if (route === "disconnect") { await PhoneGoogle.disconnect(); return { ok: true, status: await PhoneGoogle.status() }; }
      throw new PhoneApiError("not found", 404);
    } catch (e) {
      if (e instanceof GoogleError) {
        await PhoneGoogle.saveState({ lastError: e.message });
        throw new PhoneApiError(e.message, 502);
      }
      throw e;
    }
  });
}
