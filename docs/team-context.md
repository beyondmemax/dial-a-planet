# Team context: Earth Information Jukebox ("Dial-a-Planet")
NASA Space Apps Challenge 2026 · Space Apps NYC (Brooklyn)

> **For the AI reading this:** This is the shared context for a hackathon team. Treat it as the source of truth for decisions made so far. Help the teammate with their part (hardware, code, data, or pitch) and stay consistent with the interfaces defined in sections 6 and 7. If you suggest changing an interface, call it out clearly, since other teammates depend on it.

**Repo:** https://github.com/beyondmemax/dial-a-planet (this file lives at `docs/team-context.md`)

Last updated: Saturday, Nov 14, 2026, ~2:30pm (hackathon day 1). Status: **All hardware wired and tested (LCD postponed). Pico script done. Final control scheme decided. Web app next.**

---

## 1. The event

- **Event:** Space Apps NYC, the NYC local event of the 2026 NASA Space Apps Challenge
- **Venue:** CUSP at NYU Tandon, 370 Jay St, Brooklyn, NY 11201 (also online)
- **Dates:** Welcome Fri Nov 13 evening; hacking Sat Nov 14 to Sun Nov 15; final presentations to local judges. Top NYC projects get nominated for global judging.
- **On-site rule:** 18+ only at NYU Tandon (16 to 17 can join remotely)
- **MLH Hardware Lab:** yes, this event has one (see section 5)

## 2. The challenge we picked

**"The Earth Information Jukebox"** (Intermediate / Beginner-Youth; Arts & Multimedia, Earth Science, Software)
https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/

**Summary:** NASA's Earth Information Center (EIC) makes great visualizations of Earth, but they're visual-only. Build an "Earth Jukebox" (an interface, script, or app) that pairs EIC visual frames with **sonifications generated in real time** (turning data into sound).

