import hashlib
import hmac
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# override=True: .env is mounted and may hold a newer DEVICE_IP than the container env
load_dotenv(override=True)

import tray  # noqa: E402
from feeder import Feeder, decode_meal_plan  # noqa: E402  (needs env loaded)

APP_PASSWORD = os.environ["APP_PASSWORD"]
SESSION_SECRET = os.environ["SESSION_SECRET"].encode()
SESSION_DAYS = 30
# Set COOKIE_SECURE=0 only if you open the app over plain http on your LAN
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1") != "0"
COOKIE = "feeder_session"

app = FastAPI(docs_url=None, redoc_url=None)
feeder = Feeder()
_failed_logins = []


def _sign(expires):
    return hmac.new(SESSION_SECRET, str(expires).encode(), hashlib.sha256).hexdigest()


def require_login(request: Request):
    token = request.cookies.get(COOKIE, "")
    expires, _, sig = token.partition(".")
    if not (expires.isdigit() and int(expires) > time.time()
            and hmac.compare_digest(sig, _sign(expires))):
        raise HTTPException(401, "Not logged in")


class Login(BaseModel):
    password: str


class Feed(BaseModel):
    portions: int = Field(ge=1, le=12)


class TrayUpdate(BaseModel):
    open: int | None = Field(None, ge=1, le=tray.COMPARTMENTS)
    filled: list[bool] | None = Field(None, min_length=tray.COMPARTMENTS, max_length=tray.COMPARTMENTS)


class TrayGoto(BaseModel):
    compartment: int = Field(ge=1, le=tray.COMPARTMENTS)


class Meal(BaseModel):
    days: list[str]
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    portions: int = Field(ge=1, le=12)
    enabled: bool = True


class Meals(BaseModel):
    meals: list[Meal] = Field(max_length=6)


def _device_call(fn, *args):
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(503, f"Feeder unreachable: {e}")


@app.post("/api/login")
def login(body: Login, response: Response):
    now = time.time()
    _failed_logins[:] = [t for t in _failed_logins if now - t < 300]
    if len(_failed_logins) >= 10:
        raise HTTPException(429, "Too many attempts, try again in a few minutes")
    if not hmac.compare_digest(body.password.encode(), APP_PASSWORD.encode()):
        _failed_logins.append(now)
        raise HTTPException(401, "Wrong password")
    expires = int(now + SESSION_DAYS * 86400)
    response.set_cookie(COOKIE, f"{expires}.{_sign(expires)}", max_age=SESSION_DAYS * 86400,
                        httponly=True, secure=COOKIE_SECURE, samesite="strict")
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@app.get("/api/status", dependencies=[Depends(require_login)])
def status():
    s = _device_call(feeder.status)
    s["tray"] = tray.sync(s["meals"])
    return s


def _sync_tray():
    # Count scheduled feeds up to now before recording a new one, so they stay in order
    tray.sync(decode_meal_plan(feeder._last_dps.get(feeder.dp["meal_plan"])))


@app.post("/api/feed", dependencies=[Depends(require_login)])
def feed(body: Feed):
    if feeder.job and feeder.job["running"]:
        raise HTTPException(409, "The tray is turning, wait for it to finish")
    _sync_tray()
    _device_call(feeder.feed, body.portions)
    if feeder.feed_trigger:
        tray.fed(1)
    return {"ok": True}


@app.put("/api/tray", dependencies=[Depends(require_login)])
def set_tray(body: TrayUpdate):
    return tray.update(body.open, body.filled)


@app.post("/api/tray/goto", dependencies=[Depends(require_login)])
def goto(body: TrayGoto):
    _sync_tray()
    steps = tray.steps_to(body.compartment)
    if steps:
        _device_call(feeder.turn, steps, tray.turned)
    return {"steps": steps}


@app.put("/api/meals", dependencies=[Depends(require_login)])
def set_meals(body: Meals):
    _device_call(feeder.set_meals, [m.model_dump() for m in body.meals])
    return {"ok": True}


@app.get("/healthz")
def healthz():
    return {"ok": True}


STATIC = Path(__file__).parent / "static"
if (STATIC / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")
