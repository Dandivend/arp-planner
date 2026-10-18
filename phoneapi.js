// The phone app has no PC server behind it. The Settings screens still ask for /api/google/…,
// /api/microsoft/… and so on; in the phone app those requests are answered right here in the
// page, by the sync modules in syncs/ (each registers the routes it answers with PhoneApi.on).
// On the PC this file does nothing.

const PhoneApi = {
  routes: {},          // "/api/google/" -> async (route, body, method) => reply object
  // A handler returns the JSON reply, or { status, body } for an error status.
  on(prefix, handler) { this.routes[prefix] = handler; },
};

// Thrown by a handler to answer with an error message (shown to her as is).
class PhoneApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

if (STANDALONE) {
  const realFetch = window.fetch.bind(window);
  const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = u.pathname.indexOf("/api/");
    if (u.origin !== location.origin || at < 0) return realFetch(input, init);
    const path = u.pathname.slice(at);
    const prefix = Object.keys(PhoneApi.routes).find(p => path.startsWith(p));
    if (!prefix) return reply({ error: "That only works in the planner on the PC." }, 404);
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch {}
    try {
      const out = await PhoneApi.routes[prefix](path.slice(prefix.length), body, (init.method || "GET").toUpperCase());
      return out && out.status && out.body ? reply(out.body, out.status) : reply(out || {});
    } catch (e) {
      return reply({ error: e.message || "That didn't work." }, e.status || 400);
    }
  };
  // Nothing to tell a server on the phone.
  navigator.sendBeacon = () => true;

  // Google Health's API can't be reached from a web page (it only talks to servers),
  // so it stays a test on the PC planner.
  PhoneApi.on("/api/health/", async () => ({ hasClient: false, connected: false, phoneApp: true }));
}
