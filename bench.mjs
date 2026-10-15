// Headless step-time benchmark: ms per sim step vs N for brute force and Barnes-Hut, and the
// largest N that fits a 30 fps frame. Same main-realm loading as smoketest.mjs.
//   node bench.mjs [--spf 4] [--draw-ms 1.5] [--modes brute,bh] [--ns 1000,2000,...]
//
// A frame costs stepsPerFrame × (ms per step) + draw. The draw cost is measured in the
// browser (the "ms / draw" readout) and passed in; the default is the ~10k-body figure.
// Each N is timed from a fresh disk, collisions on, over the first `--steps` steps after a
// short warm-up, so N has fallen by only a few % — the number is the cost at the N you ask
// for, not after the disk has thinned out.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indirectEval = eval;
for (const f of ['util.js', 'params.js', 'gravity.js', 'collide.js', 'world.js']) {
  indirectEval(readFileSync(path.join(__dirname, 'src', f), 'utf8').replace(/^\s*(['"])use strict\1;?/, ''));
}
process.title = 'Disk Accretion bench';
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const spf = +flag('spf', 4), drawMs = +flag('draw-ms', 1.5), steps = +flag('steps', 20);
const modes = flag('modes', 'brute,bh').split(',');
const budget = 1000 / 30;
const defaultNs = {
  brute: [500, 1000, 1500, 2000, 2500, 3000, 4000, 6000],
  bh: [2000, 5000, 8000, 10000, 12000, 15000, 20000, 30000, 50000, 100000],
};
const BASE = JSON.parse(JSON.stringify(globalThis.PARAMETERS));

console.log('Disk Accretion bench — node ' + process.version + ', spf=' + spf + ', draw=' + drawMs + ' ms, budget=' + budget.toFixed(1) + ' ms/frame');
for (const mode of modes) {
  const ns = flag('ns', null) ? flag('ns').split(',').map(Number) : defaultNs[mode];
  const rows = [];
  for (const N of ns) {
    const P = Object.assign(JSON.parse(JSON.stringify(BASE)), { N, gravity: mode, bruteMaxN: 1e9 });
    const w = new World(P);
    for (let s = 0; s < 3; s++) w.step();
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) w.step();
    const ms = (performance.now() - t0) / steps;
    const fps = 1000 / (spf * ms + drawMs);
    rows.push({ N, ms, fps });
    console.log('  ' + mode.padEnd(5) + ' N=' + String(N).padStart(6) + '  ' + ms.toFixed(2).padStart(7) + ' ms/step' +
      '  (grav ' + w.timing.gravity.toFixed(2) + ', coll ' + w.timing.collide.toFixed(2) + ')' +
      '  → ' + fps.toFixed(1).padStart(5) + ' fps at ' + spf + ' steps/frame');
    if (spf * ms > 4 * budget) break;   // well past the budget; bigger N only wastes time
  }
  // interpolate (log-log) the N where spf·ms + draw hits the 30 fps budget
  let maxN = null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i], ca = spf * a.ms + drawMs, cb = spf * b.ms + drawMs;
    if (ca <= budget && cb > budget) {
      const f = (Math.log(budget) - Math.log(ca)) / (Math.log(cb) - Math.log(ca));
      maxN = Math.round(Math.exp(Math.log(a.N) + f * (Math.log(b.N) - Math.log(a.N))));
    }
  }
  console.log('  ' + mode + ': max N at 30 fps with ' + spf + ' steps/frame ≈ ' + (maxN ? maxN.toLocaleString() : 'outside the sampled range'));
}
