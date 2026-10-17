// Disk Accretion — the slow validation suite: each benchmark in VALIDATION.md, run headless with
// the SAME preset setups and trackers the browser panel uses (src/presets.js), printed as the
// VALIDATION table and saved to analysis/validation.json. The fast versions are in smoketest.mjs.
//   node validate.mjs [kepler trojans routh gap kirkwood hill toomre]   (default: all; ~20 min)
// Sections run in parallel child processes (one per section), so the suite takes about as long
// as its slowest section.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indirectEval = eval;
for (const f of ['util.js', 'params.js', 'gravity.js', 'collide.js', 'hybrid.js', 'world.js', 'presets.js']) {
  indirectEval(readFileSync(path.join(__dirname, 'src', f), 'utf8').replace(/^\s*(['"])use strict\1;?/, ''));
}
const { runPreset, PRESETS } = globalThis;
process.title = 'Disk Accretion validate';
const ALL = ['kepler', 'trojans', 'routh', 'gap', 'kirkwood', 'hill', 'toomre'];
const argv = process.argv.slice(2);
const f = (v, d = 3) => (v == null || Number.isNaN(v)) ? '—' : (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(1) : (+v).toFixed(d));

const SECTIONS = {
  // 1. Kepler: the hybrid must be exact; leapfrog shown per eccentricity for contrast
  kepler() {
    const hy = runPreset('kepler', { integrator: 'hybrid' }, 100);
    const rows = [{ bench: 'Kepler orbits, a 0.5–2, e 0–0.85 (hybrid, dt 0.01, 100 orbits)', measured: hy.text,
      reference: 'exact Kepler: T ∝ a^1.5, closed orbits, E constant', tolerance: '|ΔE/E| < 1e-9, apse < 1e-4°, period < 1e-8', pass: hy.pass }];
    for (const dt of [0.01, 0.001]) {
      const lf = runPreset('kepler', { dt, integrator: 'leapfrog' }, 100), tr = lf.tracker, w = lf.world;
      const byE = {};
      for (let i = 0; i < w.n; i++) {
        const I = tr.init[w.tag[i]], key = I.e.toFixed(2);
        const el = elements(w, i);
        byE[key] = Math.max(byE[key] || 0, Math.abs((el.E - I.E) / I.E));
      }
      rows.push({ bench: 'Kepler orbits (leapfrog, dt ' + dt + ', 100 orbits), for contrast', measured: 'worst |ΔE/E| by e: ' + Object.entries(byE).map(([e, v]) => 'e ' + e + ': ' + v.toExponential(1)).join(', '),
        reference: 'as above', tolerance: 'informational: leapfrog is not exact at high e', pass: null });
    }
    return rows;
  },

  // 2. Trojans: libration centres (live star), and the pinned-star contrast
  trojans() {
    const live = runPreset('trojans', {}, 120, 2), pin = runPreset('trojans', { liveStar: false }, 120, 2);
    return [
      { bench: 'Trojans, μ = 1e-3, live star (120 orbits)', measured: live.text, reference: 'L4/L5 at ±60° from the planet', tolerance: '±0.5° (tadpoles with amplitude < 5°)', pass: live.pass },
      { bench: 'Trojans, μ = 1e-3, PINNED star (120 orbits)', measured: pin.text, reference: 'no triangular equilibria without the indirect term', tolerance: '0 tadpoles', pass: pin.measured.tadpoles === 0 },
    ];
  },

  // 3. Routh: sweep the planet mass with the live star (μ = m/(M★ + m), the mass fraction), and
  //    the pinned star at small μ
  routh() {
    const ms = [0.01, 0.02, 0.03, 0.035, 0.038, 0.039, 0.0398, 0.0400, 0.0402, 0.0404, 0.041, 0.045, 0.05];
    const MU_C = (1 - Math.sqrt(23 / 27)) / 2;
    const res = ms.map((m) => ({ m, mu: m / (1 + m), r: runPreset('routh', { planetMass: m }, 300) }));
    const stable = res.filter((x) => x.r.measured.stable).map((x) => x.mu);
    const unstable = res.filter((x) => !x.r.measured.stable).map((x) => x.mu);
    const hiStable = Math.max(...stable), loUnstable = Math.min(...unstable);
    const clean = unstable.every((mu) => mu > hiStable);
    const pin = [0.001, 0.01].map((m) => runPreset('routh', { planetMass: m, liveStar: false }, 200));
    return [
      { bench: 'Routh criterion, live star, planet mass swept 0.01–0.05 (300 orbits each; linear probes 1e-5 rad off L4/L5)', measured: 'stable up to μ = ' + hiStable.toFixed(5) + ', unstable from μ = ' + loUnstable.toFixed(5) + (clean ? '' : ' (not monotone!)') +
          '; per μ: ' + res.map((x) => x.mu.toFixed(4) + (x.r.measured.stable ? '✓' : '✗')).join(' '),
        reference: 'μ_c = (1 − √(23/27))/2 = 0.03852 (μ = m/(M★+m))', tolerance: 'edge bracket contains μ_c, width ≤ 0.0005', pass: clean && hiStable < MU_C && loUnstable > MU_C && loUnstable - hiStable <= 0.0005 },
      { bench: 'Routh, PINNED star at m = 0.001 and 0.01 (200 orbits)', measured: pin.map((p) => p.text).join(' | '), reference: 'no L4 without the indirect term', tolerance: 'swarm leaves', pass: pin.every((p) => !p.measured.stable) },
    ];
  },

  // 4. Chaotic zone: half-width vs 1.3 μ^{2/7} at five μ, and the fitted exponent
  gap() {
    const mus = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2];
    const res = mus.map((mu) => ({ mu, r: runPreset('gap', { planetMass: mu, N: 2002 }, 300, 10) }));
    const lx = res.map((x) => Math.log(x.mu)), ly = res.map((x) => Math.log(x.r.measured.halfInner));
    const mx = lx.reduce((a, b) => a + b) / lx.length, my = ly.reduce((a, b) => a + b) / ly.length;
    const slope = lx.reduce((s, v, i) => s + (v - mx) * (ly[i] - my), 0) / lx.reduce((s, v) => s + (v - mx) ** 2, 0);
    const coef = Math.exp(my - slope * mx);
    return [
      ...res.map((x) => ({ bench: 'Chaotic zone, μ = ' + x.mu + ' (300 orbits)', measured: x.r.text, reference: 'Wisdom 1980: Δa = 1.3 μ^{2/7} a', tolerance: 'inner half-width ±25%', pass: x.r.pass })),
      { bench: 'Chaotic zone scaling over μ = 1e-4 … 1e-2', measured: 'inner half-width ∝ μ^' + slope.toFixed(3) + ', coefficient ' + coef.toFixed(2),
        reference: 'μ^{2/7} = μ^0.286, coefficient 1.3', tolerance: 'exponent 0.286 ± 0.04', pass: Math.abs(slope - 2 / 7) < 0.04 },
    ];
  },

  // 5. Kirkwood: where resonance gaps open, at which μ, in 1000 planet orbits (location test at μ = 3e-3)
  kirkwood() {
    const rows = [];
    for (const mu of [1e-3, 3e-3, 1e-2]) {
      const r = runPreset('kirkwood', { planetMass: mu, N: 6002 }, 1000, 50);
      rows.push({ bench: 'Resonance gaps, planet e = 0.05, μ = ' + mu + ' (1000 planet orbits, 6000 particles)', measured: r.text,
        reference: 'gaps at a = (p/q)^{2/3}: 3:1 0.481, 5:2 0.543, 7:3 0.569, 2:1 0.630',
        tolerance: mu === 3e-3 ? '3:1 and 2:1: a > 3σ deficit within 0.01 of prediction' : 'informational', pass: r.pass, data: r.measured });
    }
    return rows;
  },

  // 6. Hill stability: the close-encounter edge in Δ, 10⁴ orbits per Δ (hybrid integrator)
  hill() {
    const Ds = [2.5, 3.0, 3.1, 3.2, 3.3, 3.4, 3.45, 3.5, 3.6, 4.0];
    const res = Ds.map((D) => ({ D, r: runPreset('hill', { hillDelta: D }, 10000, 2) }));
    const enc = res.filter((x) => x.r.measured.encounter).map((x) => x.D);
    const none = res.filter((x) => !x.r.measured.encounter).map((x) => x.D);
    const hiEnc = Math.max(...enc), loNone = Math.min(...none);
    const neverAbove = res.filter((x) => x.D >= 3.5).every((x) => !x.r.measured.encounter);
    return [{ bench: 'Hill stability of two planets (m = 1e-5 each, circular, 10⁴ orbits per Δ)',
      measured: 'close encounters up to Δ = ' + hiEnc + ', none from Δ = ' + loNone + '; per Δ: ' + res.map((x) => x.D + (x.r.measured.encounter ? ' meets@' + x.r.measured.firstOrbit.toFixed(0) : ' none')).join(', '),
      reference: 'Gladman 1993: never for Δ > 2√3 = 3.464', tolerance: 'no encounter at Δ ≥ 3.5; edge within 3.2–3.46', pass: neverAbove && loNone > hiEnc && hiEnc >= 3.2 && loNone <= 3.5 }];
  },

  // 7. Toomre: a Q ≈ 0.3 disk clumps within an orbit (collisions off); the full sweep is FINDINGS §2
  toomre() {
    const hi = runPreset('toomre', {}, 1, 20), lo = runPreset('toomre', { diskMass: 0.003 }, 1, 20);
    return [{ bench: 'Toomre instability, collisions off, 1 orbit', measured: 'Q ≈ 0.3: ' + hi.text + ' | Q ≈ 9: ' + lo.text,
      reference: 'Q < 1 unstable to clumping; Q ≫ 1 stable', tolerance: 'peak clumping > 2× random at Q ≈ 0.3, < 1.4× at Q ≈ 9', pass: hi.measured > 2 && lo.measured < 1.4 }];
  },
};

if (argv[0] === '--section') {
  // child: run one section, print its rows as JSON
  const rows = SECTIONS[argv[1]]();
  process.stdout.write(JSON.stringify(rows));
} else {
  const want = argv.length ? argv : ALL;
  const t0 = Date.now();
  const results = await Promise.all(want.map((s) => new Promise((resolve) => {
    let out = '', err = '';
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--section', s], { cwd: __dirname });
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { err += d; });
    ch.on('exit', (code) => {
      const sec = ((Date.now() - t0) / 1000).toFixed(0);
      if (code) { console.error(s + ' FAILED (' + code + '): ' + err.slice(0, 500)); resolve({ section: s, rows: [], sec, error: err }); return; }
      console.error('  ' + s + ' done (' + sec + ' s)');
      resolve({ section: s, rows: JSON.parse(out), sec });
    });
  })));
  const lines = ['| benchmark | measured | reference | tolerance | pass |', '|---|---|---|---|---|'];
  for (const r of results) for (const row of r.rows) {
    lines.push('| ' + [row.bench, row.measured, row.reference, row.tolerance, row.pass == null ? 'n/a' : (row.pass ? 'PASS' : 'FAIL')].map((c) => String(c).replace(/\|/g, '/')).join(' | ') + ' |');
  }
  const table = lines.join('\n');
  console.log(table);
  mkdirSync(path.join(__dirname, 'analysis'), { recursive: true });
  writeFileSync(path.join(__dirname, 'analysis', 'validation.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 1));
  writeFileSync(path.join(__dirname, 'analysis', 'validation_table.md'), '# Validation table (generated by `node validate.mjs`, ' + new Date().toISOString().slice(0, 10) + ')\n\n' + table + '\n');
  const fails = results.flatMap((r) => r.rows).filter((x) => x.pass === false).length + results.filter((r) => r.error).length;
  console.error('validate: ' + (fails ? 'FAIL (' + fails + ')' : 'PASS') + ' in ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
  process.exit(fails ? 1 : 0);
}
