"""Local (LAN) control of a Tuya-based feeder such as the Mirabella Genio 6 meal feeder."""

import base64
import logging
import os
import re
import threading
import time
from pathlib import Path

import tinytuya

log = logging.getLogger("uvicorn.error")
# .env is mounted into the container so a rediscovered IP survives restarts
ENV_FILE = Path(os.environ.get("ENV_FILE", Path(__file__).parent / ".env"))
RESCAN_COOLDOWN = 60


def _save_env(key, value):
    try:
        text = ENV_FILE.read_text()
        text, n = re.subn(rf"^{key}=.*$", f"{key}={value}", text, flags=re.M)
        if not n:
            text += f"\n{key}={value}\n"
        # Write in place (not via rename) so the single-file bind mount keeps working
        with open(ENV_FILE, "r+") as f:
            f.seek(0)
            f.write(text)
            f.truncate()
    except OSError as e:
        log.warning("Couldn't save %s to %s: %s", key, ENV_FILE, e)

# Tuya feeders store the schedule as base64 of 5-byte records:
#   [day bitmask, hour, minute, portions, enabled]
# Day bitmask: bit 0 = Monday ... bit 6 = Sunday (0x7F = every day).
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
# The Genio stores exactly 5 slots; unused ones hold this disabled placeholder.
MAX_MEALS = int(os.environ.get("MEAL_SLOTS", 5))
EMPTY_SLOT = bytes([0x7F, 0, 0, 1, 0])


def decode_meal_plan(value):
    if not value:
        return []
    raw = base64.b64decode(value)
    meals = []
    for i in range(0, len(raw) - len(raw) % 5, 5):
        if raw[i:i + 5] in (EMPTY_SLOT, bytes(5)):
            continue
        mask, hour, minute, portions, enabled = raw[i:i + 5]
        meals.append({
            "days": [d for bit, d in enumerate(DAYS) if mask & (1 << bit)],
            "hour": hour,
            "minute": minute,
            "portions": portions,
            "enabled": bool(enabled),
        })
    return meals


def encode_meal_plan(meals):
    if len(meals) > MAX_MEALS:
        raise ValueError(f"at most {MAX_MEALS} meals")
    raw = bytearray()
    for m in meals:
        mask = sum(1 << DAYS.index(d) for d in m["days"])
        hour, minute, portions = int(m["hour"]), int(m["minute"]), int(m["portions"])
        if not (0 <= hour < 24 and 0 <= minute < 60 and 1 <= portions <= 12 and mask):
            raise ValueError(f"invalid meal: {m}")
        raw += bytes([mask, hour, minute, portions, 1 if m["enabled"] else 0])
    raw += EMPTY_SLOT * (MAX_MEALS - len(meals))
    return base64.b64encode(bytes(raw)).decode()


