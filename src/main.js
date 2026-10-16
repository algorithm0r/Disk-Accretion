'use strict';
// Browser entry + wiring (not loaded headlessly). reset() rebuilds the disk from the
// current PARAMETERS; the boot sequence is straight — no AssetManager gate.
var gameEngine, world, observer, dataManager, db, graphs;
var provider = null;   // async body-body force provider for the 'workers' / 'gpu' backends

// swap the force backend; the provider outlives resets, so a rebuild keeps it
async function setBackend(kind) {
  if (provider) { provider.dispose(); provider = null; }
  try {
    if (kind === 'workers') provider = new GravityPool(PARAMETERS.workers);
    else if (kind === 'gpu') provider = await GpuGravity.create();
  } catch (e) {
    setStatus('backend ' + kind + ' unavailable: ' + e.message + ' (using cpu)');
    PARAMETERS.backend = 'cpu';
    provider = null;
  }
  if (world) world.provider = provider;
}

// the two live graphs sit in the canvas's lower-left corner
function placeGraphs() {
  if (!graphs) return;
  const H = gameEngine.ctx.canvas.height;
  graphs.n.x = 10; graphs.n.y = H - 170;
  graphs.maxMass.x = 10; graphs.maxMass.y = H - 85;
}

function reset() {
  const view = observer ? observer.view : null;   // keep the camera across rebuilds
  gameEngine.clear();
  world = new World(PARAMETERS);
  world.provider = provider;
  observer = new Observer(world);
  if (view) observer.view = view;
  graphs = {
    n: new LineGraph(10, 0, 220, 75, 'log₁₀ N alive'),
    maxMass: new LineGraph(10, 0, 220, 75, 'log₁₀ largest / m₀'),
  };
  placeGraphs();
  db = createDB(PARAMETERS.db);
  dataManager = new DataManager(world, db, graphs);
  dataManager.sample();
  gameEngine.add(world);
  gameEngine.add(observer);
  gameEngine.add(dataManager);
  gameEngine.add(graphs.n);
  gameEngine.add(graphs.maxMass);
  setStatus(world.n.toLocaleString() + ' bodies, m₀ = ' + (world.m0 / M_EARTH).toExponential(2) + ' M⊕');
}

window.onload = function () {
  const canvas = document.getElementById('gameWorld');
  gameEngine = new GameEngine();
  gameEngine.init(canvas.getContext('2d'));
  buildControls();
  buildReadouts();
  fitCanvas();
  wireView();
  reset();
  gameEngine.start();
};
