/* Dial-a-Planet web app
 * Reads the Pico controller over Web Serial (lines: J,x,y  K,v  B,1  B,2  B,9),
 * shows NASA Night Lights maps, says where the cursor is, gives details, and plays music.
 * Behavior spec: docs/controls.md
 */
'use strict';

// ======================= CONFIG =======================
const JOY = { cx: 510, cy: 508, dead: 22, range: 255 };  // measured on our Grove joystick
const MAX_SPEED = { lon: 50, lat: 32 };                   // degrees per second at full tilt
const KNOB_HYSTERESIS = 18;                               // knob units of "stickiness" at zone borders
const LAND_BASE = 78;                                     // brightness of unlit land in NASA's images
const LIGHT_MAX = 245;                                    // brightest city pixels
const SAMPLE_W = 1024, SAMPLE_H = 512;                    // resolution used for reading light levels
const CITY_RADIUS_KM = 400;                               // "near <city>" if a big city is within this
const COAST_KM = 150;                                     // over water but this close to a big city = coast
const PLACE_SETTLE_MS = 300;                              // wait this long on a new place before speaking it
const DETAILS_SETTLE_MS = 700;

const DATASETS = [
  {
    id: 'nightlights', name: 'Night Lights', sub: 'City lights from space, 2012 to 2023', enabled: true,
    years: range(2012, 2023),
    file: (y) => `../data/nightlights/${y}.png`,
    facts: [
      "Maps from NASA's Black Marble project, made with the VIIRS instrument on the Suomi NPP satellite.",
      'Each map averages a whole year of nights.',
      'Bright areas show where people live and use electric light. Dark areas are wilderness, desert, ice or ocean.',
      'Changes between years can come from growing cities, new power grids, conflict, or energy savings.',
    ],
  },
  { id: 'ocean', name: 'Ocean Temperature', sub: 'Coming soon', enabled: false },
  { id: 'forest', name: 'Forest Height', sub: 'Coming soon', enabled: false },
];

// ======================= STATE =======================
const S = {
  screen: 'menu',        // 'menu' | 'dataset'
  menuIndex: 0,
  ds: null,              // current dataset object
  yearIndex: 0,
  lat: 20, lon: 0,       // cursor
  layer: 'area',         // 'area' | 'details' | 'music'
  knob: 0,
  joyX: JOY.cx, joyY: JOY.cy,   // last joystick reading from the Pico
  kb: { x: 0, y: 0 },          // keyboard "joystick" (-1..1)
  place: null,
  spokenPlace: '',
  connected: false,
};

const images = {};   // dataset id -> [{ img, light: Uint8Array }]
let geo = null;      // { countries, cities, oceans }

// ======================= DOM =======================
const $ = (id) => document.getElementById(id);
const el = {
  conn: $('conn'), where: $('where'), layer: $('layer'),
  connectBtn: $('connect'), soundBtn: $('sound'),
  menu: $('menu-screen'), list: $('dataset-list'),
  dsScreen: $('dataset-screen'), map: $('map'), year: $('year-badge'),
  rTitle: $('readout-title'), rText: $('readout-text'), facts: $('facts-list'),
  live: $('live'), error: $('error'),
};
const ctx = el.map.getContext('2d');

// ======================= HELPERS =======================
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function wrapLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }

function showError(msg) { el.error.textContent = msg; el.error.classList.remove('hidden'); }
function clearError() { el.error.classList.add('hidden'); }

