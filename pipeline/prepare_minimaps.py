"""Downscale the shipped minimap images to 1024x1024 web assets.

The dataset README says the minimaps are 1024x1024, but the actual files are
2160x2158 (GrandRift), 4320x4320 (AmbroseValley) and 9000x9000 (Lockdown, a
~multi-MB JPG). We normalise all three to 1024x1024 so canvas-space pixel
coordinates from the pipeline map 1:1 onto the displayed image.

GrandRift is 2 pixels off square; resizing to 1024x1024 introduces a ~0.1%
vertical stretch, far below marker size — accepted.

Usage:
    python pipeline/prepare_minimaps.py --raw /path/to/player_data --out public
"""

import argparse
from pathlib import Path

from PIL import Image

from config import CANVAS

SOURCES = {
    "AmbroseValley": "AmbroseValley_Minimap.png",
    "GrandRift": "GrandRift_Minimap.png",
    "Lockdown": "Lockdown_Minimap.jpg",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", default="public")
    args = ap.parse_args()

    src_dir = Path(args.raw) / "minimaps"
    out_dir = Path(args.out) / "minimaps"
    out_dir.mkdir(parents=True, exist_ok=True)

    for map_id, fname in SOURCES.items():
        im = Image.open(src_dir / fname).convert("RGB")
        im = im.resize((CANVAS, CANVAS), Image.LANCZOS)
        out = out_dir / f"{map_id}.jpg"
        im.save(out, quality=85, optimize=True)
        print(f"{map_id}: {fname} -> {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
