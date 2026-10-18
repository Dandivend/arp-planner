// Her time zone for the phone app's syncs (the PC uses tz.py). profile.timeZone holds an IANA
// name like "America/Los_Angeles"; unset means this device's own zone.
// Also pyJson + sha1Hex16: the exact fingerprints the PC's Python syncs make, so links made
// on the PC keep matching when her phone takes a sync over (no false "changed" on every item).

const SyncTZ = {
  zone() {
    const z = (typeof profile !== "undefined" && profile && profile.timeZone) || "";
    try { if (z) { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } } catch {}
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  },
  // Wall-clock parts of a moment in her zone.
  parts(ms, zone = this.zone()) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).filter(x => x.type !== "literal").map(x => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  },
  // Minutes her zone is ahead of UTC at that moment.
  offsetAt(ms, zone = this.zone()) {
    const p = this.parts(ms, zone);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
  },
  // The moment (ms) of a planner day + "HH:MM" on her clock (like tz.local_dt).
  localMs(day, hhmm, zone = this.zone()) {
    const [y, mo, d] = day.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    // Python's zoneinfo picks the earlier offset for times that happen twice (fold=0).
    const candidates = [...new Set([this.offsetAt(wall - 36e5 * 14, zone), this.offsetAt(wall + 36e5 * 14, zone),
      this.offsetAt(wall, zone)])].map(off => wall - off * 60000).filter(ms => {
      const p = this.parts(ms, zone);
      return p.h === h && p.mi === mi && p.d === d;
    });
    return candidates.length ? Math.min(...candidates) : wall - this.offsetAt(wall, zone) * 60000;
  },
  // ISO text with her UTC offset, like Python's datetime.isoformat(): 2026-10-17T09:00:00-07:00
  iso(ms, zone = this.zone()) {
    const p = this.parts(ms, zone), off = this.offsetAt(ms, zone);
    const z = (off < 0 ? "-" : "+") + pad(Math.floor(Math.abs(off) / 60)) + ":" + pad(Math.abs(off) % 60);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${z}`;
  },
  localIso(day, hhmm, plusMinutes = 0) { return this.iso(this.localMs(day, hhmm) + plusMinutes * 60000); },
  // { day: "YYYY-MM-DD", time: "HH:MM" } on her clock, for an ISO moment from Google.
  toLocal(isoText) {
    const p = this.parts(Date.parse(isoText));
    return { day: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
  },
  today() { const p = this.parts(Date.now()); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; },
  addDays(day, n) {
    const [y, m, d] = day.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  },
};

// json.dumps(obj, sort_keys=True, ensure_ascii=False), as Python writes it.
function pyJson(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
  if (typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ": " + pyJson(v[k])).join(", ") + "}";
  if (typeof v === "string") {
    // Python escapes the same characters JSON.stringify does, plus U+007F stays as is; both use \uXXXX lowercase.
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

// sha1(text) as hex, first 16 characters (the Python syncs' _hash).
async function sha1Hex16(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
const pyHash = obj => sha1Hex16(pyJson(obj));