function formatPop(n) {
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} million`;
  return `${Math.round(n / 1e3)} thousand`;
}

// Knob (0-1023) -> zone index, sticky near borders so it doesn't flicker
function zoneFor(k, n, current) {
  const z = 1024 / n;
  if (current != null) {
    const lo = current * z - KNOB_HYSTERESIS, hi = (current + 1) * z + KNOB_HYSTERESIS;
    if (k >= lo && k < hi) return current;
  }
  return clamp(Math.floor(k / z), 0, n - 1);
}

// ======================= SPEECH =======================
// Chrome's speech engine can silently stall: when its default voice is an online
// Google voice (bad Wi-Fi = silence), when cancel()/speak() are spammed, or when
// a queued utterance gets garbage-collected. So we: pick an offline Mac voice,
// keep utterances referenced, call resume(), and run a watchdog that resets and
// retries if speech hasn't started within 2.5 seconds.
let voice = null, sayTimer = null, pendingSince = 0, lastText = '', retried = false;
const keepAlive = [];

function pickVoice() {
  if (!('speechSynthesis' in window) || typeof speechSynthesis.getVoices !== 'function') return;
  let vs = [];
  try { vs = speechSynthesis.getVoices() || []; } catch (e) { return; }
  voice = vs.find((v) => v.localService && /^en[-_]US/i.test(v.lang))
       || vs.find((v) => v.localService && v.lang.startsWith('en'))
       || vs.find((v) => v.lang.startsWith('en')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function speakNow(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  try { if (voice) { u.voice = voice; u.lang = voice.lang; } } catch (e) { voice = null; }
  u.rate = 1.05;
  u.onstart = () => { pendingSince = 0; };
  u.onend = u.onerror = () => {
    pendingSince = 0;
    const i = keepAlive.indexOf(u); if (i >= 0) keepAlive.splice(i, 1);
  };
  keepAlive.push(u); if (keepAlive.length > 6) keepAlive.shift();
  try { speechSynthesis.resume(); } catch (e) { /* older engines */ }
  speechSynthesis.speak(u);
  pendingSince = performance.now();
}

function say(text) {
  el.live.textContent = text;
  if (!('speechSynthesis' in window)) return;
  lastText = text; retried = false;
  clearTimeout(sayTimer);
  speechSynthesis.cancel();
  sayTimer = setTimeout(() => speakNow(text), 80);   // Chrome drops speech issued right after cancel()
}

function resetSpeech() {
  if (!('speechSynthesis' in window)) return;
  clearTimeout(sayTimer);
  speechSynthesis.cancel();
  try { speechSynthesis.resume(); } catch (e) { /* older engines */ }
  pendingSince = 0;
  pickVoice();
}

// Watchdog: speech queued but never started -> reset the engine and try once more
setInterval(() => {
  if (!pendingSince || performance.now() - pendingSince < 2500) return;
  resetSpeech();
  if (!retried && lastText) { retried = true; setTimeout(() => speakNow(lastText), 120); }
}, 1000);

// ======================= GEOGRAPHY =======================
async function loadGeo() {
  const [countries, cities, oceans] = await Promise.all(
    ['countries', 'cities', 'oceans'].map((n) => fetch(`geo/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`geo/${n}.json: ${r.status}`);
      return r.json();
    })));
  const withBoxes = (list) => list.map((f) => ({ ...f, boxes: f.polys.map(bbox) }));
  geo = { countries: withBoxes(countries), cities, oceans: withBoxes(oceans) };
}

