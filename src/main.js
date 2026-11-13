'use strict';
// Browser entry + wiring (not loaded headlessly). reset() rebuilds the disk from the
// current PARAMETERS; the boot sequence is straight — no AssetManager gate.
var gameEngine, world, observer, dataManager, db, uiPump;
var provider = null;   // async body-body force provider for the 'workers' / 'gpu' backends
var presetTracker = null;   // the current preset's measurement (presets.js), fed every few steps

// swap the force backend; the provider outlives resets, so a rebuild keeps it
async function setBackend(kind) {
  if (provider) { provider.dispose(); provider = null; }
  try {
    if (kind === 'workers') provider = new GravityPool(PARAMETERS.workers);
    else if (kind === 'gpu') provider = await GpuGravity.create();
  } catch (e) {
    // e.g. no WebGPU in this browser, or Workers blocked: fall back to the main thread
    notify('The ' + kind + ' backend is not available here', e.message + ' Using the cpu.');
    PARAMETERS.backend = 'cpu';
    provider = null;
    syncControl('backend');
  }
  if (world) world.provider = provider;
}

function reset() {
  const view = observer ? observer.view : null;   // keep the camera across rebuilds
  gameEngine.clear();
  world = new World(PARAMETERS);
  world.provider = provider;
  observer = new Observer(world, worldColors());
  if (view) observer.view = view;
  db = createDB(PARAMETERS.db);
  dataManager = new DataManager(world, db);
  dataManager.sample();
  gameEngine.add(world);
  gameEngine.add(observer);
  gameEngine.add(dataManager);
  const pre = PRESETS[PARAMETERS.preset];
  presetTracker = pre ? new pre.Tracker() : null;
  if (presetTracker) {
    presetTracker.track(world);
    gameEngine.add({ update: () => { if (world.steps % 5 === 0) presetTracker.track(world); } });
  }
  uiPump = new UiPump();
  gameEngine.add(uiPump);
  refreshCheck();
  refreshEngineNote();
  const isDisk = PARAMETERS.preset === 'disk' || PARAMETERS.preset === 'toomre';
  setStatus(world.n.toLocaleString() + ' bodies' + (isDisk ? ', each starting at ' + fmtNum(world.m0 / M_EARTH) + ' Earth masses' : '') + '.');
}

window.onload = function () {
  $('themePicker').appendChild(CB.theme.picker());
  const canvas = $('gameWorld');
  gameEngine = new GameEngine();
  gameEngine.init(canvas.getContext('2d'));
  // a link can name the scenario: index.html#trojans
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (PRESETS[fromHash]) Object.assign(PARAMETERS, PRESETS[fromHash].params, { preset: fromHash });
  buildPresetPicker();
  buildControls();
  fitCanvas();
  wireView();
  reset();
  gameEngine.start();
};
