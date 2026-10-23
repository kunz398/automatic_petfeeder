"""Tracks the rotating tray: which compartment is at the opening and which ones hold food.

The Genio doesn't report its tray position, so the app keeps it: every feed turns the tray one
compartment. Feeds sent from this app are recorded as they happen; scheduled feeds are worked
out from the meal plan and the clock. Feeds from Smart Life or the feeder's own buttons aren't
seen, so the user can correct the position from the UI.
"""

import json
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

COMPARTMENTS = 6
STATE_FILE = Path(os.environ.get("STATE_DIR", Path(__file__).parent / "data")) / "tray.json"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_lock = threading.Lock()


def _load():
    try:
        s = json.loads(STATE_FILE.read_text())
        if "filled" in s:
            return s
    except (OSError, ValueError):
        pass
    # Unknown: assume compartment 1 at the opening and everything full
    return {"open": 1, "filled": [True] * COMPARTMENTS, "since": time.time()}


def _save(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(STATE_FILE)


def _scheduled_between(meals, since, now):
    """Number of scheduled feeds that fired in (since, now], in the server's local time."""
    count = 0
    start = datetime.fromtimestamp(since)
    end = datetime.fromtimestamp(now)
    day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    while day <= end:
        weekday = DAYS[day.weekday()]
        for m in meals:
            if m["enabled"] and weekday in m["days"]:
                if start < day.replace(hour=m["hour"], minute=m["minute"]) <= end:
                    count += 1
        day += timedelta(days=1)
    return count


def _step(s, ate):
    # The compartment leaving the opening has been served, so it's empty now
    if ate:
        s["filled"][s["open"] - 1] = False
    s["open"] = s["open"] % COMPARTMENTS + 1


def _view(s):
    return {"open": s["open"], "filled": s["filled"], "compartments": COMPARTMENTS,
            "full": sum(s["filled"])}


def sync(meals):
    """Apply scheduled feeds that happened since we last looked, and return the tray."""
    with _lock:
        s = _load()
        now = time.time()
        fired = _scheduled_between(meals, s["since"], now)
        for _ in range(fired):
            _step(s, ate=True)
        s["since"] = now
        _save(s)
        return _view(s)


def fed(n=1):
    """n feeds sent from this app: the tray turned n compartments."""
    with _lock:
        s = _load()
        for _ in range(n):
            _step(s, ate=True)
        _save(s)


def turned():
    """The tray was turned one compartment to reach a chosen one (nothing was eaten)."""
    with _lock:
        s = _load()
        _step(s, ate=False)
        _save(s)


def update(open_compartment=None, filled=None):
    with _lock:
        s = _load()
        if open_compartment is not None:
            s["open"] = open_compartment
        if filled is not None:
            s["filled"] = list(filled)
        _save(s)
        return _view(s)


def steps_to(target):
    with _lock:
        current = _load()["open"]
    return (target - current) % COMPARTMENTS
