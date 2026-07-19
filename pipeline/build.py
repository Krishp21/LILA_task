"""LILA BLACK telemetry -> static web assets.

Reads the raw per-player-per-match parquet files and emits:

    public/data/index.json            match catalogue (drives filters/browser)
    public/data/matches/{id}.json     per-match replay payload (paths + events)
    public/data/heatmaps.json         per map/day/layer binned densities
    public/data/validation.json       anomaly report from this build

Usage:
    python pipeline/build.py --raw /path/to/player_data --out public
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

from config import (
    CANVAS,
    DAY_FOLDERS,
    EVENT_CATEGORY,
    HEATMAP_GRID,
    MAPS,
    is_bot,
    world_to_canvas,
)

# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def fix_timestamp(ts_series: pd.Series) -> pd.Series:
    """Repair the telemetry timestamp bug.

    The `ts` column is *typed* as timestamp[ms] but the writer stored unix
    epoch **seconds** in it. Read naively, every event lands in Jan 1970 and
    matches appear to last ~0.4 "seconds". Reinterpreting the raw integer as
    epoch seconds puts events on Feb 10-14 2026 (matching the folder dates)
    and yields sane 4-15 minute match durations.
    """
    raw = ts_series.astype("int64")  # datetime64[ms] -> raw ms integer
    return pd.to_datetime(raw, unit="s", utc=True)


def load_all(raw_root: Path) -> tuple[pd.DataFrame, list[dict], list[str]]:
    """Load every journey file once.

    The raw drop contains at least one journey file duplicated verbatim
    across two day folders. Since a filename encodes (user_id, match_id) —
    one journey — we keep the first copy of each key and report the rest,
    otherwise that player's events would be double-counted downstream.
    """
    frames, failures, skipped_dupes = [], [], []
    seen: set[str] = set()
    for day in DAY_FOLDERS:
        folder = raw_root / day
        if not folder.is_dir():
            failures.append({"file": str(folder), "error": "missing day folder"})
            continue
        for f in sorted(folder.iterdir()):
            if not f.name.endswith(".nakama-0"):
                continue
            key = f.name
            if key in seen:
                skipped_dupes.append(f"{day}/{f.name}")
                continue
            seen.add(key)
            try:
                df = pq.read_table(f).to_pandas()
                df["day_folder"] = day
                frames.append(df)
            except Exception as e:  # keep going; report at the end
                failures.append({"file": f.name, "error": str(e)})
    df = pd.concat(frames, ignore_index=True)

    df["event"] = df["event"].apply(
        lambda v: v.decode("utf-8") if isinstance(v, (bytes, bytearray)) else v
    )
    df["match_id"] = df["match_id"].str.replace(".nakama-0", "", regex=False)
    df["ts"] = fix_timestamp(df["ts"])
    df["bot"] = df["user_id"].map(is_bot)
    df["category"] = df["event"].map(EVENT_CATEGORY)
    return df, failures, skipped_dupes


# ---------------------------------------------------------------------------
# Projection + validation
# ---------------------------------------------------------------------------

def project(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    px_list, py_list = [], []
    for map_id, x, z in zip(df["map_id"], df["x"], df["z"]):
        px, py = world_to_canvas(float(x), float(z), map_id)
        px_list.append(px)
        py_list.append(py)
    df = df.assign(px=px_list, py=py_list)

    oob = df[(df.px < 0) | (df.px > CANVAS) | (df.py < 0) | (df.py > CANVAS)]
    oob_report = {
        "total_out_of_bounds": int(len(oob)),
        "by_map": oob.groupby("map_id").size().to_dict() if len(oob) else {},
    }
    # Clamp rather than drop: a point 2px outside the frame is still signal.
    df["px"] = df["px"].clip(0, CANVAS)
    df["py"] = df["py"].clip(0, CANVAS)
    return df, oob_report


def validate(df: pd.DataFrame) -> dict:
    report = {}
    # A match should live on exactly one map.
    maps_per_match = df.groupby("match_id")["map_id"].nunique()
    report["matches_with_multiple_maps"] = int((maps_per_match > 1).sum())
    # Unknown event strings would silently drop from heatmaps.
    report["unknown_events"] = sorted(df[df["category"].isna()]["event"].unique().tolist())
    # Folder date vs corrected timestamp date agreement.
    folder_day = df["day_folder"].str.replace("February_", "2026-02-", regex=False)
    ts_day = df["ts"].dt.strftime("%Y-%m-%d")
    report["rows_where_folder_and_ts_date_disagree"] = int((folder_day != ts_day).sum())
    # Journeys with almost no data (instant deaths / trackers cut short).
    per_file = df.groupby(["match_id", "user_id"]).size()
    report["journeys_under_5_rows"] = int((per_file < 5).sum())
    report["total_journeys"] = int(len(per_file))
    return report


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

def build_match_payloads(df: pd.DataFrame, out_dir: Path) -> list[dict]:
    """Write one JSON per match; return the index rows."""
    index_rows = []
    matches_dir = out_dir / "data" / "matches"
    matches_dir.mkdir(parents=True, exist_ok=True)

    for match_id, mdf in df.groupby("match_id", sort=False):
        t0 = mdf["ts"].min()
        duration = int((mdf["ts"].max() - t0).total_seconds())
        rel_t = ((mdf["ts"] - t0).dt.total_seconds()).astype(int)
        mdf = mdf.assign(t=rel_t).sort_values("t")

        players = []
        for user_id, pdf in mdf.groupby("user_id", sort=False):
            moves = pdf[pdf["category"] == "move"]
            events = pdf[(pdf["category"] != "move") & pdf["category"].notna()]
            players.append(
                {
                    "id": user_id,
                    "bot": bool(pdf["bot"].iloc[0]),
                    # path: [t, px, py] triplets, ints — ~75% smaller than objects
                    "path": [
                        [int(t), round(float(px)), round(float(py))]
                        for t, px, py in zip(moves["t"], moves["px"], moves["py"])
                    ],
                    "events": [
                        {
                            "t": int(t),
                            "e": ev,             # raw event name (Kill, BotKilled, ...)
                            "c": cat,            # category (kill/death/storm/loot)
                            "x": round(float(px)),
                            "y": round(float(py)),
                        }
                        for t, ev, cat, px, py in zip(
                            events["t"], events["event"], events["category"],
                            events["px"], events["py"],
                        )
                    ],
                }
            )

        humans = [p for p in players if not p["bot"]]
        ev_counts = mdf[mdf["category"].notna()].groupby("category").size().to_dict()
        ev_counts.pop("move", None)

        row = {
            "id": match_id,
            "map": mdf["map_id"].iloc[0],
            "date": t0.strftime("%Y-%m-%d"),
            "start": t0.isoformat(),
            "duration_s": duration,
            "humans": len(humans),
            "bots": len(players) - len(humans),
            "events": {k: int(v) for k, v in sorted(ev_counts.items())},
        }
        # Rank "interesting" matches first in the browser: humans present,
        # combat happened, reasonable length.
        row["score"] = (
            row["humans"] * 20
            + row["events"].get("kill", 0) * 3
            + row["events"].get("death", 0) * 3
            + row["events"].get("storm", 0) * 5
            + row["events"].get("loot", 0)
            + min(duration, 600) // 60
        )
        index_rows.append(row)

        with open(matches_dir / f"{match_id}.json", "w") as fh:
            json.dump(
                {"id": match_id, "map": row["map"], "date": row["date"],
                 "duration_s": duration, "players": players},
                fh, separators=(",", ":"),
            )
    return index_rows


def build_aggregate_events(df: pd.DataFrame, out_dir: Path) -> None:
    """Per-map scatter of every discrete event, for the aggregate view.

    events_{map}.json: [{d: date, m: match_id, e: event, c: category,
                         x, y: canvas px, b: actor is bot}]
    Lets the frontend plot all kills/deaths/loot/storm dots for a date range
    and click any dot through to its match replay.
    """
    disc = df[df["category"].notna() & (df["category"] != "move")]
    dates = disc["ts"].dt.strftime("%Y-%m-%d")
    for map_id, mdf in disc.groupby("map_id"):
        rows = [
            {
                "d": d, "m": mid, "e": ev, "c": cat,
                "x": round(float(px)), "y": round(float(py)), "b": bool(b),
            }
            for d, mid, ev, cat, px, py, b in zip(
                dates.loc[mdf.index], mdf["match_id"], mdf["event"],
                mdf["category"], mdf["px"], mdf["py"], mdf["bot"],
            )
        ]
        with open(out_dir / "data" / f"events_{map_id}.json", "w") as fh:
            json.dump(rows, fh, separators=(",", ":"))


def build_heatmaps(df: pd.DataFrame) -> dict:
    """Sparse binned densities: heatmaps[map][date][layer] = [[bin, count], ...]

    Layers: kill, death, storm, loot, traffic_h (human movement),
    traffic_b (bot movement). 64x64 grid over the 1024 canvas; sparse
    [bin_index, count] pairs keep the JSON small. Per-date grids let the
    frontend sum any date range client-side.
    """
    cell = CANVAS / HEATMAP_GRID
    acc: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    dates = df["ts"].dt.strftime("%Y-%m-%d")
    for map_id, date, cat, botflag, px, py in zip(
        df["map_id"], dates, df["category"], df["bot"], df["px"], df["py"]
    ):
        if pd.isna(cat):
            continue
        layer = ("traffic_b" if botflag else "traffic_h") if cat == "move" else cat
        gx = min(int(px // cell), HEATMAP_GRID - 1)
        gy = min(int(py // cell), HEATMAP_GRID - 1)
        acc[map_id][date][layer + f"|{gy * HEATMAP_GRID + gx}"] += 1

    out: dict = {}
    for map_id, by_date in acc.items():
        out[map_id] = {}
        for date, cells in by_date.items():
            layers: dict = defaultdict(list)
            for key, count in cells.items():
                layer, bin_idx = key.split("|")
                layers[layer].append([int(bin_idx), count])
            out[map_id][date] = {k: sorted(v) for k, v in layers.items()}
    return out


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, help="path to raw player_data folder")
    ap.add_argument("--out", default="public", help="output root (default: public)")
    args = ap.parse_args()

    raw_root, out_dir = Path(args.raw), Path(args.out)
    (out_dir / "data").mkdir(parents=True, exist_ok=True)

    print("Loading parquet files...")
    df, failures, skipped_dupes = load_all(raw_root)
    print(f"  {len(df):,} rows loaded, {len(failures)} file failures, "
          f"{len(skipped_dupes)} duplicate journey files skipped")

    print("Projecting coordinates...")
    df, oob_report = project(df)

    print("Validating...")
    report = validate(df)
    report["file_read_failures"] = failures
    report["duplicate_journey_files_skipped"] = skipped_dupes
    report["out_of_bounds"] = oob_report
    report["grid"] = {"canvas": CANVAS, "heatmap_bins": HEATMAP_GRID}

    print("Writing match payloads...")
    index_rows = build_match_payloads(df, out_dir)
    index_rows.sort(key=lambda r: -r["score"])

    print("Writing aggregate events...")
    build_aggregate_events(df, out_dir)

    print("Writing heatmaps...")
    heatmaps = build_heatmaps(df)

    with open(out_dir / "data" / "index.json", "w") as fh:
        json.dump(
            {
                "maps": list(MAPS.keys()),
                "dates": sorted(df["ts"].dt.strftime("%Y-%m-%d").unique().tolist()),
                "matches": index_rows,
            },
            fh, separators=(",", ":"),
        )
    with open(out_dir / "data" / "heatmaps.json", "w") as fh:
        json.dump(heatmaps, fh, separators=(",", ":"))
    with open(out_dir / "data" / "validation.json", "w") as fh:
        json.dump(report, fh, indent=2)

    print("\nValidation summary:")
    print(json.dumps({k: v for k, v in report.items() if k != "file_read_failures"}, indent=2))
    print(f"\nDone. {len(index_rows)} matches written to {out_dir/'data'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
