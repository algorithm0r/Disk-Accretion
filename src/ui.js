'use strict';
// ALL DOM lives here (and in index.html). The sim classes never touch the document, which
// is what lets the same files run headlessly. Builds the control panel from PARAM_SCHEMA
// (writing changes straight back into PARAMETERS), runs the live readouts, sizes the
// canvas, and wires mouse pan/zoom to the observer's view.

var M_EARTH = 3.003e-6;   // Earth mass in M_star (= M_sun) units, for the readouts

function fmtNum(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(2);
  return (a >= 100) ? v.toFixed(0) : (a >= 10 ? v.toFixed(1) : v.toFixed(3));
}

function buildControls() {
  const panel = document.getElementById('controls');
  for (const spec of PARAM_SCHEMA) {
    const wrap = document.createElement('label');
    wrap.className = 'ctl';
    const head = document.createElement('div');
    head.className = 'ctl-head';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const val = document.createElement('span');
    val.className = 'ctl-val';
    head.appendChild(name); head.appendChild(val);
    wrap.appendChild(head);

    const apply = () => {
      if (spec.resets) reset();
      else if (spec.live === 'radii' && world) world.updateRadii();
    };

    if (spec.options) {
      const sel = document.createElement('select');
      for (const o of spec.options) { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); }
      sel.value = PARAMETERS[spec.key];
      sel.onchange = () => { PARAMETERS[spec.key] = sel.value; apply(); };
      wrap.appendChild(sel);
    } else if (spec.type === 'bool') {
      wrap.classList.add('ctl-bool');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!PARAMETERS[spec.key];
      cb.onchange = () => { PARAMETERS[spec.key] = cb.checked; apply(); };
      head.insertBefore(cb, name);
    } else {
      const input = document.createElement('input');
      input.type = 'range';
      // log sliders move in log10 space
      const toSlider = (v) => spec.log ? Math.log10(v) : v;
      const fromSlider = (s) => {
        let v = spec.log ? Math.pow(10, s) : s;
        if (spec.round) v = Math.round(v);
        return v;
      };
      if (spec.log) { input.min = Math.log10(spec.min); input.max = Math.log10(spec.max); input.step = 0.01; }
      else { input.min = spec.min; input.max = spec.max; input.step = spec.step; }
      input.value = toSlider(PARAMETERS[spec.key]);
      const show = () => { val.textContent = spec.round ? PARAMETERS[spec.key].toLocaleString() : fmtNum(PARAMETERS[spec.key]); };
      show();
      input.oninput = () => {
        PARAMETERS[spec.key] = fromSlider(parseFloat(input.value));
        show();
        if (!spec.resets) apply();   // live params apply while dragging
      };
      // rebuilding the disk waits for the release, not every drag tick
      if (spec.resets) input.onchange = apply;
      wrap.appendChild(input);
    }
    panel.appendChild(wrap);
  }
}

// ─── readouts ───────────────────────────────────────────────────────────────────────
var READOUT_ROWS = [
  ['N alive', (s) => s.n.toLocaleString() + ' / ' + Math.round(PARAMETERS.N).toLocaleString()],
  ['Largest body', (s) => fmtNum(s.maxMassRatio) + ' m₀  (' + fmtNum(s.maxMass / M_EARTH) + ' M⊕)'],
  ['Bodies ≥ 100 m₀', (s) => String(s.nBig)],
  ['L_z drift', (s) => s.LzDrift.toExponential(2)],
  ['Mass error', (s) => s.massError.toExponential(1)],
  ['Accreted / ejected', (s) => fmtNum(s.massAccreted / M_EARTH) + ' / ' + fmtNum(s.massEjected / M_EARTH) + ' M⊕'],
  ['Time', (s) => s.orbits.toFixed(1) + ' orbits @ r=1'],
  ['Gravity', (s) => s.gravityMode + (s.gravityMode !== PARAMETERS.gravity ? ' (brute capped at ' + PARAMETERS.bruteMaxN + ')' : '')],
  ['ms / step', (s) => s.msStep.toFixed(2) + '  (grav ' + s.msGravity.toFixed(2) + ', coll ' + s.msCollide.toFixed(2) + ')'],
  ['ms / draw', () => (observer ? observer.drawMs.toFixed(2) : '–')],
  ['fps', () => gameEngine.fps.toFixed(1) + (gameEngine.paused ? '  (paused)' : '')],
];

function buildReadouts() {
  const box = document.getElementById('readouts');
  box.innerHTML = '';
  for (const [label] of READOUT_ROWS) {
    const row = document.createElement('div');
    row.className = 'ro';
    const a = document.createElement('span'); a.textContent = label;
    const b = document.createElement('span'); b.className = 'ro-val';
    row.appendChild(a); row.appendChild(b);
    box.appendChild(row);
  }
  setInterval(refreshReadouts, 250);
}

function refreshReadouts() {
  if (!world) return;
  const s = world.stats();
  const vals = document.querySelectorAll('#readouts .ro-val');
  READOUT_ROWS.forEach(([, f], i) => { vals[i].textContent = f(s); });
}

function setStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
}

function setPausedLabel() {
  document.getElementById('pauseBtn').textContent = gameEngine.paused ? 'Run' : 'Pause';
}

// ─── canvas size + pan/zoom ─────────────────────────────────────────────────────────
function fitCanvas() {
  const cv = document.getElementById('gameWorld');
  const panel = document.getElementById('controlPanel');
  cv.width = Math.max(200, window.innerWidth - panel.offsetWidth);
  cv.height = Math.max(200, window.innerHeight);
  if (typeof placeGraphs === 'function') placeGraphs();
}

function wireView() {
  const cv = document.getElementById('gameWorld');
  let drag = null;
  cv.addEventListener('wheel', (e) => {
    if (!observer) return;
    e.preventDefault();
    const v = observer.view, rect = cv.getBoundingClientRect();
    const sc = observer.scale(cv.width, cv.height);
    // keep the world point under the cursor fixed while zooming
    const mx = e.clientX - rect.left - cv.width / 2, my = e.clientY - rect.top - cv.height / 2;
    const wx = v.cx + mx / sc, wy = v.cy - my / sc;
    v.zoom = Math.min(200, Math.max(0.2, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    const sc2 = observer.scale(cv.width, cv.height);
    v.cx = wx - mx / sc2; v.cy = wy + my / sc2;
  }, { passive: false });
  cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup', () => { drag = null; });
  window.addEventListener('mousemove', (e) => {
    if (!drag || !observer) return;
    const sc = observer.scale(cv.width, cv.height);
    observer.view.cx -= (e.clientX - drag.x) / sc;
    observer.view.cy += (e.clientY - drag.y) / sc;
    drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('dblclick', resetView);
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); togglePause(); }
  });
}

function resetView() {
  if (!observer) return;
  observer.view.zoom = 1; observer.view.cx = 0; observer.view.cy = 0;
}

function togglePause() {
  gameEngine.paused = !gameEngine.paused;
  setPausedLabel();
}
