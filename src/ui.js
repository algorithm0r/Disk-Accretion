'use strict';
// ALL DOM lives here (and in index.html). The sim classes never touch the document, which
// is what lets the same files run headlessly. On Claude Basic (vendor/, 0.6.0):
//   · the scenario card: picker, explainer, and the measured-vs-expected check (presets.js)
//   · the control strips under the world, built from PARAM_SCHEMA (physics, then engine)
//   · the dial, the key to the world, and the live charts (one UiPump entity feeds them)
//   · the world's colours, resolved from the kit's tokens (a canvas can't read var())
//   · canvas size and mouse pan/zoom

var M_EARTH = 3.003e-6;   // Earth mass in M_star (= M_sun) units, for the readouts
var $ = (id) => document.getElementById(id);

function fmtNum(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.001) return v.toExponential(2);
  if (a < 0.01) return String(+v.toPrecision(2));   // dt 0.002, μ 0.003
  return (a >= 100) ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(3));
}

function setStatus(msg) { const s = $('status'); if (s) s.textContent = msg; }
// something the viewer should notice once (a backend falling back): a toast, not a status line
function notify(title, sub) { if (window.CB && CB.toast) CB.toast(title, sub, { tone: 'warn' }); else setStatus(title + ': ' + sub); }

// ─── the world's colours ────────────────────────────────────────────────────────────
// Every colour is a CSS expression over the kit's semantic tokens, so a theme moves it. The
// legend under the world uses the SAME expressions, so the key always matches the drawing.
// Mass ramp: index = 2·log2(m / m0), so 0 is a planetesimal, 8 is 16×, 14 is 128×, 30 is 32 000×.
var WORLD_EXPR = {
  dust: 'color-mix(in srgb, var(--cb-series-1) 60%, var(--cb-sunken))',
  ramp: [
    [0, 'color-mix(in srgb, var(--cb-series-1) 60%, var(--cb-sunken))'],
    [4, 'var(--cb-series-1)'],
    [8, 'var(--cb-text)'],
    [14, 'var(--cb-gold)'],
    [22, 'color-mix(in srgb, var(--cb-gold), var(--cb-bad))'],
    [30, 'var(--cb-bad)'],
    [39, 'color-mix(in srgb, var(--cb-bad) 60%, var(--cb-series-5))'],
  ],
  star: 'color-mix(in srgb, var(--cb-gold) 40%, var(--cb-text))',
  glow: 'var(--cb-gold)',
  test: 'color-mix(in srgb, var(--cb-info) 60%, var(--cb-text))',
  hill: 'var(--cb-text)',
};
function rampExpr(index) { return WORLD_EXPR.ramp.find(([i]) => i >= index)[1]; }

function worldColors() {
  let out = null;
  CB.sim.palette($('gameWorld').parentNode, (res) => {
    const rgb = (e) => res(e).rgb;
    out = {
      bg: rgb('var(--cb-sunken)'), ramp: WORLD_EXPR.ramp.map(([i, e]) => [i, rgb(e)]),
      star: rgb(WORLD_EXPR.star), glow: rgb(WORLD_EXPR.glow), test: rgb(WORLD_EXPR.test), hill: rgb(WORLD_EXPR.hill),
    };
  });
  return out;
}

// the key to what's drawn, per scenario: the disks show the mass ramp, the planet scenarios
// show planets and massless test particles
function legendFor(id) {
  const star = { label: 'star', mark: 'dot', color: WORLD_EXPR.star };
  const hill = { label: 'Hill radius (gravitational reach)', mark: 'ring', color: 'var(--cb-muted)' };
  if (id === 'disk' || id === 'toomre') {
    return [star,
      { label: 'planetesimal', mark: 'dot', color: WORLD_EXPR.dust },
      { label: '16× grown', mark: 'dot', color: rampExpr(8) },
      { label: '128×', mark: 'dot', color: rampExpr(14) },
      { label: '32 000× (protoplanet)', mark: 'dot', color: rampExpr(30) },
      hill];
  }
  const items = [star];
  if (id === 'hill') items.push({ label: 'planet', mark: 'dot', color: rampExpr(14) });
  else if (id !== 'kepler') items.push({ label: 'planet', mark: 'dot', color: rampExpr(22) });
  if (id !== 'hill') items.push({ label: 'test particle (massless)', mark: 'dot', color: WORLD_EXPR.test });
  if (id !== 'kepler') items.push(hill);
  return items;
}