function bbox(poly) {
  let a = 180, b = 90, c = -180, d = -90;
  for (const [x, y] of poly[0]) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inFeature(f, lon, lat) {
  for (let p = 0; p < f.polys.length; p++) {
    const [a, b, c, d] = f.boxes[p];
    if (lon < a || lon > c || lat < b || lat > d) continue;
    const poly = f.polys[p];
    if (inRing(lon, lat, poly[0])) {
      let hole = false;
      for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fallbackOcean(lat, lon) {
  if (lat > 66) return 'Arctic Ocean';
  if (lat < -60) return 'Southern Ocean';
  if (lon > -70 && lon < 20) return lat >= 0 ? 'North Atlantic Ocean' : 'South Atlantic Ocean';
  if (lon >= 20 && lon < 147 && lat < 25) return 'Indian Ocean';
  return lat >= 0 ? 'North Pacific Ocean' : 'South Pacific Ocean';
}

function lookupPlace(lat, lon) {
  const country = geo.countries.find((f) => inFeature(f, lon, lat));
  if (country) {
    let best = null, bestD = CITY_RADIUS_KM;
    for (const c of geo.cities) {
      const d = distKm(lat, lon, c.lat, c.lon);
      if (d < bestD) { bestD = d; best = c; }
    }
    // Right on top of a city from a small country the simplified outlines miss (e.g. Singapore)
    if (best && bestD < 40 && best.country !== country.name) {
      const own = geo.countries.find((f) => f.name === best.country) || { name: best.country, region: '', pop: 0 };
      const label = own.name === best.name ? own.name : `${own.name}, near ${best.name}`;
      return { kind: 'land', label, country: own, city: best, cityKm: Math.round(bestD) };
    }
    const label = best ? `${country.name}, near ${best.name}` : country.name;
    return { kind: 'land', label, country, city: best, cityKm: best ? Math.round(bestD) : null };
  }
  // The country outlines are simplified, so coastal cities (New York, Singapore, Malta...)
  // can fall "in the sea". If a big city is close, treat the spot as that city's land.
  let near = null, nearD = COAST_KM;
  for (const c of geo.cities) {
    const d = distKm(lat, lon, c.lat, c.lon);
    if (d < nearD) { nearD = d; near = c; }
  }
  if (near) {
    const match = geo.countries.find((f) => f.name === near.country);
    const country = match || { name: near.country, region: '', pop: 0 };
    return { kind: 'land', label: `${country.name}, near ${near.name}`, country, city: near, cityKm: Math.round(nearD) };
  }
  const sea = geo.oceans.find((f) => inFeature(f, lon, lat));
  return { kind: 'ocean', label: sea ? sea.name : fallbackOcean(lat, lon) };
}

// ======================= NASA IMAGES =======================
async function loadDatasetImages(ds) {
  if (images[ds.id]) return images[ds.id];
  const off = document.createElement('canvas');
  off.width = SAMPLE_W; off.height = SAMPLE_H;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const frames = [];
  for (const y of ds.years) {
    const img = new Image();
    img.src = ds.file(y);
    try { await img.decode(); } catch (e) {
      throw new Error(`Missing ${ds.file(y).replace('../', '')}. Run: bash scripts/download_data.sh`);
    }
    octx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
    const px = octx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const light = new Uint8Array(SAMPLE_W * SAMPLE_H);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      light[j] = clamp(Math.round(((lum - LAND_BASE) * 255) / (LIGHT_MAX - LAND_BASE)), 0, 255);
    }
    frames.push({ img, light });
  }
  images[ds.id] = frames;
  return frames;
}

// Light level 0..1 around a point (mix of average and peak so small cities still count)
function lightAt(yearIndex, lat, lon, r = 3) {
  const frame = images[S.ds.id][yearIndex];
  const cx = Math.floor(((wrapLon(lon) + 180) / 360) * SAMPLE_W);
  const cy = clamp(Math.floor(((90 - lat) / 180) * SAMPLE_H), 0, SAMPLE_H - 1);
  let sum = 0, max = 0, n = 0;
  for (let dy = -r; dy <= r; dy++) {
    const y = clamp(cy + dy, 0, SAMPLE_H - 1);
    for (let dx = -r; dx <= r; dx++) {
      const x = (cx + dx + SAMPLE_W) % SAMPLE_W;
      const v = frame.light[y * SAMPLE_W + x];
      sum += v; n++; if (v > max) max = v;
    }
  }
  return clamp((0.55 * (sum / n) + 0.45 * max) / 255, 0, 1);
}

function lightWord(s) {
  if (s < 0.05) return 'dark';
  if (s < 0.15) return 'dim';
  if (s < 0.35) return 'moderate';
  if (s < 0.6) return 'bright';
  return 'very bright';
}

// ======================= DETAILS TEXT =======================
function detailsText() {
  const p = S.place, ds = S.ds, year = ds.years[S.yearIndex];
  if (!p) return '';
  if (p.kind === 'ocean') {
    return `${p.label}, ${year}. Open water, almost no lights. Lights at sea are rare and usually come from ships, fishing boats or oil platforms.`;
  }
  const s = lightAt(S.yearIndex, S.lat, S.lon);
  const level = Math.round(s * 10);
  let text = `${p.label}, ${year}. Light level ${level} out of 10, ${lightWord(s)}.`;

  // Compare with another year at the same spot
  const first = 0, last = ds.years.length - 1;
  const other = S.yearIndex === first ? last : first;
  const s2 = lightAt(other, S.lat, S.lon);
  const before = S.yearIndex === first ? s : s2;
  const after = S.yearIndex === first ? s2 : s;
  const y1 = ds.years[first], y2 = S.yearIndex === first ? ds.years[last] : year;
  if (before < 0.03 && after < 0.03) {
    text += ` Few or no electric lights here in ${y1} or ${y2}: likely wilderness, desert, forest or ice.`;
  } else if (before < 0.03) {
    text += ` New lights have appeared here since ${y1}.`;
  } else {
    const pct = Math.round(((after - before) / before) * 100);
    if (Math.abs(pct) < 8) text += ` About the same brightness in ${y1} and ${y2}.`;
    else if (pct > 0) text += ` ${pct} percent brighter in ${y2} than in ${y1}.`;
    else text += ` ${-pct} percent dimmer in ${y2} than in ${y1}.`;
  }
  const pop = formatPop(p.country.pop);
  if (pop) text += ` ${p.country.name} has about ${pop} people.`;
  return text;
}

// ======================= CITY SOUND (Tone.js) =======================
// Night Lights soundscape, all synthesized (no audio files):
//   bright city -> traffic rumble, passing cars, crowd chatter, horns, the odd siren
//   dim / dark land -> quiet road, wind, crickets
//   ocean -> waves
// Everything scales with the light level under the cursor and pans with longitude.
const Music = {
  built: false, on: false,
  p: { light: 0, ocean: false, pan: 0 },
  sirenUntil: 0,

  build() {
    if (this.built || !window.Tone) return;
    this.master = new Tone.Volume(6).toDestination();   // louder: laptop + Bluetooth speakers
    this.panner = new Tone.Panner(0).connect(this.master);
    this.space = new Tone.Reverb({ decay: 2.5, wet: 0.25 }).connect(this.panner);

    // Traffic rumble: low brown noise
    this.trafficGain = new Tone.Gain(0).connect(this.panner);
    this.trafficFilter = new Tone.Filter(250, 'lowpass').connect(this.trafficGain);
    this.traffic = new Tone.Noise('brown').connect(this.trafficFilter);

    // Crowd chatter: mid-range noise that flutters like voices
    this.chatterGain = new Tone.Gain(0).connect(this.space);
    this.chatterTrem = new Tone.Tremolo({ frequency: 7, depth: 0.7, spread: 0 }).connect(this.chatterGain);
    this.chatterFilter = new Tone.Filter({ frequency: 1400, type: 'bandpass', Q: 1.2 }).connect(this.chatterTrem);
    this.chatter = new Tone.Noise('pink').connect(this.chatterFilter);

    // Passing car: a noise "whoosh" swelling in and out
    this.carFilter = new Tone.Filter(600, 'bandpass').connect(this.panner);
    this.car = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.5, decay: 0.2, sustain: 0.5, release: 0.9 },
    }).connect(this.carFilter);
    this.car.volume.value = -14;

    // Car horn: two buzzy notes together
    this.hornFilter = new Tone.Filter(1800, 'lowpass').connect(this.space);
    this.horn = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.05 },
    }).connect(this.hornFilter);
    this.horn.volume.value = -22;

    // Siren: a sine wave wailing up and down
    this.sirenGain = new Tone.Gain(0).connect(this.space);
    this.siren = new Tone.Oscillator(800, 'sine').connect(this.sirenGain);
    this.sirenLfo = new Tone.LFO({ frequency: 0.35, min: 650, max: 1250 }).connect(this.siren.frequency);

    // Countryside: wind + crickets
    this.windGain = new Tone.Gain(0).connect(this.panner);
    this.windFilter = new Tone.AutoFilter({ frequency: 0.08, baseFrequency: 300, octaves: 2 }).connect(this.windGain);
    this.wind = new Tone.Noise('brown').connect(this.windFilter);
    this.cricket = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.03, sustain: 0, release: 0.02 },
    }).connect(this.space);
    this.cricket.volume.value = -26;

    // Ocean: slow waves
    this.waveGain = new Tone.Gain(0).connect(this.panner);
    this.waveFilter = new Tone.AutoFilter({ frequency: 0.12, baseFrequency: 200, octaves: 2.5 }).connect(this.waveGain);
    this.waves = new Tone.Noise('brown').connect(this.waveFilter);

    // Random city events, checked 8 times a second
    this.loop = new Tone.Loop((time) => this.events(time), 0.125);
    this.built = true;
  },

  events(time) {
    const { light, ocean } = this.p;
    if (ocean) return;
    const r = Math.random;
    // passing cars: a few per second downtown, rare in the countryside
    if (r() < 0.01 + light * 0.18) {
      const f = 300 + r() * 500;
      this.carFilter.frequency.setValueAtTime(f, time);
      this.carFilter.frequency.linearRampToValueAtTime(f * 0.6, time + 1.4);
      this.car.triggerAttackRelease(0.6 + r() * 0.8, time, 0.4 + light * 0.6);
    }
    // horns: only where it's busy
    if (light > 0.25 && r() < (light ** 2) * 0.06) {
      const pair = r() < 0.5 ? ['F4', 'A4'] : ['G4', 'B4'];
      const len = r() < 0.3 ? 0.5 : 0.15;
      this.horn.triggerAttackRelease(pair, len, time, 0.6 + 0.4 * r());
      if (r() < 0.4) this.horn.triggerAttackRelease(pair, 0.12, time + len + 0.12, 0.6);   // double honk
    }
    // siren: big bright cities, now and then (about every 20-30 s)
    const now = Tone.now();
    if (light > 0.5 && now > this.sirenUntil + 8 && r() < 0.005) {
      this.sirenUntil = now + 5;
      this.sirenGain.gain.rampTo(0.05, 0.8, time);
      this.sirenGain.gain.rampTo(0, 1.2, time + 4);
    }
    // crickets: only on dark land
    if (light < 0.12 && r() < 0.18) {
      const f = 4000 + r() * 800;
      for (let i = 0; i < 3; i++) this.cricket.triggerAttackRelease(f, 0.02, time + i * 0.06, 0.5);
    }
  },

  start() {
    this.build();
    if (!this.built || this.on) return;
    this.on = true;
    for (const src of [this.traffic, this.chatter, this.siren, this.wind, this.waves]) src.start();
    this.chatterTrem.start(); this.sirenLfo.start(); this.windFilter.start(); this.waveFilter.start();
    this.loop.start(0);
    Tone.Transport.start();
    this.apply();
  },

  stop() {
    if (!this.on) return;
    this.on = false;
    for (const g of [this.trafficGain, this.chatterGain, this.sirenGain, this.windGain, this.waveGain]) g.gain.rampTo(0, 0.3);
    setTimeout(() => {
      if (this.on) return;
      this.loop.stop(); Tone.Transport.stop();
      for (const src of [this.traffic, this.chatter, this.siren, this.wind, this.waves]) src.stop();
      this.chatterTrem.stop(); this.sirenLfo.stop(); this.windFilter.stop(); this.waveFilter.stop();
    }, 400);
  },

  update(light, ocean, lon) {
    this.p = { light, ocean, pan: clamp(lon / 180, -1, 1) };
    if (this.on) this.apply();
  },

  apply() {
    const { light, ocean, pan } = this.p;
    const land = ocean ? 0 : 1;
    this.panner.pan.rampTo(pan, 0.2);
    this.trafficGain.gain.rampTo(land * (0.05 + light * 0.55), 0.4);
    this.trafficFilter.frequency.rampTo(180 + light * 500, 0.4);
    this.chatterGain.gain.rampTo(land * Math.max(0, light - 0.2) * 0.35, 0.4);
    this.windGain.gain.rampTo(land * Math.max(0, 0.3 - light) * 0.6, 0.6);
    this.waveGain.gain.rampTo(ocean ? 0.5 : 0, 0.6);
  },

  // Short chime for the "Test sound" button
  chime() {
    this.build();
    if (!this.built) return;
    const s = new Tone.Synth({ envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 } }).connect(this.master);
    const t = Tone.now();
    ['C5', 'E5', 'G5'].forEach((n, i) => s.triggerAttackRelease(n, 0.15, t + i * 0.12));
    setTimeout(() => s.dispose(), 1500);
  },
};