**What NASA explicitly asks for or encourages:**
- Users can select or experience an EIC visualization alongside its soundscape
- Methods are open: computer vision on color, brightness, shapes, or pixel density mapped to pitch, tempo, volume, or instruments; ML; synth frameworks; artistic rulesets
- **Balance data accuracy with musicality.** Raw pixel-to-sound becomes noise, so use scales and harmonies.
- **Accessibility is a core theme:** blind and low-vision users, screen reader support, **tactile feedback**, descriptive text
- Deliverable can be a web app, desktop app, API, or a curated playlist of generated audio
- Document the "why" behind the artistic choices; consider the emotional impact (climate urgency, the planet's beauty)

## 3. Our concept: Dial-a-Planet

**Control scheme (FINAL, decided Saturday ~2:25pm by Max; replaces the earlier Listen/Explore modes).** Full spec in `docs/controls.md`.

| Control | Dataset menu | Inside a dataset |
|---|---|---|
| **Knob** | Scroll through the 3 datasets | Scrub through **years/time** |
| **Button A** (GP10) | **Select** dataset | n/a |
| **Button B** (GP14) | Repeat choice out loud | **Back** to the dataset menu |
| **Joystick move** | n/a | Move the cursor over the map |
| **Joystick click** | n/a | Cycle 3 layers (below) |

Inside a dataset, the joystick click cycles:
1. **Area (default):** as you move, it says/shows **where you are** (country, ocean, region, nearest big city). Short dataset facts are displayed.
2. **Details (1st click):** **specific data about the spot** under the cursor for this dataset and year.
3. **Music (2nd click):** **plays the sonification** for that dataset at the cursor (e.g. busy "city noise" for night lights).
4. 3rd click: back to Area.

**Test with one dataset first (Night Lights)**, then add the others.

The Pico only sends raw readings. **The web app owns all screen/state logic** (and can tell the Pico what to show on the LCD later).

**Needed for this:** an offline way to turn cursor position into a place name. Plan: the Natural Earth world-countries GeoJSON plus a small major-cities list, point-in-polygon in the browser, with a per-dataset calibration of where the map sits inside each video frame.

**Pitch framing:** this is a **kiosk prototype for NASA's Earth Information Center** (a physical public exhibit), not a personal gadget. The web app also works fully on its own with a keyboard and screen reader; the box is for public spaces.

## 4. The NASA data (from the challenge Resources tab)

All are from NASA's Scientific Visualization Studio (SVS). **Each has a JSON API at `https://svs.gsfc.nasa.gov/api/<ID>`** listing its images, MP4s, and frame folders. The data is easy to get.

| SVS ID | Dataset | What's available | Sound idea |
|---|---|---|---|
| 5313 | Change in Night Lights 2012–2023 (EIC) | Frames folder, 4K MP4, images | **Easiest start.** Brightness → volume/tempo, more cities → more sparkle |
| 3912 | Global Sea Surface Currents & Temperature | Frame folders 2048×1024 up to 6840×3420, with or without colorbar | Temperature → pitch; slow evolving pads |
| 4950 | GEDI Forest Height | Frame folders 3840×2160, with colorbar | Read the colorbar to recover real tree height → pitch (marimba) |
| 5011 | Lightning from the ISS 2017–2023 | MP4 only (no frame folders) | Flashes → percussion hits |
| 5669 | GEOS Aerosols (2025) | Single high-res PNGs only (up to 7680×4320) | Each particle type → its own instrument |
| 5533 | Air Quality Model Runs | Frames 5760×3240, MP4s | Color palette → sound profile |
| 5425 | Perpetual Ocean 2: Western Boundary Currents | Frames incl. a temperature-only set, MP4s | Motion → rhythm |
| 5196 | DYAMOND Global CO2 | Frames, MP4s | CO2 patterns over time |
| 4960 | 3D Atmospheric River | Frames, MP4s | Moisture density → shifting soundscape |
| 13786 | Data Sonification: Caldwell 73 | MP4 | **Inspiration only:** NASA's own sonification example |

Gallery of all EIC visuals: https://svs.gsfc.nasa.gov/gallery/earth-information-center/

**Our pick: 3 datasets max:** Night Lights (5313), Sea Surface Temperature (3912), and GEDI Forest Height (4950). Each gives a different sound personality.

## 5. Hardware (MLH Hardware Lab, Space Apps NYC)

Full catalog: https://www.mlh.com/resources/hardware?event=nasa-s-space-apps-challenge-nyc
Bring a **government-issued ID** to borrow gear (student ID likely not accepted).

**Grab these:**
- Raspberry Pi Pico (we got a **Pico 2 W**, RP2350). It's a **microcontroller, not a full computer**. The laptop does all the audio and data work.
- Grove Thumb Joystick (map cursor)
- Grove Rotary Angle Sensor (time knob)
- 2 Grove Buttons (Select, Back)
- Grove LCD Screen (shows dataset, year, layer)
- **Grove-to-male-jumper cables** (regular Grove cables won't plug into a breadboard), breadboard, M/M jumper wires
- JBL Go 3 Bluetooth speaker

**Nice to have:** Grove Touch Sensor (big accessible "play" pad), Grove LED Socket Kit (light synced to the beat), Grove NFC/RFID board (tap a card to pick a dataset).

**Skip:** motors, moisture, UV, ultrasonic. None of them help this project.

Also download the **Arduino IDE** or **Thonny** (for MicroPython on the Pico).

## 6. System architecture

```
[Joystick + Knob + Buttons + LCD]   (Grove parts on a breadboard)
              │
       Raspberry Pi Pico (MicroPython, ~30 reads/sec)
              │  USB serial
              ▼
   Laptop → Chrome web app
     ├─ Web Serial API (reads the Pico directly from the browser)
     ├─ Canvas (draws the frame + cursor)
     ├─ Tone.js (synthesizes the sound)
     └─ Screen-reader announcements (ARIA live region: "Pacific, warm, 2019")
              │  Bluetooth
        JBL Go 3 speaker
```

**Why a web app instead of Python audio:** Chrome reads the Pico directly (Web Serial), Tone.js makes good sound in a few lines, screen readers work out of the box, and judges can open it. **Web Serial works only in Chrome or Edge.**

**Two interfaces everyone must agree on** (this lets the team work in parallel):

### Interface A: Pico → laptop serial messages (one per line, ~30/sec)
```
J,<x>,<y>     joystick, each 0–1023 (512 ≈ center)
K,<value>     knob, 0–1023
B,<id>        button pressed: 1 = Select, 2 = Back, 9 = joystick click (cycles Area → Details → Music)
```
Example stream: `J,512,300` `K,780` `B,1`
Note: on the Grove thumb joystick, **pressing the stick pushes X to max (1023)**. The Pico detects X ≥ 1000 and sends `B,9` instead of a J reading.
Laptop → Pico message for the LCD: `L,<line1>|<line2>` (16 characters per line max)

**Implemented in `main.py` on the Pico (Saturday ~1:50pm):**
- Sends `READY` once at startup
- Laptop can send `PING`; Pico replies `PONG` (connection check)
- J and K are sent **only when they change** (J by ≥4, K by ≥3) **plus a heartbeat every 500 ms**, so the app always has fresh values
- ~30 updates/sec; joystick click needs 2 reads in a row at X ≥ 1000, then sends `B,9` (no J lines while the stick is held in)
- Buttons send `B,1` / `B,2` once per press (30 ms debounce)
- LCD support is built in but **optional**: if no LCD is connected, `L` messages are ignored
- **Thonny and the web app can't both use the Pico's USB port at once.** Close Thonny (or disconnect it) before connecting from Chrome.

**Measured joystick calibration (our actual unit, raw 0–1023):**
- Center: X ≈ 510, Y ≈ 508 (jitter ±7, so use a dead zone of ~15)
- X range: ~253 (one side) to ~778 (other side)
- Y range: ~260 (down, toward you) to ~769 (up, away from you). **Up = higher Y.** Note that canvas Y grows downward, so the web app must invert Y when drawing.
- Click: X = 1023 exactly. Highest normal X seen was 778, so the ≥1000 threshold is safe.
- Knob: full 0–1023 sweep; idles with noise blips up to ~27 near 0, so smooth it (average several reads).

### Interface B (UPDATED Saturday ~2:15pm): local video files, not JSON

We checked NASA's frame folders: the ocean and forest frames are **TIFFs (6 MB and 66 MB each)**, which Chrome can't draw, and the night-lights frame folder returns **403 Forbidden**. So we switched to NASA's **small video files**. The web app plays each video in a hidden `<video>` element; **the knob sets `video.currentTime`**; each frame is drawn to a canvas and the app reads pixel colors from it. No preprocessing step needed.

Files go in `dial-a-planet/data/` and are served locally with `python3 -m http.server 8000` (same origin, so the canvas can read pixels):

| File | Source (NASA SVS) | Size | Notes |
|---|---|---|---|
| `ocean.webm` | https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/ecco2_sst_flow.webmhd.webm | ~16 MB | 960×540, global sea surface currents colored by temperature |
| `forest.webm` | https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.webm | ~6 MB | Global GEDI forest height. Brown/dark green = short, bright green/white = tall |
| `nightlights.mp4` | https://svs.gsfc.nasa.gov/vis/a000000/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4 | ~34 MB | H.265. Annual averages 2012–2023, then a change map (purple = more light, orange = less), then zooms. **Check it plays in Chrome**; if not, convert with ffmpeg. |

The JSON format below is **no longer used**; kept for reference only.

### (Old) Interface B: preprocessed dataset JSON
```json
{
  "id": "nightlights",
  "title": "Change in Night Lights 2012–2023",
  "svs_id": 5313,
  "width": 256,
  "height": 128,
  "frames": [
    { "label": "2012", "values": [/* width*height numbers, 0.0–1.0, row-major */] }
  ]
}
```
Values are normalized 0–1 (from the colorbar if possible, otherwise brightness).

## 7. Breadboard wiring (Pico straddles the center gap)

Wire colors are Grove standard: **yellow = signal, white = 2nd signal, red = power, black = ground.** Check the labels printed on each module.

| Part | Yellow | White | Red | Black |
|---|---|---|---|---|
| Rotary knob | GP28 | not used | + rail | − rail |
| Joystick | GP26, X | GP27, Y | + rail | − rail |
| LCD (I2C) | GP5, SCL | GP4, SDA | + rail | − rail |
| Button A = **Select** (Grove) | GP10 | not used | left + rail | left − rail |
| Button B = **Back** (Grove) | GP14 | not used | left + rail | left − rail |
| Pico power | 3V3 → + rail | GND → − rail | | |

**Critical:**
- The Pico has **only 3 analog inputs** (GP26, GP27, GP28), and we use all 3 (joystick X, joystick Y, knob). No room for another analog sensor.
- **Power everything from 3V3, NOT VBUS/5V.** The analog pins max out at 3.3V; 5V can damage the Pico.
- **Bridge the left and right power rails** (both + and −) across the bottom of the breadboard, or the left-side parts get no power.
- **Keep the LCD on 3.3V.** Moving it to 5V could put 5V on the I2C lines and damage the Pico. A dim backlight is acceptable.
- **Buttons are Grove buttons** (we tried plain tactile buttons and went back to Grove). Grove buttons read **1 when pressed, 0 when released**, and have their own pull-down resistor on the module.
- **Our board is a Pico 2 W (RP2350 chip).** Same pinout as the Pico. The RP2350 has a known quirk where the chip's *internal* pull-down can leave a pin stuck "high" after release, so set button pins as `Pin(n, Pin.IN)` with **no internal pull** and rely on the Grove module's own resistor.

## 8. Sound design

**Rule #1: lock all pitches to a pentatonic scale** so any combination of notes sounds pleasant.

**Music layer, whole-map feel (optional background):**
- Average value → base pitch/chord
- Share of "hot" or bright pixels → note density (sparse vs. busy)
- Change from the previous frame → swell or filter sweep (you *hear* change)
- Per dataset: Night Lights = twinkly plucks; Sea Temp = slow warm pads; Forest Height = woody marimba

**Music layer at the cursor (main):**
- Value under the cursor → pitch
- X position → stereo pan (west = left, east = right)
- Y position → tone brightness (north airier, south darker)
- Crossing a sharp edge (coastline, city boundary) → short click
- Cursor still for 2 seconds → screen reader announces area, value, and year

## 9. Team roles and weekend plan

**Roles:** Data person · Code (web app/audio) person · Hardware person · Story/pitch person

**Saturday morning**
- Data: download and preprocess the 3 datasets into Interface B JSON (~30–60 frames each, shrunk to 256×128)
- Code: web app with **keyboard controls first** (arrow keys = joystick, number keys = buttons) so nobody waits on hardware
- Hardware: borrow parts, wire per section 7, get the Pico printing joystick numbers over serial

**Saturday afternoon/night**
- Music layer working for Night Lights
- Hook up Web Serial so the Pico controls the app
- Area names + Details layer

**Sunday morning**
- Tune the sounds until they're pleasant
- Screen-reader announcements and LCD text
- Cardboard jukebox enclosure (a box makes a big difference at demo time)
- **Record a backup demo video** in case the hardware fails on stage

**Sunday afternoon:** pitch. Open with a blindfolded volunteer finding a city by ear.

## 10. Accessibility and tactile design

- Every control should **feel different**: stick, round twist knob, square buttons. Fixed layout: buttons on the left, joystick in the center, knob on the right.
- **Tactile labels** on buttons (raised dots/textures: 1 dot = Night Lights, 2 = Ocean, 3 = Forests). Hot glue or foam stickers work; braille if possible, though many blind people don't read braille, so shape and sound matter more.
- **The box explains itself out loud:** touching a control announces it ("Knob: turns time. Currently 2019"). A help button walks through the layout in about 20 seconds.
- **Audio feedback for every action:** a unique chime per button, ticks as the knob turns.
- **Keep the keyboard controls** in the final build as a fallback and so the web app works on its own.
- If at all possible, **test with a blind or low-vision person** (even over a video call).

## 11. Expected judge questions and our answers

**"Couldn't a laptop with accessibility features do all this?"**
- Partly yes. The web app is fully accessible on its own, and we say so.
- Exploring a map is a continuous physical motion. A joystick moves smoothly in any direction and gives a physical sense of where you are (pushed fully right = east edge). Arrow keys are steps on a grid, and a trackpad gives a blind user no sense of position.
- A screen reader and the data audio compete on a laptop; dedicated controls separate "navigate" from "listen."
- The strongest point: **it's a kiosk prototype for NASA's EIC**, a public exhibit. A walk-up box beats asking visitors to configure a laptop screen reader.

**"A blind person won't know what the buttons do."**
- That's a design problem with known fixes. Elevators, ATMs, and microwaves are all used by blind people every day.
- Distinct shapes, fixed layout, tactile labels, spoken help, audio feedback (section 10).
- **A laptop has the same problem, worse:** about 80 identical-feeling keys plus memorized shortcuts, versus 5 controls you can tell apart blindfolded.
- The live demo answers both questions: a blindfolded judge, no instructions, finds a city by ear in under a minute.

## 12. Known gotchas

- **Bluetooth lag:** the JBL Go 3 has about a 0.2s delay. Noticeable when moving the cursor; use laptop speakers or headphones if it feels off.
- **Web Serial = Chrome/Edge only.** No Safari or Firefox.
- **Full-size SVS frames are huge** (up to 9600×3240). Download a subset and shrink them.
- The Pico can't run the audio. The laptop does all the heavy lifting.
- Grove cables need **Grove-to-jumper** versions for a breadboard.

## 13. Progress and next steps

- [x] MicroPython flashed on the Pico, Thonny connected (Mac)
- [x] Power rails wired and verified (both sides, bridged)
- [x] Knob wired on GP28, tested 0–1023
- [x] Joystick wired on GP26/GP27, tested and calibrated (see section 6)
- [x] 2 Grove buttons wired and tested (Select GP10, Back GP14)
- [ ] LCD: **postponed**, to add later (I2C on GP4 SDA, GP5 SCL; the script already supports it)
- [x] Pico script `main.py` written, tested, and saved to the Pico (sends Interface A messages; LCD optional)
- [ ] Download the 3 NASA videos into `dial-a-planet/data/` and confirm they play in Chrome via the local server
- [ ] Web app (next)
- [ ] Data preprocessing script (SVS API → frames → 256×128 → Interface B JSON)
- [ ] Web app: Web Serial + canvas + Tone.js + menu/dataset screens + Area/Details/Music layers + place-name lookup + keyboard fallback + ARIA announcements
- [ ] Sound tuning per dataset
- [ ] Enclosure with tactile labels
- [ ] Backup demo video
- [ ] Pitch deck / script
