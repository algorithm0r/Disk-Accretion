# Disk Accretion

2D particle simulation of stellar/planetary system formation: a rotating disk of particles around a central star under 1/r² gravity (thin-disk approximation), with inelastic merge-on-collision, in the browser at as many particles as runs in roughly real time.

Vanilla JS + Canvas, no build step, scaffolded from the shared engine v2. Gravity is a
Barnes-Hut quadtree (grouped walk + quadrupoles) with an exact O(N²) reference; collisions are
a spatial hash with perfect merging. On an i7-12700K it runs ~11.5k bodies at 30 fps with 4
steps per frame, or ~40k at 1 step per frame (see DEVLOG for the benchmark).

## Run
- **Browser:** open `index.html` (file:// works), or
  http://localhost:8000/research/Disk%20Accretion/sim/ via the always-on Static Server. Scroll to
  zoom, drag to pan, space to pause.
- **Headless batch:** `node runner.mjs --reps 50` — runs the same sim core in the main V8 realm
  (indirect `eval`, not `vm` — avoids vm's hot-loop tax; see `~/.claude/conventions.md` §4) and
  writes self-describing packets to MongoDB through the research Server.
- **Smoke test:** `node smoketest.mjs` — no DB; asserts the conservation invariants (mass, L_z,
  energy with collisions off, merge conservation, Barnes-Hut vs brute-force force error).
- **Benchmark:** `node bench.mjs [--spf 4]` — ms/step vs N for brute and Barnes-Hut, and the max N
  at 30 fps.

## Layout
- `src/` — sim core (`engine`, `params`, `world`, `gravity`, `collide`, `observer`,
  `datamanager`, `charts`, `util`) + `db.js` (vendored standard DB client) + `ui.js`/`main.js` (browser-only, all DOM).
- `runner.mjs` / `smoketest.mjs` / `bench.mjs` — headless entry points (the runner needs
  `npm i mongodb` for its direct DB transport).
- `DEVPLAN.md` / `DEVLOG.md` — the plan (forward) and the log (backward, append-only).

See `~/.claude/conventions.md` for the shared standards this follows.