function soundDescription() {
  if (!S.place) return '';
  if (S.place.kind === 'ocean') return 'ocean waves';
  const s = lightAt(S.yearIndex, S.lat, S.lon, 5);
  if (s < 0.12) return 'quiet countryside: wind and crickets';
  if (s < 0.35) return 'small town: light traffic';
  if (s < 0.6) return 'busy city: traffic and voices';
  return 'big city: heavy traffic, horns and sirens';
}

async function unlockAudio() {
  if (window.Tone && Tone.context.state !== 'running') {
    try { await Tone.start(); await Tone.context.resume(); } catch (e) { /* needs a user gesture */ }
  }
  const ok = !!window.Tone && Tone.context.state === 'running';
  el.soundBtn.textContent = ok ? 'Test sound ✓' : 'Start sound';
  el.soundBtn.classList.toggle('done', ok);
  return ok;
}

// ======================= RENDERING =======================
function renderMenu() {
  el.list.innerHTML = '';
  DATASETS.forEach((d, i) => {
    const li = document.createElement('li');
    li.className = (i === S.menuIndex ? 'active ' : '') + (d.enabled ? '' : 'soon');
    li.innerHTML = `${d.name}<span class="sub">${d.sub}</span>`;
    if (i === S.menuIndex) li.setAttribute('aria-current', 'true');
    el.list.appendChild(li);
  });
}

