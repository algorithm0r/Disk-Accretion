// Headless batch runner. Loads the SAME browser sim files into the MAIN V8 realm via indirect
// eval (NOT vm — conventions §4: vm adds a ~7-10x hot-loop tax on per-tick global reads, and a
// one-config-per-process runner never needs vm's sandbox isolation). Runs reps and writes
// self-describing packets via the standard DB client (direct transport).
//   node runner.mjs [--reps N] [--ticks N] [--db NAME] [--collection NAME]
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createDB } = require('./src/db.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const reps = parseInt(flag('reps', '1'), 10);
const ticksOverride = parseInt(flag('ticks', '0'), 10);

// load the DOM-free sim core into the main V8 realm. Everything is `var`/`function`/`var X =
// class X`, so once the leading 'use strict' directive is stripped the top-level names attach
// to globalThis and read as fast native globals (no vm proxy → no inlining penalty).
const indirectEval = eval; // aliased → indirect eval runs in the global (sloppy) realm
for (const f of ['util.js', 'params.js', 'engine.js', 'agent.js', 'world.js']) {
  let src = readFileSync(path.join(__dirname, 'src', f), 'utf8');
  src = src.replace(/^\s*(['"])use strict\1;?/, '');
  indirectEval(src);
}

const P = globalThis.PARAMETERS;
const { World, GameEngine } = globalThis;
const dbName = flag('db', P.db.db);
const collection = flag('collection', null);
const limit = ticksOverride || P.epoch;

const db = createDB(Object.assign({}, P.db, { transport: 'direct', db: dbName }));
for (let r = 0; r < reps; r++) {
  const run = 'run_' + String(r).padStart(3, '0');
  db.config.run = run;
  const world = new World(800, 600);
  const engine = new GameEngine();
  const samples = [];
  for (let t = 1; t <= limit; t++) {
    engine.tick = t;
    world.update(engine);
    if (t % P.reportingPeriod === 0) samples.push({ tick: t, meanX: world.meanX() });
  }
  const pkt = db.packet(P, { run, samples, finalMeanX: world.meanX() });
  const res = await db.insert(collection || run, pkt);
  console.log(run + ': finalMeanX=' + world.meanX().toFixed(3) + '  saved=' + JSON.stringify(res));
}
await db.close();
