# Pet Feeder web app

Controls a Mirabella Genio smart 6 meal feeder (a Tuya device) **locally over Wi-Fi** using
[tinytuya](https://github.com/jasonacox/tinytuya). Runs in Docker on `127.0.0.1:8090`, exposed via
Cloudflare Tunnel.

## 1. Get the feeder's local key (one-time)

The feeder encrypts LAN traffic with a "local key" that only Tuya's cloud knows, so you need a free
Tuya developer account once to fetch it. After that, nothing talks to the cloud.

1. Sign up at https://iot.tuya.com, then **Cloud → Development → Create Cloud Project**
   (industry: Smart Home, development method: Smart Home, data center: the one for your region,
   e.g. *Western America* or *Central Europe*. For Australia it's usually **Western America**).
2. In the project: **Devices → Link App Account → Add App Account** and scan the QR code from the
   app (*Me → scan icon* in the top corner).
   - If the Genio app can't scan it, install the **Smart Life** app, log in with the same
     approach, and re-add the feeder there instead. It works the same way.
3. Note the project's **Access ID** and **Access Secret**, plus the feeder's **Device ID**.
4. Turn the feeder on, then run the wizard (it writes `devices.json` here):

   ```bash
   docker compose build
   docker run -it --rm --network host --user "$(id -u)" -v "$PWD":/work -w /work petfeeder-petfeeder python -m tinytuya wizard
   ```

   Answer **Y** to "Poll local devices?" and it will show the feeder's IP, local key and
   protocol version.

5. Give the feeder a fixed IP (a DHCP reservation in your router) so it doesn't move.

> Re-pairing the feeder in the app changes its local key. Run the wizard again if that happens.

## 2. Configure

Edit `.env` (already created, with a random `SESSION_SECRET`):

```
DEVICE_ID=...
DEVICE_IP=192.168.x.x
LOCAL_KEY=...
TUYA_VERSION=3.3        # use the version the wizard reported (3.3 / 3.4 / 3.5)
APP_PASSWORD=...        # the password for the web app
```

Then check what data points (DPs) the feeder exposes:

```bash
docker compose run --rm petfeeder python scan.py
```

The Genio 6 meal feeder (protocol 3.5) uses `1` = meal plan (5 slots), `2` = quick feed (a boolean:
one portion per press, so set `MANUAL_FEED_MODE=trigger`) and `14` = feed report. It has no feed-state
or fault DP, so leave those blank. Other feeders may differ; change the `DP_*` lines in `.env`. Tip: change something in the app, rerun `scan.py`, and see which DP changed.

## 3. Run

```bash
docker compose up -d --build
```

The app is on **http://localhost:8090**. In the Cloudflare Zero Trust dashboard, add a public
hostname to your tunnel with service **`http://localhost:8090`**.

Optional extra security: put a Cloudflare Access policy (email OTP) on the hostname too.

## Notes

- **If the feeder's IP changes**, the app finds it automatically: when the feeder stops answering
  it listens for the feeder's LAN broadcast (up to ~18s, at most once a minute), switches to the
  new IP and writes it to `DEVICE_IP` in `.env`. This is why the container uses host networking.
  A DHCP reservation for the feeder (MAC in `devices.json`) avoids the delay altogether.

- The feeder accepts only a few connections at once. If the web app says "unreachable"
  while the phone app is open, close the phone app and refresh.
- Login sessions last 30 days. Cookies are `Secure`, so log in through the tunnel URL (https) or
  `http://localhost:8090`. Set `COOKIE_SECURE=0` if you want plain http on another LAN address.
- Updating: `docker compose up -d --build`. Logs: `docker compose logs -f`.