function showScreen() {
  const inDs = S.screen === 'dataset';
  el.menu.classList.toggle('hidden', inDs);
  el.dsScreen.classList.toggle('hidden', !inDs);
  el.layer.classList.toggle('hidden', !inDs);
  el.where.textContent = inDs ? `${S.ds.name} · ${S.ds.years[S.yearIndex]}` : 'Menu';
  el.layer.textContent = `Layer: ${{ area: 'Area', details: 'Details', music: 'City sounds' }[S.layer]}`;
}

function drawMap() {
  if (S.screen !== 'dataset' || !images[S.ds.id]) return;
  const { img } = images[S.ds.id][S.yearIndex];
  const W = el.map.width, H = el.map.height;
  ctx.drawImage(img, 0, 0, W, H);
  const x = ((S.lon + 180) / 360) * W, y = ((90 - S.lat) / 180) * H;
  ctx.lineWidth = 4;
  ctx.strokeStyle = S.layer === 'music' ? '#57d68d' : '#f6c453';
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 40, y); ctx.lineTo(x - 28, y); ctx.moveTo(x + 28, y); ctx.lineTo(x + 40, y);
  ctx.moveTo(x, y - 40); ctx.lineTo(x, y - 28); ctx.moveTo(x, y + 28); ctx.lineTo(x, y + 40);
  ctx.stroke();
  el.year.textContent = S.ds.years[S.yearIndex];
}

