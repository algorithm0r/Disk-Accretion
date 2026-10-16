// Headless runner. Loads the SAME browser sim files into the MAIN V8 realm via indirect eval
// (NOT vm — conventions §4: vm adds a ~7-10x hot-loop tax on per-tick global reads, and a
// one-config-per-process runner never needs vm's sandbox isolation). One process = one config
// (any number of seeds); each run ships a self-describing packet (full PARAMETERS + samples)
// to MongoDB through the research Server (socket transport, the standard client) AND writes
// the same packet as local JSON, so analysis never depends on the DB being up.
//
//   node runner.mjs --name base --collection batch_001 --orbits 300 \
//        --set N=10000,diskMass=0.003,radiusInflation=30 [--seeds 1,2,3] \
//        [--snap 0.5,1,2] [--out analysis/runs/batch_001] [--transport socket|direct|none] \
//        [--max-min 60]
//
// Sampling is in ORBITS (at r = 1, i.e. t / 2π), log-spaced early (growth is fastest at the
// start) and every `--every` orbits after: each sample has the world stats, the full mass
// spectrum (masses are exact multiples of m₀, so a {k: count} histogram is lossless), and the
// unbound / big-body eccentricity counts, and (k, a, e) for every bound body ≥ 10 m₀. The final
// record lists every body's (k, a, e).
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createDB } = require('./src/db.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const indirectEval = eval; // aliased → indirect eval runs in the global (sloppy) realm
for (const f of ['util.js', 'params.js', 'gravity.js', 'collide.js', 'hybrid.js', 'world.js']) {
  let src = readFileSync(path.join(__dirname, 'src', f), 'utf8');
  src = src.replace(/^\s*(['"])use strict\1;?/, '');
  indirectEval(src);
}
const { World, TAU } = globalThis;
const P = globalThis.PARAMETERS;
process.title = 'Disk Accretion runner';

// --set k=v,k=v (numbers, booleans and strings), applied over the defaults
for (const kv of (flag('set', '') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k in P)) throw new Error('unknown parameter: ' + k);
  P[k] = v === 'true' ? true : v === 'false' ? false : (isNaN(+v) ? v : +v);
}
const name = flag('name', 'run');
const collection = flag('collection', 'scratch_runs');
const orbits = +flag('orbits', '100');
const every = +flag('every', '5');
const maxMin = +flag('max-min', '120');
const seeds = flag('seeds', String(P.seed)).split(',').map(Number);
const snaps = flag('snap', '').split(',').filter(Boolean).map(Number);
const outDir = path.resolve(__dirname, flag('out', path.join('analysis', 'runs', collection)));
const transport = flag('transport', 'socket');
mkdirSync(outDir, { recursive: true });

// sample times (orbits): 0, log-spaced 0.1 .. min(orbits, 20), then every `every` orbits
const times = new Set([0, orbits]);
for (let lg = -1; lg <= Math.log10(Math.min(orbits, 20)) + 1e-9; lg += 0.1) times.add(+Math.pow(10, lg).toFixed(3));
for (let t = every; t < orbits; t += every) times.add(t);
const sampleAt = [...times].filter((t) => t <= orbits).sort((a, b) => a - b);

function orbitalElements(w, i) {
  const x = w.x[i], y = w.y[i], vx = w.vx[i], vy = w.vy[i];
  const r = Math.hypot(x, y), E = 0.5 * (vx * vx + vy * vy) - 1 / r;
  const h = x * vy - y * vx;
  const a = E < 0 ? -1 / (2 * E) : Infinity;
  const e = Math.sqrt(Math.max(0, 1 + 2 * E * h * h));
  return { a, e, E };
}

function sample(w, orbit) {
  const s = w.stats();
  const spec = {};
  let unbound = 0, eBigSum = 0, nBigE = 0;
  const big = [];
  for (let i = 0; i < w.n; i++) {
    const k = Math.round(w.m[i] / w.m0);
    spec[k] = (spec[k] || 0) + 1;
    const el = orbitalElements(w, i);
    if (el.E >= 0) unbound++;
    if (k >= 100) { eBigSum += el.e; nBigE++; }
    if (k >= 10 && el.E < 0) big.push([k, +el.a.toFixed(5), +el.e.toFixed(4)]);
  }
  return {
    orbit, t: s.t, step: s.steps, n: s.n, maxK: Math.round(s.maxMassRatio), nBig: s.nBig,
    massAccreted: s.massAccreted / w.m0, massEjected: s.massEjected / w.m0,
    nAccreted: w.nAccreted, nEjected: w.nEjected, unbound, merges: s.merges,
    meanEBig: nBigE ? eBigSum / nBigE : null, LzDrift: s.LzDrift, massError: s.massError,
    spectrum: spec,
    // orbital elements of every bound body ≥ 10 m₀ (heaviest 400), for spacing vs time
    big: big.sort((p, q) => q[0] - p[0]).slice(0, 400),
  };
}

function snapshot(w, orbit) {
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return { orbit, x: Array.from(w.x.subarray(0, w.n), r6), y: Array.from(w.y.subarray(0, w.n), r6), k: Array.from(w.m.subarray(0, w.n), (m) => Math.round(m / w.m0)) };
}

const db = transport === 'none' ? null : createDB(Object.assign({}, P.db, { transport }));
for (const seed of seeds) {
  P.seed = seed;
  const run = name + '_s' + seed;
  const t0 = Date.now();
  const w = new World(P);
  const samples = [], snapList = [];
  let si = 0, sn = 0, capped = false;
  const snapAt = snaps.slice().sort((a, b) => a - b);
  for (;;) {
    const orbit = w.t / TAU;
    while (si < sampleAt.length && orbit >= sampleAt[si] - 1e-9) { samples.push(sample(w, +orbit.toFixed(4))); si++; }
    while (sn < snapAt.length && orbit >= snapAt[sn] - 1e-9) { snapList.push(snapshot(w, +orbit.toFixed(4))); sn++; }
    if (orbit >= orbits || w.n < 2) break;
    if ((Date.now() - t0) / 60000 > maxMin) { capped = true; samples.push(sample(w, +orbit.toFixed(4))); break; }
    w.step();
  }
  const bodies = [];
  for (let i = 0; i < w.n; i++) {
    const el = orbitalElements(w, i);
    bodies.push([Math.round(w.m[i] / w.m0), +el.a.toFixed(5), +el.e.toFixed(5)]);
  }
  bodies.sort((p, q) => q[0] - p[0]);
  const final = Object.assign(sample(w, +(w.t / TAU).toFixed(4)), { bodies: bodies.slice(0, 2000), capped,
    hybrid: w.hybrid ? Object.assign({}, w.hybrid.total) : null });   // encounter counters (Stage 6)
  delete final.spectrum; delete final.big;
  const wallSec = (Date.now() - t0) / 1000;
  const data = { project: 'Disk Accretion', run, collection, samples, final, snaps: snapList, wallSec, m0: w.m0, N0: w.cap };
  const pkt = db ? db.packet(P, data) : Object.assign({ _parameters: JSON.parse(JSON.stringify(P)), _ts: new Date().toISOString(), _run: run }, data);
  writeFileSync(path.join(outDir, run + '.json'), JSON.stringify(pkt));
  let saved = 'local only';
  if (db) {
    // the DB copy drops the position snapshots (they can be MBs; the local JSON keeps them)
    const slim = Object.assign({}, pkt, { snaps: snapList.map((s) => ({ orbit: s.orbit, n: s.k.length })) });
    try { const res = await db.insert(collection, slim); saved = 'db ' + JSON.stringify(res); }
    catch (e) { saved = 'db FAILED (' + e.message + '), local written'; }
  }
  console.log(run + ': orbits=' + final.orbit.toFixed(1) + (capped ? ' (wall cap)' : '') + ' n=' + final.n + ' maxK=' + final.maxK +
    ' nBig=' + final.nBig + ' acc=' + final.nAccreted + ' ej=' + final.nEjected + ' Lz=' + final.LzDrift.toExponential(2) +
    ' wall=' + wallSec.toFixed(0) + 's  ' + saved);
}
if (db) await db.close();
process.exit(0);
