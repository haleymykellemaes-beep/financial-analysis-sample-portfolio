"""Build a reproducible simulated market file for the static site.

Run from the repository root:

    python3 python/generate_market.py

GitHub Pages can serve data/market.json without a Python server.
The series are invented. They are not prices or a forecast of a real market.
"""

import json
from pathlib import Path


def rng(seed):
    state = seed & 0xFFFFFFFF

    def next_unit():
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state / 4294967296

    return next_unit


def path(seed, count, total_return, vol, start=100.0):
    """Trend plus mean-reverting noise. total_return is the intended end move, such as 0.06."""
    unit = rng(seed)
    noise = 0.0
    values = []
    for index in range(count):
        progress = index / (count - 1)
        trend = start * ((1 + total_return) ** progress)
        shock = (unit() - 0.5) * 2 * vol
        noise = noise * 0.86 + shock
        values.append(round(max(1.0, trend * (1 + noise)), 4))
    return values


def candles(values, span=4):
    bars = []
    for index in range(0, len(values) - span + 1, span):
        window = values[index:index + span]
        bars.append({
            "o": window[0],
            "h": max(window),
            "l": min(window),
            "c": window[-1],
        })
    return bars


def change(values):
    if not values or values[0] == 0:
        return 0.0
    return round((values[-1] / values[0] - 1) * 100, 2)


def main():
    count = 240
    base = path(4102, count, 0.045, 0.012)
    upside = path(9021, count, 0.14, 0.01)
    downside = path(2288, count, -0.11, 0.014)
    payload = {
        "notice": "Simulated sample. Not live or historical market data.",
        "tapes": [
            {"id": "primary", "speed": 0.22, "values": path(1204, count, 0.06, 0.011)},
            {"id": "upper", "speed": 0.16, "values": path(3371, count, 0.03, 0.008)},
            {"id": "lower", "speed": 0.28, "values": path(7740, count, -0.04, 0.013)},
            {"id": "deep", "speed": 0.12, "values": path(5519, count, 0.02, 0.007)},
        ],
        "candles": candles(base, 5),
        "signal": path(6642, 80, 0.05, 0.012),
        "scenarios": {
            "base": {"label": "Base", "change": change(base), "values": base},
            "upside": {"label": "Upside", "change": change(upside), "values": upside},
            "downside": {"label": "Downside", "change": change(downside), "values": downside},
        },
    }
    target = Path(__file__).resolve().parents[1] / "data" / "market.json"
    target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
