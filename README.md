# Disk Accretion

2D particle simulation of stellar/planetary system formation: a rotating disk of particles around a central star under 1/r² gravity (thin-disk approximation), with inelastic merge-on-collision, in the browser at as many particles as runs in roughly real time.

Vanilla JS + Canvas, no build step, scaffolded from the shared engine v2. Gravity is a
Barnes-Hut quadtree (grouped walk + quadrupoles) with an exact O(N²) reference; collisions are
a spatial hash with perfect merging. On an i7-12700K it runs ~11.5k bodies at 30 fps with 4
steps per frame, or ~40k at 1 step per frame; the WebGPU backend (RTX 3070 Ti) ~27k / ~88k
(see DEVLOG for the benchmarks). Stage 3's science results, and Stage 5's dt-convergence check of them, are in `analysis/FINDINGS.md`.

**Live:** https://algorithm0r.github.io/Disk-Accretion/ · **Repo:** https://github.com/algorithm0r/Disk-Accretion

## Run
- **Browser:** open `index.html` (file:// works), or
  http://localhost:8000/research/Disk%20Accretion/sim/ via the always-on Static Server. Scroll to
  zoom, drag to pan, space to pause.
- **Headless runs:** `npm install` once, then `node runner.mjs --name X --collection batch_NNN
  --orbits 1000 --set N=5000,diskMass=0.001` — runs the same sim core in the main V8 realm
  (indirect `eval`, not `vm`; see `~/.claude/conventions.md` §4) and writes self-describing
  packets to MongoDB through the research Server and to `analysis/runs/`.
- **Batches + analysis:** `node sweep.mjs base3k+mass3k+inflation+toomre` (Stage 5: `node sweep.mjs dtconv`), then
  `python analysis/stage3.py`.
- **Smoke test:** `node smoketest.mjs` — no DB; asserts the conservation invariants (mass, L_z,
  energy with collisions off, merge conservation, Barnes-Hut vs brute-force force error).
- **Benchmark:** `node bench.mjs [--spf 4]` — ms/step vs N for brute and Barnes-Hut, and the max N
  at 30 fps; `node bench-pool.mjs` for the worker pool.

## Layout
- `src/` — sim core (`engine`, `params`, `world`, `gravity`, `collide`, `observer`,
  `datamanager`, `charts`, `util`) + `db.js` (vendored standard DB client) + `pool.js` (browser-only
  worker pool / WebGPU force providers) + `ui.js`/`main.js` (browser-only, all DOM).
- `runner.mjs` / `sweep.mjs` / `smoketest.mjs` / `bench.mjs` / `bench-pool.mjs` — headless entry points.
- `analysis/` — `stage3.py`, `figures/`, `tables.md`, `FINDINGS.md` (run packets in `analysis/runs/`
  are git-ignored; the canonical copies are in MongoDB `diskAccretionDB`, batch_001–011).
- `DEVPLAN.md` / `DEVLOG.md` — the plan (forward) and the log (backward, append-only).

See `~/.claude/conventions.md` for the shared standards this follows.
