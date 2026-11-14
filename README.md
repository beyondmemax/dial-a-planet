# Dial-a-Planet 🌍🎵

**An accessible Earth Information Jukebox.** Turn a knob to travel through time, move a joystick across the planet, and *hear* NASA Earth data: city lights, ocean temperature, forest height.

Built for the **2026 NASA Space Apps Challenge** ([The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)) at **Space Apps NYC** (NYU Tandon, Brooklyn).

Designed as a walk-up kiosk prototype for NASA's Earth Information Center, usable by blind and low-vision visitors through sound, speech, and physical controls they can tell apart by touch.

## How it works

```
[Knob + Joystick + 2 Buttons]  →  Raspberry Pi Pico 2 W  →  USB serial  →  Chrome web app  →  speaker
        (Grove parts)              (pico/main.py)                         (web/)
```

- The **Pico** reads the controls and sends simple text lines (`J,x,y`, `K,value`, `B,id`).
- The **web app** (Chrome/Edge, Web Serial API) shows NASA's yearly maps, figures out which country/ocean/city is under the cursor, speaks it, measures the real light level there, and turns it into music (Tone.js).

## Controls

| Control | Dataset menu | Inside a dataset |
|---|---|---|
| **Knob** | Scroll through datasets | Scrub through years |
| **Button A** | Select dataset | n/a |
| **Button B** | Repeat choice | Back to menu |
| **Joystick** | n/a | Move over the map: hear the country/region name |
| **Joystick click** | n/a | 1st: details about that spot · 2nd: play music · 3rd: back to names |

Full details: [`docs/controls.md`](docs/controls.md)

## Hardware

| Part | Signal (yellow) | 2nd signal (white) | Power (red) | Ground (black) |
|---|---|---|---|---|
| Grove rotary knob | GP28 | not used | 3V3 rail | GND rail |
| Grove thumb joystick | GP26 (X) | GP27 (Y) | 3V3 rail | GND rail |
| Grove button A (select) | GP10 | not used | 3V3 rail | GND rail |
| Grove button B (back) | GP14 | not used | 3V3 rail | GND rail |
| Grove LCD (optional, later) | GP5 (SCL) | GP4 (SDA) | 3V3 rail | GND rail |

Pico power: **3V3(OUT) → + rail, GND → − rail**, and bridge the left and right rails. ⚠️ Power everything from 3.3V, never 5V (the analog pins max out at 3.3V).

## Setup

**1. Pico**
1. Install [Thonny](https://thonny.org) and flash MicroPython for **Pico 2 W** (Tools → Options → Interpreter → Install MicroPython)
2. Open `pico/main.py` and save it **to the Pico** as `main.py`, so it runs on boot
3. Test: in Thonny's Shell you should see `READY`, then `J,…` / `K,…` lines, and `B,1` / `B,2` / `B,9` on presses
4. **Close Thonny** before using the web app. Only one program can use the Pico's USB port.

**2. NASA data** (Night Lights: 12 yearly maps + a change map, about 15 MB, not stored in git)
```bash
bash scripts/download_data.sh
```

**3. Run it**
```bash
python3 -m http.server 8000      # from the repo folder; leave it running
```
1. Open **http://localhost:8000/web/** in **Chrome or Edge** (Safari/Firefox have no Web Serial)
2. Click **Connect controller** and pick the Pico (Board CDC). This click also turns sound on.
3. Turn the knob to Night Lights, press **A**

No controller? Use the keyboard: arrows = joystick, `,` `.` = knob, Enter = A, Esc = B, Space = joystick click.

## Repo layout

```
pico/main.py          Pico controller script (MicroPython)
web/                  Chrome web app (index.html, app.js, style.css)
web/geo/              Country, city and ocean outlines (Natural Earth, public domain)
web/vendor/Tone.js    Audio library (MIT license), bundled so it works offline
scripts/              Data download script
data/                 NASA videos go here (git-ignored)
docs/controls.md      What every control does
docs/team-context.md  Full project context, for teammates and their AI assistants
```

## Data credits

Place names and outlines: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

Visualizations by NASA's Scientific Visualization Studio:
- [Change in Night Lights between 2012 and 2023, equirectangular SOS version](https://svs.gsfc.nasa.gov/5475/) (what the app uses) / [EIC version](https://svs.gsfc.nasa.gov/5313/)
- [Global Sea Surface Currents and Temperature](https://svs.gsfc.nasa.gov/3912/)
- [GEDI Forest Height](https://svs.gsfc.nasa.gov/4950/)
