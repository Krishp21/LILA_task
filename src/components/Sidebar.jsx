/* Left rail: map picker, date filter, mode switch, match browser and —
   during replay — the in-match player roster with visibility toggles. */

import { useMemo, useState } from "react";
import { fmtClock, fmtDate, shortId, BOT_COLOR, humanColor } from "../lib/core.js";

export default function Sidebar({
  index, mapId, setMapId, dates, toggleDate, mode, setMode,
  matchId, pickMatch, match, playersVisible, togglePlayer, clearMatch,
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index.matches.filter(
      (m) =>
        m.map === mapId &&
        dates.has(m.date) &&
        (!q || m.id.toLowerCase().includes(q)),
    );
  }, [index, mapId, dates, query]);

  const mapCounts = useMemo(() => {
    const c = {};
    if (index) for (const m of index.matches) c[m.map] = (c[m.map] || 0) + 1;
    return c;
  }, [index]);

  return (
    <aside className="hud rail">
      <div className="rail-scroll">
        <div className="section">
          <div className="eyebrow">Map</div>
          <div className="map-pick">
            {index?.maps.map((m) => (
              <button key={m} className={m === mapId ? "on" : ""} onClick={() => setMapId(m)}>
                <img src={`minimaps/${m}.jpg`} alt="" />
                <span className="meta">
                  {m.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  <small>{mapCounts[m] || 0} matches</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="eyebrow">Dates</div>
          <div className="chips">
            {index?.dates.map((d) => (
              <button key={d} className={"chip" + (dates.has(d) ? " on" : "")} onClick={() => toggleDate(d)}>
                {fmtDate(d)}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="eyebrow">View</div>
          <div className="mode">
            <button className={mode === "aggregate" ? "on" : ""} onClick={() => setMode("aggregate")}>
              Aggregate
            </button>
            <button className={mode === "replay" ? "on" : ""} onClick={() => setMode("replay")}>
              Match replay
            </button>
          </div>
        </div>

        {mode === "replay" && match && (
          <div className="section">
            <div className="eyebrow">In this match</div>
            <PlayerRoster match={match} playersVisible={playersVisible} togglePlayer={togglePlayer} />
          </div>
        )}

        <div className="section">
          <div className="eyebrow">
            Matches · {matches.length}
          </div>
          <input
            className="search"
            placeholder="Filter by match id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length === 0 && (
            <div className="empty">
              No matches for this map and date selection. Widen the date filter or switch maps.
            </div>
          )}
          {matches.slice(0, 120).map((m) => (
            <MatchRow key={m.id} m={m} active={m.id === matchId} onClick={() => pickMatch(m.id)} />
          ))}
          {matches.length > 120 && (
            <div className="empty">{matches.length - 120} more — narrow with the filter above.</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function MatchRow({ m, active, onClick }) {
  const time = m.start.slice(11, 16);
  return (
    <button className={"match-row" + (active ? " on" : "")} onClick={onClick}>
      <div className="top">
        <span className="id">{shortId(m.id)}</span>
        <span className="dur">{fmtDate(m.date)} {time} · {fmtClock(m.duration_s)}</span>
      </div>
      <div className="bottom">
        <span><b>{m.humans}</b> human{m.humans === 1 ? "" : "s"}</span>
        <span><b>{m.bots}</b> bots</span>
        {m.events.kill > 0 && <span className="k">{m.events.kill} K</span>}
        {m.events.death > 0 && <span className="d">{m.events.death} D</span>}
        {m.events.storm > 0 && <span className="s">{m.events.storm} storm</span>}
      </div>
    </button>
  );
}

function PlayerRoster({ match, playersVisible, togglePlayer }) {
  let hi = 0;
  const rows = match.players.map((p) => ({
    ...p,
    color: p.bot ? BOT_COLOR : humanColor(hi++),
  }));
  rows.sort((a, b) => a.bot - b.bot);
  return (
    <div>
      {rows.map((p) => (
        <button
          key={p.id}
          className={"lrow" + (playersVisible.has(p.id) ? "" : " off")}
          onClick={() => togglePlayer(p.id)}
          title="Show / hide this player"
        >
          <span className="swatch" style={{ background: p.color, borderRadius: p.bot ? "50%" : "3px" }} />
          {p.bot ? `Bot ${p.id}` : `Player ${shortId(p.id)}`}
          <span className="n">{p.events.length} ev</span>
        </button>
      ))}
    </div>
  );
}