// ─── control strips (kit markup; see the note on CB.sim.controls) ──────────────────────
// CB.sim.controls (0.6.0) has no log-scale slider, no value formatting, no per-scenario
// visibility and no way to push a changed value back into a control (a backend falling back
// to cpu). This builds the same markup (.cb-sim-controls > .cb-sim-ctl) with those four.
// Reported upstream for the kit; replace with CB.sim.controls once it has them.
var CONTROL_SYNC = {};
function syncControl(key) { if (CONTROL_SYNC[key]) CONTROL_SYNC[key](); }

function buildControls() {
  CONTROL_SYNC = {};
  const groups = { physics: $('controlsPhysics'), engine: $('controlsEngine') };
  for (const g in groups) { groups[g].innerHTML = ''; groups[g].className = 'cb-sim-controls'; }
  for (const spec of PARAM_SCHEMA) {
    if (spec.presets && !spec.presets.includes(PARAMETERS.preset)) continue;
    groups[spec.group || 'engine'].appendChild(buildControl(spec));
  }
}

function buildControl(spec) {
  const w = document.createElement('label');
  if (spec.tip) w.dataset.tip = spec.tip;
  const apply = () => {
    if (spec.resets) reset();
    else if (spec.live === 'radii' && world) world.updateRadii();
    else if (spec.live === 'backend') setBackend(PARAMETERS[spec.key]);
  };
  if (spec.type === 'bool') {
    w.className = 'cb-sim-ctl switch';
    w.innerHTML = '<span class="cb-switch"><input type="checkbox"><span></span> ' + CB.esc(spec.label) + '</span>';
    const cb = w.querySelector('input');
    cb.checked = !!PARAMETERS[spec.key];
    cb.onchange = () => { PARAMETERS[spec.key] = cb.checked; apply(); };
    CONTROL_SYNC[spec.key] = () => { cb.checked = !!PARAMETERS[spec.key]; };
  } else if (spec.options) {
    w.className = 'cb-sim-ctl';
    w.innerHTML = '<span class="k"><span>' + CB.esc(spec.label) + '</span></span><select class="cb-select"></select>';
    const sel = w.querySelector('select');
    for (const op of spec.options) {
      const o = document.createElement('option');
      o.value = typeof op === 'object' ? op.value : op;
      o.textContent = typeof op === 'object' ? op.label : op;
      sel.appendChild(o);
    }
    sel.value = PARAMETERS[spec.key];
    sel.onchange = () => { PARAMETERS[spec.key] = sel.value; apply(); };
    CONTROL_SYNC[spec.key] = () => { sel.value = PARAMETERS[spec.key]; };
  } else {
    w.className = 'cb-sim-ctl';
    w.innerHTML = '<span class="k"><span>' + CB.esc(spec.label) + '</span><output></output></span><input type="range" class="cb-range">';
    const input = w.querySelector('input'), out = w.querySelector('output');
    // log sliders move in log10 space
    const toSlider = (v) => spec.log ? Math.log10(v) : v;
    const fromSlider = (s) => { let v = spec.log ? Math.pow(10, s) : s; if (spec.round) v = Math.round(v); return v; };
    if (spec.log) { input.min = Math.log10(spec.min); input.max = Math.log10(spec.max); input.step = 0.01; }
    else { input.min = spec.min; input.max = spec.max; input.step = spec.step; }
    const show = () => { const v = PARAMETERS[spec.key]; out.textContent = spec.round ? v.toLocaleString() : fmtNum(v); };
    input.value = toSlider(PARAMETERS[spec.key]);
    show();
    input.oninput = () => {
      PARAMETERS[spec.key] = fromSlider(parseFloat(input.value));
      show();
      if (!spec.resets) apply();   // live params apply while dragging
    };
    if (spec.resets) input.onchange = apply;   // rebuilding waits for the release
    CONTROL_SYNC[spec.key] = () => { input.value = toSlider(PARAMETERS[spec.key]); show(); };
  }
  return w;
}

// what the engine is actually doing (a status that changes rarely, not a report)
var GRAVITY_NAMES = { bh: 'Barnes-Hut tree', brute: 'brute force, every pair', direct: 'exact sum over the few massive bodies',
  gpu: 'GPU, every pair', workers: 'web workers, Barnes-Hut' };
function refreshEngineNote() {
  if (!world) return;
  const g = GRAVITY_NAMES[world.gravityMode] || world.gravityMode;
  let s = 'In use: gravity by ' + g + ' · ' + (world.isHybrid ? 'hybrid integrator' : 'leapfrog integrator');
  if (world.isHybrid && world.hybrid) s += ' (' + world.hybrid.stats.inGroups + ' bodies in close encounters now)';
  $('engineNote').textContent = s;
}

