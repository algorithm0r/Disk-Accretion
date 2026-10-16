// Stage 3 batch launcher: runs runner.mjs configs as parallel child processes (one process
// per config × seed, conventions §4) and writes each packet to MongoDB (collection batch_NNN
// via the research Server) and to analysis/runs/<batch>/<run>.json.
//   node sweep.mjs <plan>[+<plan>...] [--jobs 16] [--dry]   (plans: base mass inflation toomre base3k mass3k all;
//   Stage 5: infl4 infl005 infl0025 base005 base0025 dtconv; Stage 6: hyb01 hyb005 hyb0025 hybconv hybmore)
//
// Run-name grammar: <exp>_M<diskMass>_I<inflation>[r<ramp q>]_N<N>_s<seed>
//   batch_001  base       default disk, 4 seeds, 1000 orbits: growth modes + final spacing
//   batch_002  mass       disk mass 1e-4 … 1e-1 (Toomre Q at r = 1 from ~280 down to ~0.3)
//   batch_003  inflation  radius inflation 1 … 100, plus inflation that fades as bodies grow
//   batch_004  toomre     collisions off, disk mass 0.003 … 0.1: does a Q < 1 disk clump?
//   batch_005  base3k     batch_001's configs to 3000 orbits, big-body (k, a, e) every sample
//   batch_006  mass3k     batch_002's configs to 3000 orbits, likewise
// Stage 5 (dt-convergence; run names gain _dt<dt>; the integrator is chaotic, so compare
// ensembles across dt, not seed against seed):
//   batch_007  infl4      batch_003's configs, seeds 3-4 at dt = 0.01 (003 + 007 = 4 seeds)
//   batch_008  infl005    batch_003's configs, 4 seeds, dt = 0.005
//   batch_009  infl0025   batch_003's configs, 4 seeds, dt = 0.0025
//   batch_010  base005    batch_005's config, 8 seeds, 3000 orbits, dt = 0.005
//   batch_011  base0025   batch_005's config, 8 seeds, 3000 orbits, dt = 0.0025
// Stage 6 (integrator: 'hybrid'; run names gain _hyb):
//   batch_012  hyb01      f = 1, 3, 10 and both fading ramps (4 seeds) + the default disk (8 seeds), dt = 0.01
//   batch_013  hyb005     the same at dt = 0.005
//   batch_014  hyb0025    the same at dt = 0.0025
//   batch_015/016/017  hyb01b/hyb005b/hyb0025b (= hybmore): swept contacts; f = 1, 3 seeds 1–8
//              (supersede 012–014 for those two), f = 10 and both ramps seeds 5–8
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
  const tag = exp + '_M' + fmt(set.diskMass) + '_I' + fmt(set.radiusInflation) + (set.inflationRamp ? 'r' + fmt(set.inflationRamp) : '') + (set.collisions === false ? '_nocoll' : '') + '_N' + set.N + (set.dt ? '_dt' + fmt(set.dt) : '');
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
// Stage 5: the same configs at smaller dt. Step count, and so wall time and the wall cap, scale as 1/dt;
// `cost` (est. seconds, uncontended) orders the queue so the slowest runs start first.
const INFL_COST = { '1,0': 550, '3,0': 155, '10,0': 73, '30,0': 42, '100,0': 31, '30,1': 67, '100,1': 40 };
const atDt = (c, batch, dt, seed) => Object.assign({}, c, { batch, seeds: String(seed), set: Object.assign({}, c.set, { dt }),
  name: c.name + '_dt' + fmt(dt), maxMin: Math.ceil(c.maxMin * 0.01 / dt), cost: (c.cost || 150) * 0.01 / dt });
