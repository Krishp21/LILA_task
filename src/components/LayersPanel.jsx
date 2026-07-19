/* Right panel: event layer toggles double as the legend; heatmap layer
   selector with opacity. Counts update with the current filter context. */

import { EVENT_META, BOT_COLOR } from "../lib/core.js";
import { HEAT_LAYERS } from "../lib/heatmap.js";

export default function LayersPanel({ layers, setLayers, counts }) {
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const setHeat = (id) => setLayers((l) => ({ ...l, heat: l.heat === id ? null : id }));

  return (
    <aside className="hud layers">
      <div className="section">
        <div className="eyebrow">Events</div>
        {Object.entries(EVENT_META).map(([k, meta]) => (
          <button key={k} className={"lrow" + (layers[k] ? "" : " off")} onClick={() => toggle(k)}>
            <Swatch cat={k} color={meta.color} />
            {meta.label}
            <span className="n">{counts?.[k] ?? ""}</span>
          </button>
        ))}
      </div>

      <div className="section">
        <div className="eyebrow">Actors</div>
        <button className={"lrow" + (layers.humans ? "" : " off")} onClick={() => toggle("humans")}>
          <span className="swatch" style={{ background: "#4fc3f7", borderRadius: 3 }} />
          Humans
          <span className="n">{counts?.humans ?? ""}</span>
        </button>
        <button className={"lrow" + (layers.bots ? "" : " off")} onClick={() => toggle("bots")}>
          <span className="swatch" style={{ background: BOT_COLOR, borderRadius: "50%" }} />
          Bots
          <span className="n">{counts?.bots ?? ""}</span>
        </button>
      </div>

      <div className="section" style={{ marginBottom: 0 }}>
        <div className="eyebrow">Heatmap</div>
        <div className="heat-select">
          {HEAT_LAYERS.map((h) => (
            <button
              key={h.id}
              className={"chip" + (layers.heat === h.id ? " on" : "")}
              onClick={() => setHeat(h.id)}
            >
              {h.label.replace(" · ", " ")}
            </button>
          ))}
        </div>
        {layers.heat && (
          <div className="slider-row">
            <span>Opacity</span>
            <input
              type="range" min="0.2" max="1" step="0.05"
              value={layers.heatOpacity}
              onChange={(e) => setLayers((l) => ({ ...l, heatOpacity: +e.target.value }))}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function Swatch({ cat, color }) {
  /* mirror the canvas glyph shapes so the legend teaches the map */
  const style = { color };
  switch (cat) {
    case "kill": return <svg className="swatch" viewBox="0 0 14 14" style={style}><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.2" /></svg>;
    case "death": return <svg className="swatch" viewBox="0 0 14 14" style={style}><path d="M7 1l6 6-6 6-6-6z" fill="currentColor" /></svg>;
    case "loot": return <svg className="swatch" viewBox="0 0 14 14" style={style}><rect x="3" y="3" width="8" height="8" fill="currentColor" /></svg>;
    case "storm": return <svg className="swatch" viewBox="0 0 14 14" style={style}><path d="M7 1l6 12H1z" fill="currentColor" /></svg>;
    default: return null;
  }
}
