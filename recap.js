// Recap tab: what got done this week / month / year, plus how she felt.

let recapPeriod = "week";       // "week" | "month" | "year"
let recapAnchor = todayKey();   // any day inside the period being shown

// Categorical slots 1-3 of the validated dark palette (blue, orange, aqua), fixed order.
const KIND_SERIES = [
  { id: "event", label: "Events", color: "#3987e5" },
  { id: "task", label: "Tasks", color: "#d95926" },
  { id: "chore", label: "Chores", color: "#199e70" },
  { id: "workout", label: "Workouts", color: "#c98500" },   // slot 4 (yellow)
];
const MONTHS_SHORT = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: "short" }));

function recapRange() {
  const a = fromKey(recapAnchor);
  if (recapPeriod === "week") {
    const start = addDays(recapAnchor, -a.getDay());
    return { start, end: addDays(start, 6) };
  }
  if (recapPeriod === "month") {
    return { start: toKey(new Date(a.getFullYear(), a.getMonth(), 1)), end: toKey(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
  }
  return { start: `${a.getFullYear()}-01-01`, end: `${a.getFullYear()}-12-31` };
}

function recapTitle({ start, end }) {
  const s = fromKey(start), e = fromKey(end);
  if (recapPeriod === "year") return String(s.getFullYear());
  if (recapPeriod === "month") return s.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function shiftRecap(dir) {
  const a = fromKey(recapAnchor);
  if (recapPeriod === "week") recapAnchor = addDays(recapAnchor, 7 * dir);
  else if (recapPeriod === "month") recapAnchor = toKey(new Date(a.getFullYear(), a.getMonth() + dir, 1));
  else recapAnchor = toKey(new Date(a.getFullYear() + dir, 0, 1));
  render();
}

function renderRecap() {
  const range = recapRange();
  const tk = todayKey();
  const inRange = d => d >= range.start && d <= range.end;
  for (const b of document.querySelectorAll("#recap-view [data-period]")) b.classList.toggle("active", b.dataset.period === recapPeriod);
  $("recap-title").textContent = recapTitle(range);
  $("recap-next").disabled = range.end >= tk;

  const live = tasks.filter(t => !t.deleted);
  const done = live.filter(t => t.done && !t.skipped && inRange(t.doneDate || t.date));
  const due = live.filter(t => { const d = t.dueDate || t.date; return inRange(d) && d <= tk; });
  const dueDone = due.filter(t => t.done && !t.skipped).length;
  const chores = done.filter(t => kindOf(t) === "chore");
  const choreMin = chores.reduce((s, t) => s + (t.minutes || 15), 0);
  const important = done.filter(t => t.dueDate || t.priority === "important").length;

  // Days of the period up to today, for check-ins and recovery days.
  const days = [];
  for (let d = range.start; d <= range.end && d <= tk; d = addDays(d, 1)) days.push(d);
  const recoveryDays = days.filter(d => recoveryFor(d)).length;
  const checkins = days.filter(d => feelingOf(moods[d]) || bodyOf(moods[d])).length;

  // Buckets: one per day (week, month) or per month (year).
  const buckets = [];
  if (recapPeriod === "year") {
    const y = fromKey(range.start).getFullYear();
    for (let m = 0; m < 12; m++) buckets.push({ key: `${y}-${pad(m + 1)}`, label: MONTHS_SHORT[m], tip: new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }) });
  } else {
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
      const dt = fromKey(d);
      buckets.push({
        key: d,
        label: recapPeriod === "week" ? dt.toLocaleDateString(undefined, { weekday: "short" }) : String(dt.getDate()),
        tip: dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
        isToday: d === tk,
      });
    }
  }
  for (const b of buckets) b.counts = { event: 0, task: 0, chore: 0, workout: 0 };
  for (const t of done) {
    const d = t.doneDate || t.date;
    const b = buckets.find(x => (recapPeriod === "year" ? d.startsWith(x.key) : d === x.key));
    if (b) b.counts[kindOf(t)]++;
  }

  const periodWord = recapPeriod;
  const best = buckets.reduce((m, b) => { const n = b.counts.event + b.counts.task + b.counts.chore + b.counts.workout; return n > m.n ? { n, b } : m; }, { n: 0, b: null });
  let headline = done.length
    ? `You got ${plural(done.length, "thing")} done this ${periodWord}! 🎉`
    : `A quiet ${periodWord} so far. Rest counts too 💛`;
  if (best.b && done.length > 2) headline += ` Your biggest ${recapPeriod === "year" ? "month" : "day"} was ${best.b.tip} (${best.n}).`;
  if (recoveryDays >= 2) headline += ` You also gave yourself ${recoveryDays} recovery days. That's how you avoid burning out.`;
  $("recap-headline").textContent = headline;

  const tiles = [
    ["✅", done.length, "things done"],
    ["🧹", chores.length, `chores · ${choreMin ? formatMinutes(choreMin) : "0 min"}`],
    ["🔥", important, "important / deadline items"],
    ["📈", due.length ? Math.round((dueDone / due.length) * 100) + "%" : "–", "of planned items finished"],
    ["💗", recoveryDays, "recovery days"],
    ["📝", checkins, "days checked in"],
  ];
  const tileBox = $("recap-tiles");
  tileBox.innerHTML = "";
  for (const [icon, value, label] of tiles) {
    const t = el("div", "tile");
    t.append(el("div", "tile-value", `${icon} ${value}`), el("div", "tile-label", label));
    tileBox.appendChild(t);
  }

  const legend = $("done-legend");
  legend.innerHTML = "";
  for (const s of KIND_SERIES) {
    const item = el("span", "legend-item");
    const sw = el("span", "swatch");
    sw.style.background = s.color;
    item.append(sw, s.label);
    legend.appendChild(item);
  }
  drawStackedBars($("done-chart"), buckets);

  drawHBars($("feel-chart"), FEELINGS, days.map(d => feelingOf(moods[d])).filter(Boolean), "#a593ff", "No feelings logged yet.");
  drawHBars($("body-chart"), BODY, days.map(d => bodyOf(moods[d])).filter(Boolean), "#4cc38a", "No body check-ins yet.");
}