const inflAt = (batch, dt, seeds) => {
  const out = [];
  for (const c of PLANS.inflation().filter((c) => c.seeds === '1')) {
    c.cost = INFL_COST[c.set.radiusInflation + ',' + c.set.inflationRamp];
    for (const sd of seeds) out.push(dt === 0.01 ? Object.assign({}, c, { batch, seeds: String(sd) }) : atDt(c, batch, dt, sd));
  }
  return out;
};
const baseAt = (batch, dt) => PLANS.base3k().map((c) => atDt(c, batch, dt, c.seeds));
PLANS.infl4 = () => inflAt('batch_007', 0.01, [3, 4]);
PLANS.infl005 = () => inflAt('batch_008', 0.005, [1, 2, 3, 4]);
PLANS.infl0025 = () => inflAt('batch_009', 0.0025, [1, 2, 3, 4]);
PLANS.base005 = () => baseAt('batch_010', 0.005);
PLANS.base0025 = () => baseAt('batch_011', 0.0025);
PLANS.dtconv = () => [...PLANS.infl4(), ...PLANS.infl005(), ...PLANS.infl0025(), ...PLANS.base005(), ...PLANS.base0025()];
// Stage 6: the hybrid integrator (src/hybrid.js) on the configs Stage 5 could not converge (f = 1, 3
// and both fading ramps) plus f = 10 as a control, 4 seeds, and the default disk, 8 seeds; one batch
// per dt. Run names gain _hyb. The hybrid costs ~2.2× leapfrog per step (DEVLOG), so cost ×2.5.
const hyb = (c) => Object.assign({}, c, { name: c.name.replace(/_dt[0-9p]+$/, '') + '_hyb' + (c.set.dt ? '_dt' + fmt(c.set.dt) : ''),
  set: Object.assign({}, c.set, { integrator: 'hybrid' }), cost: (c.cost || 150) * 2.5, maxMin: 900 });
const HOT = (c) => [1, 3, 10].includes(c.set.radiusInflation) && !c.set.inflationRamp || c.set.inflationRamp;
const hybAt = (batch, dt) => [
  ...inflAt(batch, dt, [1, 2, 3, 4]).filter(HOT).map(hyb),
  ...PLANS.base3k().map((c) => hyb(dt === 0.01 ? Object.assign({}, c, { batch, cost: 150 }) : atDt(c, batch, dt, c.seeds))),
];
PLANS.hyb01 = () => hybAt('batch_012', 0.01);
PLANS.hyb005 = () => hybAt('batch_013', 0.005);
PLANS.hyb0025 = () => hybAt('batch_014', 0.0025);
PLANS.hybconv = () => [...PLANS.hyb01(), ...PLANS.hyb005(), ...PLANS.hyb0025()];
// Stage 6 follow-up: contact is swept over each encounter substep (hybrid.js sweptContact). Reruns
// f = 1 and f = 3 (the configs with > 0.1% contacts left to the end-of-step grid before it) at seeds
// 1–8, superseding them in batch_012–014, and adds seeds 5–8 to f = 10 and both ramps.
const hybMore = (batch, dt) => inflAt(batch, dt, [1, 2, 3, 4, 5, 6, 7, 8]).filter(HOT).map(hyb)
  .filter((c) => (!c.set.inflationRamp && c.set.radiusInflation <= 3) || +c.seeds >= 5);
PLANS.hyb01b = () => hybMore('batch_015', 0.01);
PLANS.hyb005b = () => hybMore('batch_016', 0.005);
PLANS.hyb0025b = () => hybMore('batch_017', 0.0025);
PLANS.hybmore = () => [...PLANS.hyb01b(), ...PLANS.hyb005b(), ...PLANS.hyb0025b()];
PLANS.all = () => [...PLANS.base(), ...PLANS.mass(), ...PLANS.inflation(), ...PLANS.toomre()];

const plan = which.split('+').flatMap((w) => PLANS[w]());
// longest-first: heavy-N, low-growth configs hold the pool longest
plan.sort((a, b) => ((b.cost || 0) - (a.cost || 0)) || (b.maxMin - a.maxMin) || (b.set.N - a.set.N));
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