// ─── scenarios (presets.js): picker, explainer, measured vs expected ─────────────────
var PRESET_GROUPS = [
  ['Build a solar system', ['disk', 'toomre']],
  ['Check the physics against a known answer', ['kepler', 'trojans', 'routh', 'gap', 'kirkwood', 'hill']],
];

function buildPresetPicker() {
  const sel = $('presetSel');
  const listed = new Set();
  for (const [name, ids] of PRESET_GROUPS) {
    const g = document.createElement('optgroup');
    g.label = name;
    for (const id of ids) if (PRESETS[id]) { g.appendChild(presetOption(id)); listed.add(id); }
    sel.appendChild(g);
  }
  // a scenario added to presets.js but not to a group above still shows, at the end
  for (const id in PRESETS) if (!listed.has(id)) sel.lastChild.appendChild(presetOption(id));
  sel.value = PARAMETERS.preset;
  sel.onchange = () => applyPreset(sel.value);
  showPresetInfo();
}
function presetOption(id) {
  const op = document.createElement('option');
  op.value = id; op.textContent = PRESETS[id].label;
  return op;
}

// a preset's params go over the untouched defaults (not over the previous preset's), then rebuild
function applyPreset(id) {
  const keepBackend = PARAMETERS.backend;
  const fresh = JSON.parse(JSON.stringify(DEFAULT_PARAMETERS));
  for (const k in PARAMETERS) delete PARAMETERS[k];
  Object.assign(PARAMETERS, fresh, PRESETS[id].params, { preset: id, backend: keepBackend });
  $('presetSel').value = id;
  // the address names the scenario, so a link opens on it (#trojans)
  try { history.replaceState(null, '', id === DEFAULT_PARAMETERS.preset ? location.pathname + location.search : '#' + id); } catch (e) { /* file:// */ }
  buildControls();
  showPresetInfo();
  reset();
  resetView();
}

function showPresetInfo() {
  $('presetInfo').textContent = PRESETS[PARAMETERS.preset].explainer;
  $('legend').data = legendFor(PARAMETERS.preset);
}

function refreshCheck() {
  if (!presetTracker || !world) return;
  const id = PARAMETERS.preset, r = presetTracker.result(world), v = presetVerdict(id, world, r);
  $('expected').textContent = r.expected;
  $('measured').textContent = r.text;
  $('measuredLabel').textContent = v.measuring ? 'So far' : 'Measured';
  let tone, word;
  if (v.measuring) { tone = 'info'; word = 'measuring · year ' + Math.min(v.minOrbits, Math.floor(v.orbits) + 1) + ' of ' + v.minOrbits; }   // counts like the dial
  else if (v.pass === true) { tone = 'ok'; word = 'matches theory'; }
  else if (v.pass === false) { tone = 'bad'; word = 'does not match'; }
  else { tone = 'neutral'; word = 'compare by eye'; }
  const badge = $('verdict');
  badge.className = 'cb-badge ' + tone;
  badge.textContent = word;
  $('check').className = 'check' + (v.pass === true ? ' pass' : (v.pass === false ? ' fail' : ''));
  const pr = $('progress');
  pr.hidden = !v.measuring;
  if (v.measuring) pr.style.setProperty('--v', Math.min(1, v.orbits / Math.max(1e-9, v.minOrbits)).toFixed(3));
}

function toggleAbout(show) {
  const d = $('about');
  if (show) d.showModal(); else d.close();
}

