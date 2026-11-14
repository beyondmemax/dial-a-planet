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
| **3. Music** | 2nd click | **Plays the sonification** for this dataset at the cursor: busy, sparkly "city noise" for night lights, slow warm tones for ocean temperature, woody tones for forest height |
| back to 1 | 3rd click | Music stops, back to area announcements |

Changing the year with the knob keeps you in the same layer, so in Music you can hear the sound change as the years go by.

## The 3 datasets

Testing starts with **just one dataset** (Night Lights), then adds the others.

| # | Dataset | "Time" on the knob | Status |
|---|---|---|---|
| 1 | **Night Lights 2012–2023** | Years 2012 → 2023 (the first part of NASA's video) | Start here |
| 2 | **Ocean currents & temperature** | Dates across the simulation (exact range still to confirm from NASA's frame date list) | Next |
| 3 | **Forest height (GEDI)** | ⚠️ NASA's video is a global reveal, not year-by-year, so the knob would scrub the animation | Open question |

## Still to decide
- [ ] Confirm the click order above (Area → Details → Music → Area)
- [ ] What the forest knob does, since there are no real "years" in that video
- [ ] Spoken announcements (browser speech) vs. text on screen vs. both. Recommend both, for accessibility
