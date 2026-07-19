import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import LayersPanel from "./components/LayersPanel.jsx";
import PlaybackBar from "./components/PlaybackBar.jsx";
import MapCanvas from "./components/MapCanvas.jsx";
import {
  loadIndex, loadHeatmaps, loadMatch, loadMapEvents,
  fmtClock, fmtDate, shortId,
} from "./lib/core.js";

const DEFAULT_LAYERS = {
  kill: true, death: true, loot: true, storm: true,
  humans: true, bots: true,
  heat: null, heatOpacity: 0.75,
};

export default function App() {
  const [index, setIndex] = useState(null);
  const [heatmaps, setHeatmaps] = useState(null);
  const [mapId, setMapId] = useState("AmbroseValley");
  const [dates, setDates] = useState(null); // Set of "YYYY-MM-DD"
  const [mode, setMode] = useState("aggregate");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [matchId, setMatchId] = useState(null);
  const [match, setMatch] = useState(null);
  const [aggEvents, setAggEvents] = useState(null);
  const [playersVisible, setPlayersVisible] = useState(new Set());
  const [playback, setPlayback] = useState({ t: 0, playing: false, speed: 4 });

  /* ── boot: index + heatmaps, then apply any state shared in the URL ── */
  useEffect(() => {
    loadIndex().then((idx) => {
      setIndex(idx);
      const h = new URLSearchParams(location.hash.slice(1));
      setDates(new Set(h.get("dates")?.split(",") ?? idx.dates));
      if (h.get("map") && idx.maps.includes(h.get("map"))) setMapId(h.get("map"));
      if (h.get("heat")) setLayers((l) => ({ ...l, heat: h.get("heat") }));
      if (h.get("match")) openMatch(h.get("match"), idx);
    });
    loadHeatmaps().then(setHeatmaps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── shareable URLs ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!index || !dates) return;
    const h = new URLSearchParams();
    h.set("map", mapId);
    if (dates.size !== index.dates.length) h.set("dates", [...dates].join(","));
    if (layers.heat) h.set("heat", layers.heat);
    if (mode === "replay" && matchId) h.set("match", matchId);
    history.replaceState(null, "", "#" + h.toString());
  }, [index, mapId, dates, layers.heat, mode, matchId]);

  /* ── aggregate events for the active map ────────────────────────── */
  useEffect(() => {
    let live = true;
    setAggEvents(null);
    loadMapEvents(mapId).then((ev) => live && setAggEvents(ev));
    return () => { live = false; };
  }, [mapId]);

  /* ── match selection ────────────────────────────────────────────── */
  const openMatch = useCallback((id, idx = index) => {
    const row = idx?.matches.find((m) => m.id === id);
    if (!row) return;
    setMatchId(id);
    setMapId(row.map);
    setMode("replay");
    setMatch(null);
    loadMatch(id).then((m) => {
      setMatch(m);
      setPlayersVisible(new Set(m.players.map((p) => p.id)));
      setPlayback({ t: 0, playing: true, speed: 4 });
    });
  }, [index]);

  const clearMatch = useCallback(() => {
    setMode("aggregate");
    setMatchId(null);
    setMatch(null);
    setPlayback((pb) => ({ ...pb, playing: false, t: 0 }));
  }, []);

  const togglePlayer = useCallback((id) => {
    setPlayersVisible((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const toggleDate = useCallback((d) => {
    setDates((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      if (n.size === 0) n.add(d); // never allow an empty selection
      return n;
    });
  }, []);

  /* ── playback loop ──────────────────────────────────────────────── */
  const rafRef = useRef();
  useEffect(() => {
    if (!playback.playing || !match) return;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayback((pb) => {
        const t = pb.t + dt * pb.speed;
        if (t >= match.duration_s) return { ...pb, t: match.duration_s, playing: false };
        return { ...pb, t };
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playback.playing, playback.speed, match]);

  /* space = play/pause */
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" && mode === "replay" && match && e.target.tagName !== "INPUT") {
        e.preventDefault();
        setPlayback((pb) => ({ ...pb, playing: !pb.playing }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, match]);

  /* ── legend counts for the current context ──────────────────────── */
  const counts = useMemo(() => {
    if (mode === "replay" && match) {
      const c = { humans: 0, bots: 0, kill: 0, death: 0, loot: 0, storm: 0 };
      for (const p of match.players) {
        p.bot ? c.bots++ : c.humans++;
        for (const ev of p.events) c[ev.c]++;
      }
      return c;
    }
    if (aggEvents && dates) {
      const c = { kill: 0, death: 0, loot: 0, storm: 0, humans: 0, bots: 0 };
      const hs = new Set(), bs = new Set();
      for (const e of aggEvents) {
        if (!dates.has(e.d)) continue;
        c[e.c]++;
        (e.b ? bs : hs).add(e.m);
      }
      c.humans = null; c.bots = null; // actor counts not meaningful here
      return c;
    }
    return null;
  }, [mode, match, aggEvents, dates]);

  if (!index || !dates) {
    return <div className="app" style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}>Loading telemetry…</div>;
  }

  const matchRow = matchId && index.matches.find((m) => m.id === matchId);

  return (
    <div className="app">
      <MapCanvas
        mapId={mapId}
        mode={mode}
        dates={dates}
        layers={layers}
        heatmaps={heatmaps}
        aggEvents={aggEvents}
        match={mode === "replay" ? match : null}
        playersVisible={playersVisible}
        playbackT={playback.t}
        onPickMatch={openMatch}
      />

      <header className="hud brand">
        <h1>LILA <span>BLACK</span> · Map Intel</h1>
        <span className="sub">Feb 10–14 telemetry</span>
      </header>

      {mode === "replay" && matchRow && (
        <div className="hud summary">
          <span>match <b>{shortId(matchRow.id)}</b></span>
          <span>{fmtDate(matchRow.date)} {matchRow.start.slice(11, 16)}</span>
          <span><b>{matchRow.humans}</b> humans · <b>{matchRow.bots}</b> bots</span>
          <span>{fmtClock(matchRow.duration_s)}</span>
          <button className="close" onClick={clearMatch} title="Back to aggregate view">✕</button>
        </div>
      )}

      <Sidebar
        index={index}
        mapId={mapId}
        setMapId={(m) => { setMapId(m); if (mode === "replay") clearMatch(); }}
        dates={dates}
        toggleDate={toggleDate}
        mode={mode}
        setMode={(m) => (m === "aggregate" ? clearMatch() : setMode(m))}
        matchId={matchId}
        pickMatch={openMatch}
        match={match}
        playersVisible={playersVisible}
        togglePlayer={togglePlayer}
        clearMatch={clearMatch}
      />

      <LayersPanel layers={layers} setLayers={setLayers} counts={counts} />

      {mode === "replay" && match && (
        <PlaybackBar match={match} playback={playback} setPlayback={setPlayback} />
      )}

      {mode === "replay" && !match && matchId && (
        <div className="hud summary">Loading match…</div>
      )}
    </div>
  );
}
