/* Shared constants: event semantics, colours, glyphs, formatting. */

export const CANVAS = 1024;

export const EVENT_META = {
  kill:  { label: "Kills",        color: "#ff5252" },
  death: { label: "Deaths",       color: "#e85aec" },
  loot:  { label: "Loot pickups", color: "#ffc94d" },
  storm: { label: "Storm deaths", color: "#8f7bff" },
};

export const BOT_COLOR = "#8a94a0";

/* Distinct hues for human players within a match. Deliberately avoids the
   four event colours so a path never reads as an event layer. */
const HUMAN_PALETTE = [
  "#4fc3f7", "#66e0a3", "#ff8fab", "#7ce8e0",
  "#c0e060", "#ffab70", "#b0a4ff", "#f5d0ff",
];

export function humanColor(i) {
  return HUMAN_PALETTE[i % HUMAN_PALETTE.length];
}

/* Marker glyphs — shape + colour double-encoding so layers stay readable
   for colourblind users and in dense clusters. */
export function drawGlyph(ctx, cat, x, y, r = 5) {
  ctx.strokeStyle = EVENT_META[cat].color;
  ctx.fillStyle = EVENT_META[cat].color;
  ctx.lineWidth = 1.8;
  switch (cat) {
    case "kill": { // ✕
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke();
      break;
    }
    case "death": { // ◆
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "loot": { // ▪
      ctx.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      break;
    }
    case "storm": { // ▲
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r);
      ctx.closePath(); ctx.fill();
      break;
    }
  }
}

export function fmtClock(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function fmtDate(d) {
  // "2026-02-10" -> "Feb 10"
  return "Feb " + String(parseInt(d.slice(8), 10));
}

export function shortId(id) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/* ── data loading with caches ─────────────────────────────────────────── */

const matchCache = new Map();
const eventsCache = new Map();
let indexP = null;
let heatP = null;

export function loadIndex() {
  indexP ??= fetch("data/index.json").then((r) => r.json());
  return indexP;
}

export function loadHeatmaps() {
  heatP ??= fetch("data/heatmaps.json").then((r) => r.json());
  return heatP;
}

export function loadMatch(id) {
  if (!matchCache.has(id)) {
    matchCache.set(id, fetch(`data/matches/${id}.json`).then((r) => r.json()));
  }
  return matchCache.get(id);
}

export function loadMapEvents(mapId) {
  if (!eventsCache.has(mapId)) {
    eventsCache.set(mapId, fetch(`data/events_${mapId}.json`).then((r) => r.json()));
  }
  return eventsCache.get(mapId);
}
