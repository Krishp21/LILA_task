/* The map viewport. One canvas, layered draw:
     minimap image -> heatmap -> paths/trails -> event markers -> player heads
   Pan/zoom via useView; hover tooltips + click-through from aggregate dots. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useView } from "../hooks/useView.js";
import { sumBins, renderHeatCanvas } from "../lib/heatmap.js";
import {
  CANVAS, EVENT_META, BOT_COLOR, humanColor, drawGlyph, fmtClock, shortId,
} from "../lib/core.js";

const mapImageCache = new Map();
function getMapImage(mapId, onReady) {
  if (mapImageCache.has(mapId)) return mapImageCache.get(mapId);
  const img = new Image();
  img.src = `minimaps/${mapId}.jpg`;
  img.onload = onReady;
  mapImageCache.set(mapId, img);
  return img;
}

export default function MapCanvas({
  mapId, mode, dates, layers, heatmaps, aggEvents, match,
  playersVisible, playbackT, onPickMatch,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const { view, fit, zoomAt, panning, handlers, toWorld } = useView();
  const [tip, setTip] = useState(null);
  const [, bump] = useState(0); // re-render when the map image finishes loading

  /* fit view on mount + resize; refit when the map changes */
  useEffect(() => {
    const el = wrapRef.current;
    const doFit = () => fit(el.clientWidth, el.clientHeight);
    doFit();
    const ro = new ResizeObserver(doFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, mapId]);

  /* memoised heatmap overlay */
  const heat = useMemo(() => {
    if (!layers.heat || !heatmaps) return null;
    const grid = sumBins(heatmaps, mapId, dates, layers.heat);
    return renderHeatCanvas(grid, layers.heat);
  }, [heatmaps, mapId, dates, layers.heat]);

  /* filtered aggregate dots */
  const dots = useMemo(() => {
    if (mode !== "aggregate" || !aggEvents) return [];
    return aggEvents.filter(
      (e) => dates.has(e.d) && layers[e.c] && (e.b ? layers.bots : layers.humans),
    );
  }, [mode, aggEvents, dates, layers]);

  /* replay geometry: per-player colour + hit-testable heads/markers */
  const replayPlayers = useMemo(() => {
    if (!match) return [];
    let hi = 0;
    return match.players.map((p) => ({
      ...p,
      color: p.bot ? BOT_COLOR : humanColor(hi++),
    }));
  }, [match]);

  /* ── draw ─────────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const cnv = canvasRef.current;
    if (!cnv || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrapRef.current.clientWidth, h = wrapRef.current.clientHeight;
    if (cnv.width !== w * dpr || cnv.height !== h * dpr) {
      cnv.width = w * dpr; cnv.height = h * dpr;
      cnv.style.width = w + "px"; cnv.style.height = h + "px";
    }
    const ctx = cnv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    const s = view.scale; // for scale-invariant stroke widths: width / s

    const img = getMapImage(mapId, () => bump((n) => n + 1));
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, CANVAS, CANVAS);
    } else {
      ctx.fillStyle = "#151a20";
      ctx.fillRect(0, 0, CANVAS, CANVAS);
    }

    if (heat) {
      ctx.save();
      ctx.globalAlpha = layers.heatOpacity;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(heat.canvas, 0, 0, CANVAS, CANVAS);
      ctx.restore();
    }

    if (mode === "aggregate") {
      const r = Math.max(3.5 / s, 1.2);
      for (const e of dots) {
        ctx.globalAlpha = e.b ? 0.55 : 0.9;
        drawGlyphScaled(ctx, e.c, e.x, e.y, r, s);
      }
      ctx.globalAlpha = 1;
    }

    if (mode === "replay" && match) {
      for (const p of replayPlayers) {
        if (!playersVisible.has(p.id)) continue;
        if (p.bot && !layers.bots) continue;
        if (!p.bot && !layers.humans) continue;
        drawPlayer(ctx, p, playbackT, s, layers);
      }
    }
  }, [view, mapId, heat, layers, mode, dots, match, replayPlayers, playersVisible, playbackT]);

  useEffect(() => { draw(); }, [draw]);

  /* ── hover / click ────────────────────────────────────────────────── */
  const hitTest = useCallback((wx, wy) => {
    if (!view) return null;
    const r = 9 / view.scale;
    let best = null, bestD = r * r;
    if (mode === "aggregate") {
      for (const e of dots) {
        const d = (e.x - wx) ** 2 + (e.y - wy) ** 2;
        if (d < bestD) { bestD = d; best = { kind: "agg", e }; }
      }
    } else if (match) {
      for (const p of replayPlayers) {
        if (!playersVisible.has(p.id)) continue;
        for (const ev of p.events) {
          if (ev.t > playbackT) continue;
          if (!layers[ev.c]) continue;
          const d = (ev.x - wx) ** 2 + (ev.y - wy) ** 2;
          if (d < bestD) { bestD = d; best = { kind: "ev", ev, p }; }
        }
        const head = posAt(p.path, playbackT);
        if (head) {
          const d = (head[0] - wx) ** 2 + (head[1] - wy) ** 2;
          if (d < bestD) { bestD = d; best = { kind: "head", p, head }; }
        }
      }
    }
    return best;
  }, [view, mode, dots, match, replayPlayers, playersVisible, playbackT, layers]);

  const onMove = (e) => {
    if (handlers.onPointerMove(e)) { setTip(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = toWorld(sx, sy);
    if (!w) return;
    const hit = hitTest(w[0], w[1]);
    setTip(hit ? { hit, sx, sy } : null);
  };

  const onClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (!w) return;
    const hit = hitTest(w[0], w[1]);
    if (hit?.kind === "agg") onPickMatch(hit.e.m);
  };

  return (
    <div className="map-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={panning ? "panning" : ""}
        style={{ cursor: tip?.hit?.kind === "agg" ? "pointer" : undefined }}
        onWheel={handlers.onWheel}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={onMove}
        onPointerUp={handlers.onPointerUp}
        onPointerLeave={() => { handlers.onPointerUp(); setTip(null); }}
        onClick={onClick}
      />
      {tip && <Tip tip={tip} />}
      <div className="hud zoomer">
        <button title="Zoom in" onClick={() => zoomAt(wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2, 1.5)}>+</button>
        <button title="Zoom out" onClick={() => zoomAt(wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2, 1 / 1.5)}>−</button>
        <button title="Fit map" onClick={() => fit(wrapRef.current.clientWidth, wrapRef.current.clientHeight)}>⌂</button>
      </div>
    </div>
  );
}

/* glyphs keep constant on-screen size regardless of zoom */
function drawGlyphScaled(ctx, cat, x, y, r, s) {
  ctx.save();
  ctx.lineWidth = 1.8 / s;
  const meta = EVENT_META[cat];
  ctx.strokeStyle = meta.color; ctx.fillStyle = meta.color;
  drawGlyphPath(ctx, cat, x, y, r);
  ctx.restore();
}

function drawGlyphPath(ctx, cat, x, y, r) {
  switch (cat) {
    case "kill":
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke(); break;
    case "death":
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.fill(); break;
    case "loot":
      ctx.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); break;
    case "storm":
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r);
      ctx.closePath(); ctx.fill(); break;
  }
}

