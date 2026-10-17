// Worker-pool benchmark, headless. Runs full sim steps (World.updateAsync) with the body-body
// force from a pool of worker_threads running the SAME worker code as the browser pool
// (GravityPool.workerMain + the BarnesHut class, stringified), so it measures the pool's real
// parallel scaling on this CPU without the browser pane's background throttling.
//   node bench-pool.mjs [--workers 4,8,12,16] [--ns 10000,20000,40000,100000] [--spf 4]
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { Worker } from 'worker_threads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indirectEval = eval;
for (const f of ['util.js', 'params.js', 'gravity.js', 'collide.js', 'hybrid.js', 'world.js', 'presets.js', 'pool.js']) {
  indirectEval(readFileSync(path.join(__dirname, 'src', f), 'utf8').replace(/^\s*(['"])use strict\1;?/, ''));
}
process.title = 'Disk Accretion bench-pool';
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const workerCounts = flag('workers', '1,4,8,12,16').split(',').map(Number);
const ns = flag('ns', '10000,20000,40000,100000').split(',').map(Number);
const spf = +flag('spf', 4), drawMs = +flag('draw-ms', 1.5), steps = +flag('steps', 12);

// worker source: a browser-worker shim over worker_threads + the browser pool's own code
const SRC = [
  'const { parentPort } = require("worker_threads");',
  'var postMessage = (m, t) => parentPort.postMessage(m, t);',
  'var BH_LEAF_CAP = ' + globalThis.BH_LEAF_CAP + ';',
  'var BarnesHut = ' + globalThis.BarnesHut.toString() + ';',
  '(function ' + globalThis.GravityPool.workerMain.toString() + ')();',
  'parentPort.on("message", (d) => onmessage({ data: d }));',
].join('\n');

class NodePool {
  constructor(W) { this.name = 'workers×' + W; this.workers = Array.from({ length: W }, () => new Worker(SRC, { eval: true })); }
  selfAccel(world) {
    const P = world.P, n = world.n, W = this.workers.length;
    const buf = new Float64Array(3 * n);
    buf.set(world.x.subarray(0, n), 0); buf.set(world.y.subarray(0, n), n); buf.set(world.m.subarray(0, n), 2 * n);
    const ax = world.ax, ay = world.ay;
    return Promise.all(this.workers.map((w, k) => new Promise((resolve) => {
      w.once('message', (d) => {
        const idx = d.idx, out = d.out;
        for (let s = 0; s < idx.length; s++) { const b = idx[s]; ax[b] = out[2 * s]; ay[b] = out[2 * s + 1]; }
        resolve(d.inter);
      });
      w.postMessage({ buf, n, k, W, theta: P.theta, eps2: P.softening * P.softening, group: P.bhGroup || 32 });
    }))).then((p) => p.reduce((a, b) => a + b, 0));
  }
  dispose() { return Promise.all(this.workers.map((w) => w.terminate())); }
}

const BASE = JSON.parse(JSON.stringify(globalThis.PARAMETERS));
console.log('Disk Accretion bench-pool — node ' + process.version + ', spf=' + spf + ', draw=' + drawMs + ' ms');
const rows = [];
for (const N of ns) {
  for (const W of [0, ...workerCounts]) {
    const P = Object.assign(JSON.parse(JSON.stringify(BASE)), { N });
    const world = new globalThis.World(P);
    const pool = W ? new NodePool(W) : null;
    world.provider = pool;
    for (let s = 0; s < 3; s++) await world.updateAsync();
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) await world.updateAsync();
    const ms = (performance.now() - t0) / steps;
    if (pool) await pool.dispose();
    const fps = 1000 / (spf * ms + drawMs);
    rows.push({ N, W, ms });
    console.log('  N=' + String(N).padStart(6) + '  ' + (W ? ('workers×' + W).padEnd(11) : 'serial     ') +
      ms.toFixed(2).padStart(7) + ' ms/step (grav ' + world.timing.gravity.toFixed(2) + ', coll ' + world.timing.collide.toFixed(2) + ')' +
      '  → ' + fps.toFixed(1).padStart(5) + ' fps at ' + spf + ' spf, ' + (1000 / (ms + drawMs)).toFixed(1).padStart(5) + ' at 1 spf');
  }
}