function updateReadout() {
  if (!S.place) return;
  el.rTitle.textContent = S.place.label;
  if (S.layer === 'details') el.rText.textContent = detailsText();
  else if (S.layer === 'music') el.rText.textContent = `Sound: ${soundDescription()}. Click the joystick to stop.`;
  else {
    el.rText.textContent = S.place.kind === 'ocean'
      ? 'Open ocean.'
      : `${S.place.country.region ? S.place.country.region + '. ' : ''}Light level: ${lightWord(lightAt(S.yearIndex, S.lat, S.lon))}. Click the joystick for details.`;
  }
  el.map.setAttribute('aria-label', `Map of ${S.ds.name}, ${S.ds.years[S.yearIndex]}, cursor over ${S.place.label}`);
}

function sendLcd(a, b = '') { serialWrite(`L,${a.slice(0, 16)}|${b.slice(0, 16)}`); }

// ======================= ACTIONS =======================
function menuMove(index) {
  if (index === S.menuIndex) return;
  S.menuIndex = index;
  renderMenu();
  const d = DATASETS[index];
  say(d.enabled ? d.name : `${d.name}, coming soon`);
  sendLcd('Pick a dataset:', d.name);
}

async function enterDataset() {
  const d = DATASETS[S.menuIndex];
  if (!d.enabled) { say(`${d.name} is coming soon. Try Night Lights.`); return; }
  try {
    el.where.textContent = `Loading ${d.name}…`;
    await loadDatasetImages(d);
    clearError();
  } catch (e) {
    showError(e.message); say('The map images are missing.');
    el.where.textContent = 'Menu';
    return;
  }
  S.ds = d;
  S.screen = 'dataset';
  S.layer = 'area';
  S.yearIndex = zoneFor(S.knob, d.years.length, null);
  S.spokenPlace = '';
  el.facts.innerHTML = d.facts.map((f) => `<li>${f}</li>`).join('');
  showScreen();
  refreshPlace(true);
  drawMap();
  say(`${d.name}, ${d.years[S.yearIndex]}. Move the joystick to explore. ${S.place ? S.place.label : ''}`);
  S.spokenPlace = S.place ? S.place.label : '';
  sendLcd(d.name, String(d.years[S.yearIndex]));
}