// ---------- charts (plain SVG) ----------
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function showTip(evt, html) {
  const tip = $("chart-tip");
  tip.innerHTML = html;
  tip.hidden = false;
  const x = Math.min(evt.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + "px";
  tip.style.top = evt.clientY - tip.offsetHeight - 12 + "px";
}
const hideTip = () => { $("chart-tip").hidden = true; };

function drawStackedBars(box, buckets) {
  box.innerHTML = "";
  const W = 720, H = 240, L = 30, R = 8, T = 18, B = 28;
  const totals = buckets.map(b => b.counts.event + b.counts.task + b.counts.chore + b.counts.workout);
  const max = Math.max(4, ...totals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "bars", role: "img", "aria-label": "Things done per " + (recapPeriod === "year" ? "month" : "day") });
  const y = v => T + (H - T - B) * (1 - v / top);

  for (let i = 0; i <= 4; i++) {
    const v = step * i;
    svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: i ? "grid" : "axis" }));
    const t = svgEl("text", { x: L - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" });
    t.textContent = v;
    svg.appendChild(t);
  }

  const band = (W - L - R) / buckets.length;
  const bw = Math.max(4, Math.min(34, band * 0.62));
  const showTotals = buckets.length <= 12;
  buckets.forEach((b, i) => {
    const cx = L + band * i + band / 2;
    let base = 0;
    const segs = KIND_SERIES.filter(s => b.counts[s.id] > 0);
    segs.forEach((s, j) => {
      const v = b.counts[s.id];
      const y0 = y(base), y1 = y(base + v);
      const gap = j < segs.length - 1 ? 2 : 0;        // 2px surface gap between stacked fills
      const hgt = Math.max(1, y0 - y1 - gap);
      const isTop = j === segs.length - 1;
      const r = isTop ? Math.min(4, hgt, bw / 2) : 0;   // rounded data-end only on top
      const x0 = cx - bw / 2, yt = y0 - hgt;
      const d = `M${x0},${y0} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${y0} Z`;
      svg.appendChild(svgEl("path", { d, fill: s.color }));
      base += v;
    });
    const total = totals[i];
    if (showTotals && total) {
      const t = svgEl("text", { x: cx, y: y(total) - 6, class: "bar-total", "text-anchor": "middle" });
      t.textContent = total;
      svg.appendChild(t);
    }
    const labelEvery = buckets.length > 20 ? 5 : 1;
    if (i % labelEvery === 0 || b.isToday || (buckets.length > 20 && i === buckets.length - 1)) {
      const t = svgEl("text", { x: cx, y: H - 8, class: "tick" + (b.isToday ? " today" : ""), "text-anchor": "middle" });
      t.textContent = b.label;
      svg.appendChild(t);
    }
    // Hit target: the whole column, bigger than the bar.
    const hit = svgEl("rect", { x: L + band * i, y: T, width: band, height: H - T - B, class: "hit" });
    hit.addEventListener("mousemove", e => {
      const rows = KIND_SERIES.map(s => `<div><span class="swatch" style="background:${s.color}"></span>${s.label}: <b>${b.counts[s.id]}</b></div>`).join("");
      showTip(e, `<div class="tip-title">${b.tip}</div>${rows}<div class="tip-total">Total: <b>${total}</b></div>`);
    });
    hit.addEventListener("mouseleave", hideTip);
    svg.appendChild(hit);
  });
  box.appendChild(svg);
}

function drawHBars(box, options, picks, color, emptyText) {
  box.innerHTML = "";
  if (!picks.length) { box.appendChild(el("p", "empty-chart", emptyText)); return; }
  const max = Math.max(...options.map(o => picks.filter(p => p.id === o.id).length));
  for (const o of options) {
    const n = picks.filter(p => p.id === o.id).length;
    const row = el("div", "hbar-row");
    const track = el("div", "hbar-track");
    const fill = el("div", "hbar-fill");
    fill.style.width = (n ? Math.max(4, (n / max) * 100) : 0) + "%";
    fill.style.background = color;
    track.appendChild(fill);
    row.append(el("span", "hbar-label", `${o.emoji} ${o.label}`), track, el("span", "hbar-value", n ? plural(n, "day") : "–"));
    row.addEventListener("mousemove", e => showTip(e, `${o.emoji} ${o.label}: <b>${plural(n, "day")}</b>`));
    row.addEventListener("mouseleave", hideTip);
    box.appendChild(row);
  }
}

// ---------- wiring ----------
for (const b of document.querySelectorAll("#recap-view [data-period]")) {
  b.addEventListener("click", () => { recapPeriod = b.dataset.period; render(); });
}
$("recap-prev").addEventListener("click", () => shiftRecap(-1));
$("recap-next").addEventListener("click", () => shiftRecap(1));