// ─── live charts ────────────────────────────────────────────────────────────────────
// One point every `every` years of sim time, so the x axis is years whatever dt or the speed
// is. A frame that jumps past several points repeats the value (the line steps). Past 1200
// points the history halves and `every` doubles, so an hour-long run stays cheap to paint.
var UiPump = class UiPump {
  constructor() {
    this.every = 0.05;
    this.next = 0;
    this.s = { n: [], max: [], step: [], grav: [], coll: [], draw: [], fps: [], lz: [] };
    this.frame = 0;
    this.wire();
  }

  wire() {
    const s = this.s, dx = this.every;
    $('chN').data = { dx: dx, series: [{ label: 'bodies', values: s.n }] };
    $('chMax').data = { dx: dx, series: [{ label: 'Earth masses', values: s.max }] };
    $('chCost').data = { dx: dx, series: [
      { label: 'whole step', values: s.step }, { label: 'gravity', values: s.grav },
      { label: 'collisions', values: s.coll }, { label: 'drawing (per frame)', values: s.draw }] };
    $('chFps').data = { dx: dx, series: [{ label: 'fps', values: s.fps }] };
    $('chLz').data = { dx: dx, series: [{ label: 'digits', values: s.lz }] };
  }

  update() {}

  draw() {
    const yrs = world.t / TAU;
    $('clock').value = yrs * 12;
    if (yrs + 1e-9 >= this.next) {
      const st = world.stats(), s = this.s;
      const lz = Math.abs(st.LzDrift);
      while (this.next <= yrs + 1e-9) {
        s.n.push(st.n);
        s.max.push(st.maxMass / M_EARTH);
        s.step.push(st.msStep); s.grav.push(st.msGravity); s.coll.push(st.msCollide);
        s.draw.push(observer ? observer.drawMs : null);
        s.fps.push(gameEngine.fps > 0 ? gameEngine.fps : null);
        s.lz.push(lz > 0 ? -Math.log10(lz) : null);   // digits kept: 13 means |ΔL/L| ≈ 1e-13
        this.next += this.every;
      }
      if (s.n.length > 1200) this.halve();
    }
    if (++this.frame % 15 === 0) { refreshCheck(); }
    if (this.frame % 60 === 0) refreshEngineNote();
  }

  halve() {
    for (const k in this.s) {
      const a = this.s[k];
      for (let i = 0; 2 * i < a.length; i++) a[i] = a[2 * i];
      a.length = Math.ceil(a.length / 2);
    }
    this.every *= 2;
    this.next = this.s.n.length * this.every;
    this.wire();   // the same arrays, a new dx
  }
};

// ─── canvas size + pan/zoom ─────────────────────────────────────────────────────────
// The world takes the screen's height (minus the header and the bar under it) and up to
// 1.3× that in width, leaving at least ~400 px for the scenario card and the charts. Under
// the kit's 1100 px breakpoint the page is one column and the world takes the full width.
// The bar wraps to fit under the world, so its height depends on the world's width: size
// once with a guess, measure the bar, and size again if the guess was off.
function fitCanvas(barGuess) {
  const cv = $('gameWorld');
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cb-gap')) || 16;
  const head = document.querySelector('.top').offsetHeight;
  const bar = barGuess || 110;
  let W, H;
  if (window.innerWidth <= 1100) {
    W = window.innerWidth - 2 * gap;
    H = Math.min(Math.round(W * 0.8), window.innerHeight - head - bar - 3 * gap);
  } else {
    H = window.innerHeight - head - bar - 3 * gap;
    W = Math.min(window.innerWidth - 400 - 3 * gap, Math.round(H * 1.3));
    if (W < H) H = W;
  }
  cv.width = Math.max(300, Math.round(W));
  cv.height = Math.max(300, Math.round(H));
  const real = document.querySelector('.cb-sim-bar').offsetHeight;
  if (!barGuess && Math.abs(real - bar) > 4) fitCanvas(real);
}

function wireView() {
  const cv = $('gameWorld');
  let drag = null;
  // canvas pixels per CSS pixel (1 unless the stylesheet scales the canvas down)
  const ratio = () => cv.width / (cv.getBoundingClientRect().width || cv.width);
  cv.addEventListener('wheel', (e) => {
    if (!observer) return;
    e.preventDefault();
    const v = observer.view, rect = cv.getBoundingClientRect(), k = ratio();
    const sc = observer.scale(cv.width, cv.height);
    // keep the world point under the cursor fixed while zooming
    const mx = (e.clientX - rect.left) * k - cv.width / 2, my = (e.clientY - rect.top) * k - cv.height / 2;
    const wx = v.cx + mx / sc, wy = v.cy - my / sc;
    v.zoom = Math.min(200, Math.max(0.2, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    const sc2 = observer.scale(cv.width, cv.height);
    v.cx = wx - mx / sc2; v.cy = wy + my / sc2;
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('pointermove', (e) => {
    if (!drag || !observer) return;
    const sc = observer.scale(cv.width, cv.height) / ratio();
    observer.view.cx -= (e.clientX - drag.x) / sc;
    observer.view.cy += (e.clientY - drag.y) / sc;
    drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('dblclick', resetView);
  window.addEventListener('resize', () => fitCanvas());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target === document.body || e.target === cv)) { e.preventDefault(); togglePause(); }
  });
  // a theme change re-resolves the world's colours (the charts do their own)
  document.addEventListener('cb-theme', () => { if (observer) observer.setColors(worldColors()); });
}

function resetView() {
  if (!observer) return;
  observer.view.zoom = 1; observer.view.cx = 0; observer.view.cy = 0;
}

function setPausedLabel() { $('pauseBtn').textContent = gameEngine.paused ? 'Run' : 'Pause'; }

function togglePause() {
  gameEngine.paused = !gameEngine.paused;
  setPausedLabel();
}
