# Controls: how Dial-a-Planet behaves

Decided Saturday Nov 14, 2026. This replaces the earlier "Listen mode / Explore mode" idea.

The Pico only sends raw input (`J`, `K`, `B` lines, see `pico/main.py`).
**The web app owns all of this behavior.**

## The flow

```
            ┌──────────────────────────┐
            │      DATASET MENU        │
            │  Knob  = scroll datasets │
            │  A     = select          │
            └────────────┬─────────────┘
                         │ A
                         ▼
            ┌──────────────────────────┐
            │      INSIDE A DATASET    │◄──── B (back) returns to menu
            │  Knob     = pick year    │      from anywhere in here
            │  Joystick = move cursor  │
            │  Click    = cycle layer  │
            └──────────────────────────┘
```

## Every control, every screen

| Control | Dataset menu | Inside a dataset |
|---|---|---|
| **Knob** | Scroll through the 3 datasets (announces each one) | Scrub through **time/years** |
| **Button A** (GP10) | **Select** the highlighted dataset | n/a |
| **Button B** (GP14) | Repeat the current choice out loud | **Back** to the dataset menu |
| **Joystick move** | n/a | Move the cursor over the map |
| **Joystick click** | n/a | Cycle through the 3 layers below |

## Inside a dataset: the 3 layers (joystick click cycles them)

| Layer | When | What happens |
|---|---|---|
| **1. Area (default)** | You land here when you open a dataset | As you move, it **says/shows where you are**: country, ocean, or region name (plus the nearest big city when there is one). Short facts about the dataset are displayed. |
| **2. Details** | 1st click | Tells you **specific data about the spot under the cursor** for this dataset and year, e.g. *"Lagos, Nigeria, 2019: very bright, among the fastest-growing light in Africa"* |
| **3. Sound** | 2nd click | **Plays the soundscape** for this dataset at the cursor. Night Lights = **city noise** (traffic, horns, chatter, sirens) that gets busier the brighter the spot is; countryside crickets/wind on dark land; waves at sea |
| back to 1 | 3rd click | Music stops, back to area announcements |

Changing the year with the knob keeps you in the same layer, so in Music you can hear the sound change as the years go by.

## The 3 datasets

Testing starts with **just one dataset** (Night Lights), then adds the others.

| # | Dataset | "Time" on the knob | Status |
|---|---|---|---|
| 1 | **Night Lights 2012–2023** | Years 2012 → 2023 (12 zones on the knob) | ✅ Built (`web/`) |
| 2 | **Ocean currents & temperature** | Dates across the simulation (exact range still to confirm from NASA's frame date list) | Next |
| 3 | **Forest height (GEDI)** | ⚠️ NASA's video is a global reveal, not year-by-year, so the knob would scrub the animation | Open question |

## Still to decide
- [x] Click order Area → Details → Music → Area (built this way)
- [ ] What the forest knob does, since there are no real "years" in that video
- [x] Spoken + on screen: both (browser speech plus a screen-reader live region)

## How it's built (web/app.js)

- **Knob:** zones with "stickiness" so it doesn't flicker at borders (3 zones in the menu, 12 in Night Lights)
- **Joystick:** rate control, like a game stick: the further you push, the faster the cursor moves (dead zone around center, calibrated to our joystick: center X≈510, Y≈508)
- **Place names:** offline point-in-polygon on Natural Earth country and ocean outlines, plus the nearest big city within 400 km. Coastal cities that fall "in the sea" on the simplified outlines get snapped to the nearby city.
- **Light level:** read from the NASA map's pixels around the cursor (0–10), compared with 2012 (or with 2023 when you're on 2012)
- **City sounds (Night Lights music layer):** synthesized with Tone.js, no audio files. Bright city = traffic rumble, passing cars, crowd chatter, car horns, and an occasional siren. Small town = light traffic. Dark land = wind and crickets. Ocean = waves. All of it scales with the real light level under the cursor and pans left/right with longitude.
- **Voice:** uses an offline Mac voice (not Google's online one, which goes silent on bad Wi-Fi). A watchdog resets the speech engine and retries if speech stalls. The **Test sound** button plays a chime and speaks, to check both.
- Speech says the new place once the cursor settles for 0.3 s; Details re-speaks after 0.7 s on a new spot or year
