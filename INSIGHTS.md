# Three Things the Data Says About LILA BLACK

All numbers below come from the processed dataset (Feb 10–14, 2026 — 89,016
telemetry rows, 796 matches, 1,242 player journeys) and are reproducible with
`pipeline/build.py` plus the analysis notes in each section. Each insight has a
"see it in the tool" link — append the hash to the deployed URL.

---

## 1. There is no PvP in this game right now — every fight is human vs. bot

**What caught my eye:** the event legend. Out of 3,121 kill events, the
`Kill` (human-killed-human) count was 3. Three.

**The evidence:**

- **779 of 796 matches (97.9%) contain exactly one human.** 16 matches are
  bot-only, and exactly *one* match in five days had two humans in it — and
  they never fought (2 deaths in that match, both to bots).
- The 3 recorded `Kill`/`Killed` PvP events are a telemetry artifact, not
  combat: in each case the **same player logs both `Kill` and `Killed` at the
  identical timestamp and position**, in a match with only one human. That
  pattern is a self-elimination or a double-attribution bug, so true PvP in
  this dataset is **zero**.
- Meanwhile humans farm bots at a **5.5 : 1 kill/death ratio** (2,227 bot
  kills vs. 402 deaths to bots, counted from human journey files only), and a
  human dies to bots only ~4–5 times per hour of play across all three maps
  (4.9 AmbroseValley, 4.2 Lockdown, 3.8 GrandRift).

**Actionable items & affected metrics:**

- *Matchmaking/liveness*: if the design intent is player-vs-player extraction
  tension, concurrency is far too low to deliver it. Filling matches to even
  2–3 humans would move **PvP encounter rate** (currently 0), **session
  length**, and likely **retention** — extraction shooters live on the threat
  of other humans.
- *Bot tuning*: a 5.5 K/D with no PvP pressure means bots are the entire
  challenge, and they're losing. Raising bot lethality/positioning quality is
  the only short-term lever on **death rate** and **match difficulty**.
- *Data quality*: file a bug for the self-referential `Kill`+`Killed` pair —
  it will silently pollute PvP dashboards the moment real PvP appears.

**Why a level designer should care:** every PvP-oriented feature on these
maps — sightlines, flank routes, chokepoints, cover placement around
extraction — is currently receiving **zero validation** from live data. Any
"players fight here" conclusion drawn from the kill heatmap is really
"players meet bots here," which mostly reflects bot spawn placement, a knob
the team controls, not emergent player behavior.

*See it in the tool:* `#map=AmbroseValley&heat=kill` — every ✕ on that
heatmap is a bot dying.

---

## 2. The storm only kills committed looters, only after minute 11 — and it has never killed a bot

**What caught my eye:** storm-death triangles (▲) are rare (39 in five days)
and every single one belongs to a human. Scrubbing replays showed they always
land at the very end of long matches.

**The evidence:**

- **All 39 storm deaths occur between 655s and 887s** (10:55–14:47), median
  12:19 — while the median match lasts just **6:22**. The storm is irrelevant
  to a typical match and lethal only in the longest ~tail of matches.
- **Storm victims are the game's most engaged looters:** median **18 loot
  pickups** vs. 14 for other humans (+29%), and their journeys last a median
  **734s vs. 347s** — they stay on the map more than twice as long as
  everyone else.
- **Zero of the 39 victims are bots.** Bots either path-plan around the zone
  perfectly or are exempt — either way, the storm is a human-only tax.
- Storm-death positions skew toward the direction players drift over a match
  (mean human position moves +43 to +59 px east across all three maps from
  early- to late-match), i.e., victims die along the push direction, caught
  mid-rotation rather than in a fixed "trap" corner.

**Actionable items & affected metrics:**

- *Pacing lever*: if the storm should create tension for the median player,
  its schedule needs to bite before the 6–7 minute mark. Tightening it moves
  **average match duration**, **extraction rate**, and **loot-per-match**.
