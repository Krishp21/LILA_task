/* Playback controls + the match strip: a scrubber whose track carries a
   tick for every combat/loot/storm event, so you can see when the action
   happened before you scrub to it. */

import { useMemo } from "react";
import { EVENT_META, fmtClock } from "../lib/core.js";

const SPEEDS = [1, 4, 16];

export default function PlaybackBar({ match, playback, setPlayback }) {
  const dur = Math.max(match.duration_s, 1);

  const ticks = useMemo(() => {
    const out = [];
    for (const p of match.players) {
      for (const ev of p.events) {
        out.push({ t: ev.t, c: ev.c });
      }
    }
    return out;
  }, [match]);

  const toggle = () =>
    setPlayback((pb) => {
      /* pressing play at the end restarts */
      const t = !pb.playing && pb.t >= dur ? 0 : pb.t;
      return { ...pb, t, playing: !pb.playing };
    });

  return (
    <div className="hud playbar">
      <div className="row1">
        <button className="pbtn" onClick={toggle} title="Play / pause (space)">
          {playback.playing ? "❚❚" : "▶"}
        </button>
        <div className="speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={"chip" + (playback.speed === s ? " on" : "")}
              onClick={() => setPlayback((pb) => ({ ...pb, speed: s }))}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="strip">
          <div className="track" />
          <div className="fill" style={{ width: `${(playback.t / dur) * 100}%` }} />
          <div className="ticks">
            {ticks.map((tk, i) => (
              <span
                key={i}
                className="tick"
                style={{
                  left: `${(tk.t / dur) * 100}%`,
                  background: EVENT_META[tk.c].color,
                  opacity: tk.c === "loot" ? 0.28 : 0.9,
                }}
              />
            ))}
          </div>
          <input
            type="range" min="0" max={dur} step="1"
            value={playback.t}
            onChange={(e) => setPlayback((pb) => ({ ...pb, t: +e.target.value, playing: false }))}
            style={{ opacity: 0, height: "100%", cursor: "pointer" }}
            aria-label="Match timeline"
          />
        </div>
        <div className="clock">
          {fmtClock(playback.t)} <span>/ {fmtClock(dur)}</span>
        </div>
      </div>
    </div>
  );
}