function backToMenu() {
  Music.stop();
  S.screen = 'menu';
  S.layer = 'area';
  showScreen(); renderMenu();
  say(`Menu. ${DATASETS[S.menuIndex].name}. Turn the knob to choose, press A to select.`);
  sendLcd('Pick a dataset:', DATASETS[S.menuIndex].name);
}

function setYear(i) {
  if (i === S.yearIndex) return;
  S.yearIndex = i;
  showScreen(); drawMap();
  refreshPlace(false);
  updateReadout();
  say(String(S.ds.years[i]));
  if (S.layer === 'details') scheduleDetails();
  sendLcd(S.ds.name, String(S.ds.years[i]));
}

async function cycleLayer() {
  const next = { area: 'details', details: 'music', music: 'area' }[S.layer];
  S.layer = next;
  showScreen(); drawMap();
  if (next === 'details') {
    Music.stop();
    say(detailsText());
  } else if (next === 'music') {
    if (!(await unlockAudio())) {
      say('Music needs one click first. Press Start sound on the screen.');
    } else {
      updateMusic();
      Music.start();
      say(`City sounds. ${soundDescription()}`);
    }
  } else {
    Music.stop();
    say(`Places. ${S.place ? S.place.label : ''}`);
    S.spokenPlace = S.place ? S.place.label : '';
  }
  updateReadout();
  sendLcd(S.ds.name, `${S.ds.years[S.yearIndex]} ${next}`);
}

function updateMusic() {
  if (!S.place) return;
  const ocean = S.place.kind === 'ocean';
  Music.update(ocean ? 0 : lightAt(S.yearIndex, S.lat, S.lon, 5), ocean, S.lon);
}

// Place under the cursor changed? Speak it once it settles.
let placeTimer = null, detailsTimer = null;
function refreshPlace(immediate) {
  if (!geo || S.screen !== 'dataset') return;
  S.place = lookupPlace(S.lat, S.lon);
  updateReadout();
  updateMusic();
  if (immediate) return;
  if (S.place.label !== S.spokenPlace) {
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => {
      if (!S.place || S.place.label === S.spokenPlace) return;
      S.spokenPlace = S.place.label;
      if (S.layer === 'area') say(S.place.label);
      else if (S.layer === 'details') scheduleDetails();
    }, PLACE_SETTLE_MS);
  }
}

function scheduleDetails() {
  clearTimeout(detailsTimer);
  detailsTimer = setTimeout(() => { if (S.layer === 'details') say(detailsText()); }, DETAILS_SETTLE_MS);
}

// ======================= INPUT HANDLING =======================
function onKnob(v) {
  S.knob = v;
  if (S.screen === 'menu') menuMove(zoneFor(v, DATASETS.length, S.menuIndex));
  else setYear(zoneFor(v, S.ds.years.length, S.yearIndex));
}

function onButton(id) {
  if (id === 1) {                       // Button A: select
    if (S.screen === 'menu') enterDataset();
  } else if (id === 2) {                // Button B: back / repeat
    if (S.screen === 'dataset') backToMenu();
    else { const d = DATASETS[S.menuIndex]; say(`${d.name}. ${d.enabled ? 'Press A to select.' : 'Coming soon.'}`); }
  } else if (id === 9) {                // joystick click: cycle layer
    if (S.screen === 'dataset') cycleLayer();
  }
}

function handleLine(line) {
  const parts = line.trim().split(',');
  switch (parts[0]) {
    case 'J': S.joyX = +parts[1]; S.joyY = +parts[2]; break;
    case 'K': onKnob(+parts[1]); break;
    case 'B': onButton(+parts[1]); break;
    case 'READY': case 'PONG': setConnected(true); break;
  }
}

// Joystick -> cursor speed (rate control, like a game stick)
function axis(raw, center) {
  const d = raw - center;
  if (Math.abs(d) < JOY.dead) return 0;
  const n = clamp((Math.abs(d) - JOY.dead) / (JOY.range - JOY.dead), 0, 1);
  return Math.sign(d) * n ** 1.6;   // gentle near the middle, fast at the edge
}

