"""Shared configuration for the LILA BLACK data pipeline.

Coordinate system (from the dataset README):
    u = (x - origin_x) / scale          # 0..1 across the map, left -> right
    v = (z - origin_z) / scale          # 0..1 across the map, bottom -> top
    px = u * CANVAS                     # pixel X in minimap space
    py = (1 - v) * CANVAS               # pixel Y (image origin is top-left)

We normalise everything into a fixed 1024x1024 "canvas space" regardless of
the source minimap resolution (the shipped images are 2160/4320/9000 px and
get downscaled to 1024 for the web build).
"""

CANVAS = 1024  # logical minimap resolution used everywhere downstream

MAPS = {
    "AmbroseValley": {"scale": 900.0,  "origin_x": -370.0, "origin_z": -473.0},
    "GrandRift":     {"scale": 581.0,  "origin_x": -290.0, "origin_z": -290.0},
    "Lockdown":      {"scale": 1000.0, "origin_x": -500.0, "origin_z": -500.0},
}

# Raw event -> (category, actor-perspective meaning)
# Categories drive marker styling + heatmap layers in the frontend.
EVENT_CATEGORY = {
    "Position":      "move",
    "BotPosition":   "move",
    "Kill":          "kill",        # human killed a human
    "BotKill":       "kill",        # human killed a bot
    "Killed":        "death",       # human killed by human
    "BotKilled":     "death",       # human killed by bot
    "KilledByStorm": "storm",
    "Loot":          "loot",
}

DAY_FOLDERS = [
    "February_10",
    "February_11",
    "February_12",
    "February_13",
    "February_14",
]

HEATMAP_GRID = 64  # 64x64 bins over the 1024px canvas (16px per bin)


def world_to_canvas(x: float, z: float, map_id: str) -> tuple[float, float]:
    """Project world (x, z) into 1024x1024 minimap pixel space."""
    m = MAPS[map_id]
    u = (x - m["origin_x"]) / m["scale"]
    v = (z - m["origin_z"]) / m["scale"]
    return u * CANVAS, (1.0 - v) * CANVAS


def is_bot(user_id: str) -> bool:
    """Bots have short numeric ids; humans have UUIDs."""
    return user_id.isdigit()
