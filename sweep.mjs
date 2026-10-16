// Stage 3 batch launcher: runs runner.mjs configs as parallel child processes (one process
// per config × seed, conventions §4) and writes each packet to MongoDB (collection batch_NNN
// via the research Server) and to analysis/runs/<batch>/<run>.json.
//   node sweep.mjs <plan>[+<plan>...] [--jobs 16] [--dry]   (plans: base mass inflation toomre base3k mass3k all)
//
// Run-name grammar: <exp>_M<diskMass>_I<inflation>[r<ramp q>]_N<N>_s<seed>
//   batch_001  base       default disk, 4 seeds, 1000 orbits: growth modes + final spacing
//   batch_002  mass       disk mass 1e-4 … 1e-1 (Toomre Q at r = 1 from ~280 down to ~0.3)
//   batch_003  inflation  radius inflation 1 … 100, plus inflation that fades as bodies grow
//   batch_004  toomre     collisions off, disk mass 0.003 … 0.1: does a Q < 1 disk clump?
//   batch_005  base3k     batch_001's configs to 3000 orbits, big-body (k, a, e) every sample
//   batch_006  mass3k     batch_002's configs to 3000 orbits, likewise
import { spawn } from 'child_process';
import { mkdirSync, createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const which = argv[0] || 'all';
const jobs = +flag('jobs', '16');
const dry = argv.includes('--dry');

const fmt = (v) => String(v).replace('.', 'p');
function cfg(batch, exp, set, opts) {
  const tag = exp + '_M' + fmt(set.diskMass) + '_I' + fmt(set.radiusInflation) + (set.inflationRamp ? 'r' + fmt(set.inflationRamp) : '') + (set.collisions === false ? '_nocoll' : '') + '_N' + set.N;
  return Object.assign({ batch, name: tag, set }, opts);
}

const PLANS = {
  base: () => [1, 2, 3, 4].map((s) => Object.assign(
    cfg('batch_001', 'base', { N: 10000, diskMass: 0.003, radiusInflation: 30 }, { orbits: 1000, every: 5, snap: '0,1,3,10,30,100,300,1000', maxMin: 120 }),
    { seeds: String(s) })),
  mass: () => {
    const out = [];
    for (const M of [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1]) {
      for (const s of [1, 2]) out.push(Object.assign(
        cfg('batch_002', 'mass', { N: 5000, diskMass: M, radiusInflation: 30 }, { orbits: 1000, every: 10, snap: '0,0.5,1,2,5,20,100', maxMin: 90 }),
        { seeds: String(s) }));
    }
    return out;
  },
  inflation: () => {
    const out = [];
    const variants = [[1, 0], [3, 0], [10, 0], [30, 0], [100, 0], [30, 1], [100, 1]];
    for (const [f, q] of variants) {
      for (const s of [1, 2]) out.push(Object.assign(
        cfg('batch_003', 'infl', { N: 5000, diskMass: 0.003, radiusInflation: f, inflationRamp: q }, { orbits: 1000, every: 10, snap: '0,10,100,1000', maxMin: 90 }),
        { seeds: String(s) }));
    }
    return out;
  },
};
  // collisions OFF: pure self-gravity, so Toomre-unstable structure shows instead of merging away
PLANS.toomre = () => [0.003, 0.01, 0.03, 0.1].map((M) => Object.assign(
  cfg('batch_004', 'toomre', { N: 10000, diskMass: M, radiusInflation: 30, collisions: false }, { orbits: 3, every: 1, snap: '0,0.25,0.5,0.75,1,1.5,2,3', maxMin: 30 }),
  { seeds: '1' }));
// second pass (2026-10-15): the same base and mass configs run to 3000 orbits with per-sample
// big-body orbital elements (batch_001/002 sampled only the final state's a, e)
PLANS.base3k = () => [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => Object.assign(PLANS.base()[0], { batch: 'batch_005', orbits: 3000, every: 10, snap: '0,1,3,10,30,100,300,1000,3000', seeds: String(sd) }));
PLANS.mass3k = () => PLANS.mass().map((c) => Object.assign(c, { batch: 'batch_006', orbits: 3000, every: 10 }));
PLANS.all = () => [...PLANS.base(), ...PLANS.mass(), ...PLANS.inflation(), ...PLANS.toomre()];

const plan = which.split('+').flatMap((w) => PLANS[w]());
// longest-first: heavy-N, low-growth configs hold the pool longest
plan.sort((a, b) => (b.maxMin - a.maxMin) || (b.set.N - a.set.N));
const logDir = path.join(__dirname, 'analysis', 'logs');
mkdirSync(logDir, { recursive: true });
console.log('Disk Accretion sweep: ' + plan.length + ' runs, ' + jobs + ' at a time' + (dry ? ' (dry)' : ''));

let next = 0, running = 0, done = 0;
const t0 = Date.now();
await new Promise((resolveAll) => {
  const launch = () => {
    while (running < jobs && next < plan.length) {
      const c = plan[next++];
      const set = Object.entries(c.set).map(([k, v]) => k + '=' + v).join(',');
      const args = ['runner.mjs', '--name', c.name, '--collection', c.batch, '--orbits', String(c.orbits),
        '--every', String(c.every), '--set', set, '--seeds', c.seeds, '--snap', c.snap, '--max-min', String(c.maxMin),
        '--out', path.join('analysis', 'runs', c.batch)];
      const label = c.name + '_s' + c.seeds;
      if (dry) { console.log('  node ' + args.join(' ')); done++; continue; }
      running++;
      const log = createWriteStream(path.join(logDir, label + '.log'));
      const child = spawn(process.execPath, args, { cwd: __dirname });
      child.stdout.pipe(log); child.stderr.pipe(log);
      child.stdout.on('data', (d) => process.stdout.write('[' + ((Date.now() - t0) / 60000).toFixed(1) + 'm] ' + d));
      child.on('exit', (code) => {
        running--; done++;
        if (code) console.log('[' + ((Date.now() - t0) / 60000).toFixed(1) + 'm] ' + label + ' EXIT ' + code);
        if (done === plan.length) resolveAll(); else launch();
      });
    }
    if (dry && done === plan.length) resolveAll();
  };
  launch();
});
console.log('sweep done: ' + plan.length + ' runs in ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
