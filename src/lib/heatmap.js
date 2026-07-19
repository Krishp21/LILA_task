/* Heatmap layer: sums per-date sparse bins and renders a colormapped
   offscreen canvas that MapCanvas scales up with smoothing enabled
   (cheap gaussian-ish blur for free). */

import { EVENT_META } from "./core.js";

export const GRID = 64;

export const HEAT_LAYERS = [
  { id: "traffic_h", label: "Traffic · humans" },
  { id: "traffic_b", label: "Traffic · bots" },
  { id: "kill",      label: "Kill zones" },
  { id: "death",     label: "Death zones" },
  { id: "loot",      label: "Loot activity" },
  { id: "storm",     label: "Storm deaths" },
];

export function sumBins(heatmaps, mapId, dates, layer) {
  const grid = new Float32Array(GRID * GRID);
  const byDate = heatmaps?.[mapId];
  if (!byDate) return grid;
  for (const d of dates) {
    const cells = byDate[d]?.[layer];
    if (!cells) continue;
    for (const [idx, count] of cells) grid[idx] += count;
  }
  return grid;
}

/* Traffic layers use a white->yellow->red "thermal" ramp; event layers tint
   from transparent to the event colour so the overlay agrees with markers. */
const THERMAL = [
  [0.0, [0, 0, 0, 0]],
  [0.25, [43, 111, 255, 140]],
  [0.5, [60, 220, 190, 175]],
  [0.75, [255, 213, 74, 210]],
  [1.0, [255, 80, 60, 235]],
];

function eventRamp(hex) {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return [
    [0.0, [r, g, b, 0]],
    [0.45, [r, g, b, 130]],
    [1.0, [255, 255, 255, 240]],
  ];
}

function sample(ramp, t) {
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1], [t1, c1] = ramp[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return c0.map((v, k) => v + (c1[k] - v) * f);
    }
  }
  return ramp[ramp.length - 1][1];
}

export function renderHeatCanvas(grid, layer) {
  const ramp = layer.startsWith("traffic")
    ? THERMAL
    : eventRamp(EVENT_META[layer].color);

  // log scale: traffic counts span 1..~2000, linear would show one hot pixel
  let max = 0;
  for (const v of grid) if (v > max) max = v;
  const logMax = Math.log1p(max || 1);

  const cnv = document.createElement("canvas");
  cnv.width = GRID; cnv.height = GRID;
  const ctx = cnv.getContext("2d");
  const img = ctx.createImageData(GRID, GRID);
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    const t = Math.log1p(grid[i]) / logMax;
    const [r, g, b, a] = sample(ramp, t);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cnv, max };
}