- *Loot-density lever*: victims are players the loot economy successfully
  seduced into overstaying. If overstay-deaths are unwanted, taper loot value
  in late-storm zones; if they're wanted (risk/reward), the current tuning is
  working and the 5.3% of human deaths the storm claims is the price signal.
- *Bot believability*: bots never dying to the storm is immersion-breaking in
  spectated/killcam moments and makes the storm feel like a scripted human
  penalty. Bot **storm-death rate > 0** is a cheap authenticity win.

**Why a level designer should care:** storm deaths mark exactly where the
map's loot placement outbids the player's survival instinct. Those triangle
clusters are a free heat-check on which POIs are "too good to leave" relative
to their distance from safety — that's a placement problem, not a player
problem.

*See it in the tool:* `#map=AmbroseValley&heat=storm` — then open any match
with a storm tick (purple) on the timeline and scrub to the final minute.

---

## 3. Players use a quarter to a third of each map, and where fights happen is map-dependent — at loot on AmbroseValley, in transit on Lockdown

**What caught my eye:** switching the traffic heatmap between maps. Huge
areas of every map show zero human footfall, and the kill overlay sits *on*
the loot overlay on AmbroseValley but *between* loot areas on Lockdown.

**The evidence:**

- Human traffic touches **38%** of AmbroseValley's grid, **25%** of
  Lockdown's, and **24%** of GrandRift's (64×64 cells over the full minimap;
  the raw numbers include void border cells, so compare across maps rather
  than reading them as absolute "playable coverage" — the tool's traffic
  layer shows the actual shapes).
- Traffic is heavily concentrated: **the busiest 10% of visited cells carry
  48% of all human movement on AmbroseValley** (41% Lockdown, 36% GrandRift).
  A handful of hot POIs plus connecting roads is the whole game.
- Fights anchor differently per map: bin-level correlation between loot
  pickups and kills is **r = 0.35 on AmbroseValley** (fights happen at loot),
  but **r ≈ 0.0–0.05 on GrandRift and Lockdown** — combat there is spatially
  decoupled from looting, i.e., it happens on the move between POIs.
- GrandRift is barely in the game: **7% of matches** (59 of 796) and 6.8
  human-hours vs. AmbroseValley's 63.2. Its daily share reads 8% → 7% → 6% →
  4% over the four full days (small n — a watch item, not a verdict).

**Actionable items & affected metrics:**

- *Reclaim dead zones*: use the traffic layer per map to list named regions
  with near-zero footfall, then either seed them (loot, objectives,
  extraction variety) or cut them. Affects **map coverage %**, **POI visit
  distribution**, **time-to-first-contact**.
- *Map-specific combat tuning*: on Lockdown, cover and engagement design
  belongs on *routes*, not at loot rooms — the data says that's where fights
  actually occur. On AmbroseValley, POI interiors deserve the attention.
  Affects **kill-location distribution**, **fight duration**.
- *GrandRift decision*: with 24% coverage, the weakest traffic concentration,
  and single-digit match share, GrandRift needs either a content pass or a
  rotation-weight experiment before investing further. Track **map pick/serve
  rate** and **per-map retention**.

**Why a level designer should care:** this is the direct answer to "which
areas of the map get ignored" — the question this tool was built for. Two
thirds of authored space is currently unvisited scenery, and the *kind* of
combat each map produces is different enough that a single design playbook
across all three maps is leaving data on the table.

*See it in the tool:* toggle `#map=Lockdown&heat=traffic_h` against
`#map=Lockdown&heat=kill`, then repeat on AmbroseValley — the overlap
difference is visible immediately.

---

### Methodology notes

- Human/bot attribution follows the filename convention (UUID = human,
  numeric = bot). Combat ratios use events from human journey files only,
  because `BotKill`/`BotKilled` events are mirrored into bot files and would
  double-count.
- Timestamps use the corrected epoch interpretation (see ARCHITECTURE.md —
  the raw `ts` column is mistyped).
- Grid statistics use the same 64×64 binning the tool's heatmaps render, so
  every number here can be eyeballed directly in the UI.