/* interpolated position at time t along [t,x,y] triplets */
export function posAt(path, t) {
  if (!path.length) return null;
  if (t <= path[0][0]) return [path[0][1], path[0][2]];
  const last = path[path.length - 1];
  if (t >= last[0]) return null; // journey over: player gone from the field
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid][0] <= t) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[hi];
  const f = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function drawPlayer(ctx, p, t, s, layers) {
  const lw = (p.bot ? 1.1 : 2) / s;

  if (p.path.length > 1) {
    /* full route, faint — where they will go */
    ctx.globalAlpha = p.bot ? 0.10 : 0.16;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = lw;
    strokePath(ctx, p.path, Infinity);

    /* trail up to t, bright — where they have been */
    ctx.globalAlpha = p.bot ? 0.5 : 0.95;
    strokePath(ctx, p.path, t);
    ctx.globalAlpha = 1;
  }

  /* passed events */
  const r = Math.max(5 / s, 1.5);
  for (const ev of p.events) {
    if (ev.t > t || !layers[ev.c]) continue;
    const recent = t - ev.t < 3;
    drawGlyphScaled(ctx, ev.c, ev.x, ev.y, recent ? r * (1.6 - 0.2 * (t - ev.t)) : r, s);
  }

  /* head */
  const head = posAt(p.path, t);
  if (head) {
    ctx.beginPath();
    ctx.arc(head[0], head[1], (p.bot ? 3 : 4.5) / s, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (!p.bot) {
      ctx.beginPath();
      ctx.arc(head[0], head[1], 7.5 / s, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2 / s;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function strokePath(ctx, path, tMax) {
  ctx.beginPath();
  ctx.moveTo(path[0][1], path[0][2]);
  for (let i = 1; i < path.length; i++) {
    const [t, x, y] = path[i];
    if (t > tMax) {
      /* partial segment up to tMax */
      const [t0, x0, y0] = path[i - 1];
      const f = (tMax - t0) / (t - t0 || 1);
      ctx.lineTo(x0 + (x - x0) * f, y0 + (y - y0) * f);
      break;
    }
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function Tip({ tip }) {
  const { hit, sx, sy } = tip;
  let head, sub, color;
  if (hit.kind === "agg") {
    const meta = EVENT_META[hit.e.c];
    color = meta.color;
    head = `${hit.e.e}${hit.e.b ? " · bot" : ""}`;
    sub = `${hit.e.d} · match ${shortId(hit.e.m)} — click to replay`;
  } else if (hit.kind === "ev") {
    color = EVENT_META[hit.ev.c].color;
    head = `${hit.ev.e} · ${hit.p.bot ? "bot" : "player"} ${shortId(hit.p.id)}`;
    sub = `at ${fmtClock(hit.ev.t)}`;
  } else {
    color = hit.p.color;
    head = `${hit.p.bot ? "Bot" : "Player"} ${shortId(hit.p.id)}`;
    sub = `${hit.p.events.length} events · ${hit.p.path.length} position samples`;
  }
  return (
    <div className="tip" style={{ left: sx + 14, top: sy + 14 }}>
      <div className="t-head">
        <span className="dot" style={{ background: color }} />
        {head}
      </div>
      <div className="t-sub">{sub}</div>
    </div>
  );
}