let lastFrame = performance.now(), placeCheckAt = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (S.screen === 'dataset') {
    const vx = S.kb.x || axis(S.joyX, JOY.cx);
    const vy = S.kb.y || axis(S.joyY, JOY.cy);   // up = higher Y = north
    if (vx || vy) {
      S.lon = wrapLon(S.lon + vx * MAX_SPEED.lon * dt);
      S.lat = clamp(S.lat + vy * MAX_SPEED.lat * dt, -85, 85);
      drawMap();
      if (now > placeCheckAt) { placeCheckAt = now + 100; refreshPlace(false); }
    }
  }
  requestAnimationFrame(tick);
}

// Keyboard fallback
const KB_KNOB_STEP = 1024 / 12;
window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.repeat && !e.key.startsWith('Arrow')) return;
  switch (e.key) {
    case 'ArrowLeft': S.kb.x = -0.8; break;
    case 'ArrowRight': S.kb.x = 0.8; break;
    case 'ArrowUp': S.kb.y = 0.8; break;
    case 'ArrowDown': S.kb.y = -0.8; break;
    case ',': onKnob(clamp(S.knob - KB_KNOB_STEP, 0, 1023)); break;
    case '.': onKnob(clamp(S.knob + KB_KNOB_STEP, 0, 1023)); break;
    case 'Enter': onButton(1); break;
    case 'Escape': onButton(2); break;
    case ' ': onButton(9); break;
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') S.kb.x = 0;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') S.kb.y = 0;
});

// ======================= WEB SERIAL =======================
let port = null, writer = null;

function setConnected(on) {
  S.connected = on;
  el.conn.textContent = on ? 'Controller: connected' : 'Controller: not connected';
  el.conn.className = `pill ${on ? 'on' : 'off'}`;
  el.connectBtn.classList.toggle('done', on);
  el.connectBtn.textContent = on ? 'Controller connected' : 'Connect controller';
}

function serialWrite(text) {
  if (writer) writer.write(text + '\n').catch(() => {});
}

async function openPort(p) {
  port = p;
  await port.open({ baudRate: 115200 });
  const enc = new TextEncoderStream();
  enc.readable.pipeTo(port.writable).catch(() => {});
  writer = enc.writable.getWriter();
  serialWrite('PING');
  readLoop();
}

async function readLoop() {
  const dec = new TextDecoderStream();
  port.readable.pipeTo(dec.writable).catch(() => {});
  const reader = dec.readable.getReader();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.trim()) { setConnected(true); handleLine(line); }
      }
    }
  } catch (e) { /* unplugged */ }
  setConnected(false);
  writer = null;
}

async function connectClicked() {
  await unlockAudio();
  if (!('serial' in navigator)) {
    showError('This browser has no Web Serial. Use Chrome or Edge on a computer.');
    return;
  }
  try {
    const p = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x2e8a }] }); // Raspberry Pi
    await openPort(p);
    clearError();
  } catch (e) {
    if (e.name === 'NotFoundError') return;   // user closed the picker
    showError(`Could not open the controller: ${e.message}. Is Thonny still open? Close it and try again.`);
  }
}

// ======================= STARTUP =======================
async function init() {
  renderMenu(); showScreen(); setConnected(false);
  el.connectBtn.addEventListener('click', connectClicked);
  el.soundBtn.addEventListener('click', async () => {
    resetSpeech();
    const audio = await unlockAudio();
    if (audio) Music.chime();
    say(audio ? 'Sound and voice are working.' : 'Voice is working, but sound is blocked. Click again.');
  });
  try {
    await loadGeo();
  } catch (e) {
    showError('Could not load map data. Start the server from the repo folder: python3 -m http.server 8000, then open http://localhost:8000/web/');
    return;
  }
  // Reconnect automatically to a controller this browser was already allowed to use
  if ('serial' in navigator) {
    navigator.serial.addEventListener('connect', (e) => openPort(e.target).catch(() => {}));
    const known = await navigator.serial.getPorts();
    if (known.length) openPort(known[0]).catch(() => {});
  }
  requestAnimationFrame(tick);
}

init();

// For testing from the console / automated tests
window.__dap = { S, handleLine, onKnob, onButton, lookupPlace, lightAt: (...a) => lightAt(...a), detailsText, Music };
