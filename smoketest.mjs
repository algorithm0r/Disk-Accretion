// No-DB sanity run. Asserts the physics invariants and prints the numbers that belong in the
// DEVLOG entry (proof coupled to log). Exits non-zero on any failure.
//   node smoketest.mjs
//
// Loads the SAME browser sim files into the MAIN V8 realm via indirect eval (NOT vm).
// Everything in src/ is `var` / `function` / `var X = class X`, so once the leading
// 'use strict' directive is stripped the top-level names attach to globalThis and read as
// fast native globals. Main-realm (not vm) because vm adds a ~7-10x hot-loop tax on per-tick
// global reads (e.g. PARAMETERS.*) and a one-config run never needs vm's isolation — see
// ~/.claude/conventions.md §4.
//
// Checks:
//   1. merge: one collision conserves mass, momentum and (orbital + spin) L_z exactly
//   2. brute-force run with collisions: mass closes (disk + star + ejected), L_z to round-off,
//      N never increases, and bodies actually merge
//   3. Barnes-Hut run with collisions over several orbits: same, L_z within tolerance
//   4. collisions off: energy conserved by the leapfrog (merging dissipates it otherwise);
//      star-only tight, self-gravity converging with dt
//   5. Barnes-Hut force vs brute force at small N: θ = 0 exact, θ = 0.6 within tolerance,
//      error shrinks as θ shrinks, for both the grouped and the plain walk
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indirectEval = eval; // aliased → runs in the global (sloppy) realm, so `var` leaks to globalThis
for (const f of ['util.js', 'params.js', 'gravity.js', 'collide.js', 'world.js']) {
  let src = readFileSync(path.join(__dirname, 'src', f), 'utf8');
  src = src.replace(/^\s*(['"])use strict\1;?/, ''); // strip directive so declarations leak to global
  indirectEval(src);
}
const { World, BarnesHut, bruteForceAccel, TAU } = globalThis;
const BASE = JSON.parse(JSON.stringify(globalThis.PARAMETERS));
const params = (over) => Object.assign(JSON.parse(JSON.stringify(BASE)), over);

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!ok) failures++;
}
const e = (v) => v.toExponential(2);

// run a world for `orbits` orbits at r = 1, tracking N monotonicity and the worst L_z drift
function evolve(P, orbits) {
  const w = new World(P);
  const steps = Math.round(orbits * TAU / P.dt);
  let nPrev = w.n, monotone = true, worstLz = 0;
  const t0 = performance.now();
  for (let s = 0; s < steps; s++) {
    w.step();
    if (w.n > nPrev) monotone = false;
    nPrev = w.n;
    if (s % 50 === 0 || s === steps - 1) worstLz = Math.max(worstLz, Math.abs(w.stats().LzDrift));
  }
  return { w, s: w.stats(), monotone, worstLz, steps, sec: (performance.now() - t0) / 1000 };
}

// ─── 1. a single merge ─────────────────────────────────────────────────────────────
{
  const w = new World(params({ N: 2, collisions: false }));
  w.x[0] = 1; w.y[0] = 0; w.vx[0] = 0.01; w.vy[0] = 1;
  w.x[1] = 1.0005; w.y[1] = 0.0003; w.vx[1] = -0.02; w.vy[1] = 0.97;
  w.m[0] = 2e-6; w.m[1] = 5e-7;
  const mom = (k) => [w.m[k] * w.vx[k], w.m[k] * w.vy[k]];
  const L = (k) => w.m[k] * (w.x[k] * w.vy[k] - w.y[k] * w.vx[k]) + w.spin[k];
  const M0 = w.m[0] + w.m[1], P0 = [mom(0)[0] + mom(1)[0], mom(0)[1] + mom(1)[1]], L0 = L(0) + L(1);
  const k = w.merge(0, 1);
  const dM = Math.abs(w.m[k] - M0) / M0;
  const dP = Math.hypot(mom(k)[0] - P0[0], mom(k)[1] - P0[1]) / Math.hypot(P0[0], P0[1]);
  const dL = Math.abs(L(k) - L0) / Math.abs(L0);
  check('merge conserves mass, momentum, L_z', k === 0 && dM < 1e-15 && dP < 1e-14 && dL < 1e-14 && w.spin[k] !== 0,
    'dM=' + e(dM) + ' dP=' + e(dP) + ' dL=' + e(dL) + ' spin=' + e(w.spin[k]));
}

// ─── 2. brute force, with collisions ───────────────────────────────────────────────
const brute = evolve(params({ N: 600, gravity: 'brute', radiusInflation: 60 }), 2);
console.log('     brute N=600, 2 orbits (' + brute.steps + ' steps, ' + brute.sec.toFixed(1) + ' s): n=' + brute.s.n +
  ' merges=' + brute.s.merges + ' maxM/m0=' + brute.s.maxMassRatio.toFixed(1) +
  ' accreted=' + e(brute.s.massAccreted) + ' ejected=' + e(brute.s.massEjected));
check('brute: mass closes (disk + star + ejected)', Math.abs(brute.s.massError) < 1e-12, 'err=' + e(brute.s.massError));
check('brute: L_z conserved to round-off', brute.worstLz < 1e-11, 'worst |dL/L|=' + e(brute.worstLz));
check('brute: N non-increasing, merges happen', brute.monotone && brute.s.merges > 0 && brute.s.n < 600,
  'n 600 -> ' + brute.s.n);

// ─── 3. Barnes-Hut, with collisions, several orbits ──────────────────────────────────
const bh = evolve(params({ N: 3000, gravity: 'bh' }), 4);
console.log('     bh N=3000, 4 orbits (' + bh.steps + ' steps, ' + bh.sec.toFixed(1) + ' s): n=' + bh.s.n +
  ' merges=' + bh.s.merges + ' maxM/m0=' + bh.s.maxMassRatio.toFixed(1) + ' nBig=' + bh.s.nBig +
  ' ms/step=' + bh.s.msStep.toFixed(2));
check('bh: mass closes (disk + star + ejected)', Math.abs(bh.s.massError) < 1e-12, 'err=' + e(bh.s.massError));
check('bh: |dL_z/L_z| < 1e-5 over 4 orbits', bh.worstLz < 1e-5, 'worst=' + e(bh.worstLz));
check('bh: N non-increasing, bodies grow', bh.monotone && bh.s.n < 3000 && bh.s.maxMassRatio > 5,
  'n 3000 -> ' + bh.s.n + ', maxM/m0=' + bh.s.maxMassRatio.toFixed(1));

// ─── 4. energy with collisions off (exact O(N²) energy, brute gravity) ──────────────────
// Star-only orbits must hold energy tightly. With self-gravity, fixed-dt leapfrog under-resolves
// the closest softened encounters (ε = 1e-3 is passed in ~a step at v_rel ~ 0.1), which costs
// ~1e-4 in |dE/E| at dt = 0.01; that is a known limit of the prototype integrator (DEVPLAN), so
// the test asserts it converges as dt shrinks rather than pretending it is small at dt = 0.01.
{
  const energyDrift = (over) => {
    const w = new World(params(Object.assign({ N: 400, gravity: 'brute', collisions: false }, over)));
    const E0 = w.totalEnergy();
    let worst = 0;
    const steps = Math.round(2 * TAU / w.P.dt);
    for (let s = 0; s < steps; s++) {
      w.step();
      if (s % 50 === 0 || s === steps - 1) worst = Math.max(worst, Math.abs((w.totalEnergy() - E0) / E0));
    }
    return worst;
  };
  const kep = energyDrift({ selfGravity: false });
  const coarse = energyDrift({}), fine = energyDrift({ dt: 0.0025 });
  check('no collisions, star only: |dE/E| < 1e-6 over 2 orbits', kep < 1e-6, 'worst=' + e(kep));
  check('no collisions, self-gravity: |dE/E| converges with dt', fine < 2e-6 && fine < coarse / 10,
    'dt=0.01: ' + e(coarse) + '  dt=0.0025: ' + e(fine));
}

// ─── 5. Barnes-Hut force accuracy vs brute force ─────────────────────────────────────
{
  const w = new World(params({ N: 2000 }));
  const n = w.n, eps2 = w.P.softening ** 2;
  const ex = new Float64Array(n), ey = new Float64Array(n), bx = new Float64Array(n), by = new Float64Array(n);
  bruteForceAccel(w.x, w.y, w.m, n, eps2, ex, ey);
  let rmsRef = 0;
  for (let i = 0; i < n; i++) rmsRef += ex[i] * ex[i] + ey[i] * ey[i];
  rmsRef = Math.sqrt(rmsRef / n);
  const tree = new BarnesHut(n);
  // the default path: grouped walk with quadrupoles at the default θ
  const th = BASE.theta, g = BASE.bhGroup;
  const errors2 = (theta, grouped) => {
    tree.build(w.x, w.y, w.m, n, theta);
    if (grouped) tree.accelGrouped(w.x, w.y, w.m, n, eps2, bx, by, g);
    else tree.accel(w.x, w.y, w.m, n, eps2, bx, by);
    const rel = []; let sq = 0;
    for (let i = 0; i < n; i++) {
      const d2 = (bx[i] - ex[i]) ** 2 + (by[i] - ey[i]) ** 2;
      sq += d2;
      rel.push(Math.sqrt(d2) / Math.hypot(ex[i], ey[i]));
    }
    rel.sort((a, b) => a - b);
    return { median: rel[n >> 1], rms: Math.sqrt(sq / n) / rmsRef };
  };
  for (const [grouped, tag, thetaUse, tolMed, tolRms] of [[true, 'grouped+quad', th, 1e-2, 2e-2], [false, 'plain monopole', 0.6, 2e-2, 5e-2]]) {
    const e0 = errors2(0, grouped), e3 = errors2(0.3, grouped), eU = errors2(thetaUse, grouped);
    check('bh ' + tag + ': θ=0 matches brute force', e0.rms < 1e-12, 'rms=' + e(e0.rms));
    check('bh ' + tag + ': θ=' + thetaUse + ' median rel err < ' + tolMed + ', rms < ' + tolRms, eU.median < tolMed && eU.rms < tolRms,
      'median=' + e(eU.median) + ' rms=' + e(eU.rms));
    check('bh ' + tag + ': error shrinks with θ', e3.rms < eU.rms && e3.median < eU.median,
      'θ=0.3 rms=' + e(e3.rms) + ' < θ=' + thetaUse + ' rms=' + e(eU.rms));
  }
}

// ─── 6. the worker pool's split: slices of the grouped walk tile it exactly ───────────────
// (the browser pool runs this same code in Web Workers, one slice each; see src/pool.js)
{
  const w = new World(params({ N: 3000 }));
  const n = w.n, eps2 = w.P.softening ** 2, g = BASE.bhGroup;
  const tree = new BarnesHut(n);
  const fx = new Float64Array(n), fy = new Float64Array(n), sx = new Float64Array(n).fill(NaN), sy = new Float64Array(n).fill(NaN);
  tree.build(w.x, w.y, w.m, n, BASE.theta);
  tree.accelGrouped(w.x, w.y, w.m, n, eps2, fx, fy, g);
  let covered = 0;
  const W = 7;
  for (let k = 0; k < W; k++) {
    tree.accelGrouped(w.x, w.y, w.m, n, eps2, sx, sy, g, Math.floor(n * k / W), Math.floor(n * (k + 1) / W));
    covered += Math.max(0, tree.covHi - tree.covLo);
  }
  let same = covered === n;
  for (let i = 0; i < n && same; i++) same = sx[i] === fx[i] && sy[i] === fy[i];
  check('worker-pool split: 7 slices reproduce the serial walk bit-for-bit', same, 'covered ' + covered + '/' + n);
}

console.log(failures ? 'smoke: FAIL (' + failures + ')' : 'smoke: PASS');
process.exit(failures ? 1 : 0);
