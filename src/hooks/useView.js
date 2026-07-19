/* Pan/zoom state for the 1024-space map inside an arbitrary viewport.
   Screen = world * scale + offset. Wheel zooms to cursor; drag pans. */

import { useCallback, useRef, useState } from "react";
import { CANVAS } from "../lib/core.js";

export function fitTransform(w, h) {
  const scale = Math.min(w, h) / CANVAS * 0.96;
  return { scale, ox: (w - CANVAS * scale) / 2, oy: (h - CANVAS * scale) / 2 };
}

export function useView() {
  const [view, setView] = useState(null); // null until first fit
  const drag = useRef(null);
  const [panning, setPanning] = useState(false);

  const fit = useCallback((w, h) => setView(fitTransform(w, h)), []);

  const zoomAt = useCallback((sx, sy, factor) => {
    setView((v) => {
      if (!v) return v;
      const scale = Math.min(Math.max(v.scale * factor, 0.15), 30);
      const k = scale / v.scale;
      return { scale, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k };
    });
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
  }, [zoomAt]);

  const onPointerDown = useCallback((e) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return false;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => v && { ...v, ox: v.ox + dx, oy: v.oy + dy });
    return true;
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
    setPanning(false);
  }, []);

  const toWorld = useCallback(
    (sx, sy) => view && [(sx - view.ox) / view.scale, (sy - view.oy) / view.scale],
    [view],
  );

  return { view, fit, zoomAt, panning,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerUp }, toWorld };
}
