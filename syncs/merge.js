// Merging two copies of her planner (this device's and the one in her Google Drive).
// The same rules live in drive.py for the PC; keep the two in step.
//
//   tasks:    by id; the copy changed last (updatedAt) wins. Deletes are kept (deleted: true),
//             so a delete on one device reaches the other.
//   moods:    by day; the check-in changed last wins.
//   cycle:    the whole thing changed last wins.
//   profile:  setting by setting: each one's last change wins (profile._stamps), so Logan setting
//             his sleep hours on the PC and her changing her theme on the phone both survive.
//   Google / To Do links (task.external.google / .microsoft): only the device that runs that
//   sync changes them (profile.syncOwner[service]: "phone", else the PC), so each service's
//   links always come from that device. Otherwise taking a sync over could lose links and
//   make copies.

const stamp = x => { const n = Date.parse((x && x.updatedAt) || ""); return Number.isNaN(n) ? 0 : n; };
const newer = (a, b) => (stamp(b) > stamp(a) ? b : a);         // a wins ties

// Settings, one by one. A setting with no stamp on either side comes from the newer profile
// (or from whichever side has it at all).
function mergeProfile(a, b) {
  a = a || {}; b = b || {};
  const win = newer(a, b), sa = a._stamps || {}, sb = b._stamps || {};
  const out = { ...win }, stamps = { ...sa };
  for (const [k, t] of Object.entries(sb)) if (!stamps[k] || t > stamps[k]) stamps[k] = t;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "_stamps" || k === "updatedAt") continue;
    const ta = sa[k] || "", tb = sb[k] || "";
    if (!ta && !tb) { if (!(k in win)) out[k] = (k in a ? a : b)[k]; continue; }
    const from = tb > ta ? (k in b ? b : a) : (k in a ? a : b);
    out[k] = from[k];
  }
  if (Object.keys(stamps).length) out._stamps = stamps;
  return out;
}
// Stamp the settings that really changed (a whole-profile save mustn't restamp everything).
function stampProfile(before, changes, when) {
  const stamps = { ...((before && before._stamps) || {}) };
  for (const [k, v] of Object.entries(changes || {})) {
    if (k === "_stamps" || k === "updatedAt") continue;
    if (JSON.stringify(v) !== JSON.stringify((before || {})[k])) stamps[k] = when;
  }
  return stamps;
}

// Which device runs a service's sync, from a profile.
const syncOwnerOf = (profile, service) => (((profile || {}).syncOwner || {})[service] === "phone" ? "phone" : "pc");

// me: "phone" or "pc" (this device).
function mergePlanner(local, remote, me = "phone") {
  local = local || {};
  remote = remote || {};
  const profile = mergeProfile(local.profile || {}, remote.profile || {});
  const linksFrom = {};
  for (const service of ["google", "microsoft"]) linksFrom[service] = syncOwnerOf(profile, service) === me ? "local" : "remote";
  const byId = new Map();
  for (const t of local.tasks || []) byId.set(t.id, { local: t });
  for (const t of remote.tasks || []) byId.set(t.id, { ...(byId.get(t.id) || {}), remote: t });
  const tasks = [];
  for (const { local: l, remote: r } of byId.values()) {
    if (!l || !r) { tasks.push(l || r); continue; }
    const win = { ...newer(l, r) };
    const external = { ...(win.external || {}) };
    for (const service of ["google", "microsoft"]) {
      const link = ((linksFrom[service] === "remote" ? r : l).external || {})[service];
      if (link) external[service] = link; else delete external[service];
    }
    tasks.push({ ...win, external });
  }
  const moods = { ...(remote.moods || {}) };
  for (const [day, entry] of Object.entries(local.moods || {})) moods[day] = moods[day] ? newer(entry, moods[day]) : entry;
  return {
    tasks, moods,
    cycle: newer(local.cycle || {}, remote.cycle || {}),
    profile,
  };
}

// JSON with keys in a fixed order, so the same data always reads the same (Python and JS
// write object keys in different orders).
function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

// The same planner? (So an upload can be skipped when nothing changed.)
function samePlanner(a, b) {
  const canon = d => stableJson({
    tasks: [...(d.tasks || [])].sort((x, y) => (x.id < y.id ? -1 : 1)),
    moods: d.moods || {}, cycle: d.cycle || {}, profile: d.profile || {},
  });
  return canon(a) === canon(b);
}