def _decode_feed_report(value):
    # Genio reports source * 10 + portions: 11 = scheduled feed of 1, 21 = manual feed of 1
    if not isinstance(value, int) or value <= 0:
        return {"last_feed_portions": None, "last_feed_source": None}
    return {
        "last_feed_portions": value % 10,
        "last_feed_source": {1: "scheduled", 2: "manual"}.get(value // 10),
    }


class Feeder:
    def __init__(self):
        self.dp = {
            name: str(os.environ.get(f"DP_{name.upper()}", default))
            for name, default in [("meal_plan", 1), ("manual_feed", 3), ("feed_state", 4),
                                  ("fault", 14), ("feed_report", 15)]
        }
        # "portions": manual feed DP takes a portion count. "trigger": it's a boolean that turns
        # the tray one compartment per press (Genio).
        self.feed_trigger = os.environ.get("MANUAL_FEED_MODE", "portions") == "trigger"
        # Time for the tray to finish turning before the next press (it takes ~15s)
        self.turn_time = float(os.environ.get("TRAY_TURN_SECONDS", 20))
        self.job = None  # background tray turn: {"target", "total", "done", "running", "error"}
        self._last_dps = {}
        self.device_id = os.environ["DEVICE_ID"]
        self._last_scan = 0.0
        self._connect(os.environ["DEVICE_IP"])
        # The feeder only accepts a few connections at once; serialise our access.
        self.lock = threading.Lock()

    def _connect(self, ip):
        self.ip = ip
        self.device = tinytuya.Device(
            self.device_id,
            ip,
            os.environ["LOCAL_KEY"],
            version=float(os.environ.get("TUYA_VERSION", "3.3")),
        )
        self.device.set_socketTimeout(5)
        self.device.set_socketRetryLimit(1)

    def _rediscover(self):
        """Look for the feeder's LAN broadcast; if it has a new IP, switch to it and save it.

        Needs host networking (broadcasts don't reach a bridged container). Takes up to ~18s,
        so it runs at most once a minute.
        """
        if time.time() - self._last_scan < RESCAN_COOLDOWN:
            return False
        self._last_scan = time.time()
        log.warning("Feeder not answering at %s, scanning the LAN for it...", self.ip)
        ip = tinytuya.find_device(dev_id=self.device_id).get("ip")
        if not ip:
            log.warning("Feeder not found on the LAN (is it powered and on Wi-Fi?)")
            return False
        if ip == self.ip:
            return False
        log.warning("Feeder moved from %s to %s; switching and saving to %s", self.ip, ip, ENV_FILE)
        self._connect(ip)
        _save_env("DEVICE_IP", ip)
        return True

    def _with_rediscovery(self, fn):
        try:
            return fn()
        except OSError:
            if not self._rediscover():
                raise
            return fn()

    def _check(self, result):
        if not result or "Error" in result:
            raise ConnectionError((result or {}).get("Error", "No response from feeder"))
        return result

    def raw_status(self):
        # While the tray is turning the lock is held for a while; report the last known state
        if not self.lock.acquire(timeout=1):
            if self._last_dps:
                return self._last_dps
            self.lock.acquire()
        try:
            self._last_dps = self._with_rediscovery(self._read_dps)
            return self._last_dps
        finally:
            self.lock.release()

    def _read_dps(self):
        dps = dict(self._check(self.device.status()).get("dps", {}))
        # Some feeders leave the (raw) meal plan out of status; ask for it explicitly.
        if self.dp["meal_plan"] not in dps:
            plan = self.device.updatedps([int(self.dp["meal_plan"])])
            dps.update((plan or {}).get("dps", {}))
        return dps

    def status(self):
        dps = self.raw_status()
        return {
            "online": True,
            "meals": decode_meal_plan(dps.get(self.dp["meal_plan"])),
            "feed_state": dps.get(self.dp["feed_state"]),
            "fault": dps.get(self.dp["fault"]),
            **_decode_feed_report(dps.get(self.dp["feed_report"])),
            "feed_mode": "trigger" if self.feed_trigger else "portions",
            "job": self.job,
            "dps": dps,
        }

    def _press(self):
        """Press quick feed; the feeder acknowledges straight away and then turns the tray."""
        self._check(self.device.set_value(self.dp["manual_feed"], True))

    def _wait_for_turn(self):
        """Give the tray time to turn. The feed report only arrives when its value changes
        (e.g. scheduled -> manual), so it can end the wait early but can't be relied on."""
        d = self.device
        d.set_socketPersistent(True)
        try:
            end = time.time() + self.turn_time
            while time.time() < end:
                msg = d.receive()
                if isinstance(msg, dict) and self.dp["feed_report"] in (msg.get("dps") or {}):
                    return
        finally:
            d.set_socketPersistent(False)
            d.close()

    def feed(self, portions=1):
        if not 1 <= portions <= 12:
            raise ValueError("portions must be 1-12")
        with self.lock:
            if not self.feed_trigger:
                self._with_rediscovery(lambda: self._check(self.device.set_value(self.dp["manual_feed"], portions)))
                return portions
            # One press = the next compartment; more presses would only rotate past full ones
            self._with_rediscovery(self._press)
            self._wait_for_turn()
            return 1

    def turn(self, steps, on_step):
        """Turn the tray `steps` compartments in the background, calling on_step after each."""
        if self.job and self.job["running"]:
            raise ValueError("The tray is already turning")
        self.job = {"total": steps, "done": 0, "running": True, "error": None}
        threading.Thread(target=self._run_turn, args=(steps, on_step), daemon=True).start()

    def _run_turn(self, steps, on_step):
        job = self.job
        try:
            for _ in range(steps):
                with self.lock:
                    self._with_rediscovery(self._press)
                    on_step()
                    job["done"] += 1
                    self._wait_for_turn()
        except Exception as e:
            log.warning("Tray turn stopped: %s", e)
            job["error"] = str(e)
        finally:
            job["running"] = False

    def set_meals(self, meals):
        value = encode_meal_plan(meals)
        with self.lock:
            self._with_rediscovery(lambda: self._check(self.device.set_value(self.dp["meal_plan"], value)))
