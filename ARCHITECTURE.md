# Architecture

## What it's built with, and why

| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python (pyarrow + pandas), offline | 89k rows / 34 MB is small data. Processing it **once at build time** beats running a server forever. Zero backend = zero env vars, zero cold starts, nothing to break during evaluation. |
| Processed store | Static JSON in `public/data/` | Match index (160 KB), one file per match (~5 KB each), sparse binned heatmaps (184 KB). The browser lazy-loads only what the current view needs. |
| Frontend | React + Vite, hand-rolled `<canvas>` renderer | 50k+ points need canvas, not SVG/DOM. deck.gl/Pixi would be overkill at this scale; a 1,100-line custom renderer keeps full control of the replay/trail/marker drawing and adds no dependency weight. |
| Hosting | Vercel static deploy | `vite build` → CDN. The shareable-link requirement is satisfied twice: the deploy URL, plus app state (map/dates/heatmap/match) is encoded in the URL hash so designers can link each other to an exact view. |

## Data flow

```
player_data.zip (1,243 parquet files, no extension)
        │  pipeline/build.py
        ▼
 decode event bytes → repair timestamps → strip .nakama-0 → flag bots
 → project (x,z) to 1024² canvas px → validate & clamp → dedupe
        │
        ├── index.json          match catalogue: map, date, duration, actor
        │                       counts, event counts, "interestingness" score
        ├── matches/{id}.json   per-player paths as [t,px,py] triplets + events
        ├── events_{map}.json   every discrete event, for the aggregate scatter
        ├── heatmaps.json       64×64 sparse bins per map × date × layer
        └── validation.json     anomaly report from the build
        │
        ▼
 React app: aggregate view (heatmaps + clickable event dots)
            replay view (timeline playback, trails, per-player toggles)
```

Coordinates are projected **in the pipeline**, so the frontend never does
coordinate math — it draws pre-computed pixels and stays dumb and fast.

## Coordinate mapping (the tricky part)

The README gives per-map `scale` and `origin`, and the transform:

```
u = (x − origin_x) / scale            # normalised 0–1, west→east
v = (z − origin_z) / scale            # normalised 0–1, south→north
px = u · 1024
py = (1 − v) · 1024                   # flip: image origin is top-left
```

Three things made this trickier than the formula suggests:

1. **The minimap images are not 1024×1024** as documented — they ship at
   2160×2158, 4320×4320 and 9000×9000. The transform itself is
   resolution-independent (it goes through UV space), so I normalised
   everything to a fixed **1024 canvas space**: the pipeline emits pixels in
   that space and `prepare_minimaps.py` downscales all images to 1024×1024
   web assets. GrandRift is 2 px off square; resizing adds ~0.1% vertical
   stretch — far below marker size.
2. **Verification, not trust.** The build asserts every projected point lands
   inside [0, 1024] (result: 0 out-of-bounds across 89k rows, with clamping
   as a guard), reproduces the README's worked example exactly
   (x=−301.45, z=−355.55 → px 78, py 890 ✓), and I rendered smoke-test
   overlays: paths follow roads, events cluster on POIs, nothing lands in
   water or void on any map.
3. **`y` is elevation** and is ignored for 2-D plotting, per the README.

## Assumptions where the data was ambiguous

- **Timestamp bug**: `ts` is *typed* as timestamp-ms but *stores epoch
  seconds* — read naively, matches last "0.4 s" in January 1970.
  Reinterpreting the raw integer as seconds puts events on Feb 10–14 2026
  with sane 4–15 min durations. All dates/durations derive from this fix.
- **Folder dates ≠ event dates** for 348 rows (all ~23:00 UTC, filed under
  the next day's folder). Canonical date = corrected UTC timestamp, which is
  why "Feb 9" appears as a filterable date.
- **One journey file is duplicated verbatim** across the Feb 10 and Feb 11
  folders. The loader keeps the first copy per `(user_id, match_id)` key —
  otherwise that player's events would double-count in heatmaps.
- **Bot event mirroring**: `BotKill`/`BotKilled` events appear in *both* the
  human's and the bot's journey files. Analyses in INSIGHTS.md count from
  human files only to avoid double counting; the replay view draws whatever
  each visible player logged.
- **No extraction event exists**, so a journey ending is ambiguous
  (extracted vs. died vs. tracking stopped). The replay removes a player's
  head marker when their path ends and makes no claim about why.
- **Human vs. bot** is inferred from the documented ID convention
  (UUID = human, numeric = bot).

## Major trade-offs

| Considered | Decided | Why |
|---|---|---|
| Live query backend (DuckDB/FastAPI) vs. static precompute | **Static** | Dataset is frozen and small; static is faster, free, and un-breakable during review. Cost: new data requires a rebuild (`npm run pipeline` + redeploy). |
| deck.gl / Pixi vs. hand-rolled canvas | **Hand-rolled** | Full control over trails/glyph pulse/hit-testing; no 300 KB dependency for 90k points. Cost: no WebGL headroom if data grows 100×. |
| One big data file vs. per-match files | **Per-match** | Initial load is 160 KB instead of 4 MB; replay fetches ~5 KB on demand. Cost: 796 small files (irrelevant on a CDN). |
| Heatmap binning client-side vs. pipeline | **Pipeline bins (per date), client sums** | Date-range filtering stays instant without shipping raw positions. Cost: bin size fixed at build time (64×64 ≈ 14 m cells on AmbroseValley). |
| Loot dots on by default in aggregate | **On** | Loot is 80% of discrete events and visually dominant, but hiding data by default felt dishonest; one click toggles it off. |
