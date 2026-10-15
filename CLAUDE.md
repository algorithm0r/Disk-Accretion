# Disk Accretion — Claude instructions

## Read first, every session
1. `STATUS.md` — where the system is right now (the 60-second orient)
2. `DEVLOG.md` — the top entry (what changed last)
3. `DEVPLAN.md` — the current `[ ACTIVE ]` stage

## What this is
2D particle simulation of stellar/planetary system formation: a rotating disk of particles around a central star under 1/r² gravity (thin-disk approximation), with inelastic merge-on-collision, in the browser at as many particles as runs in roughly real time.

## Stack (never violate)
- Vanilla JS + Canvas. No build step, no framework, no modules. `<script>` tags load
  `src/` in dependency order (`main.js` last).
- **Shared things are top-level `var`** — including `var Foo = class Foo {}`. This is what
  lets the SAME `src/` files run in the browser AND headless: the runners strip `'use strict'`
  and load them into the **main V8 realm via indirect `eval`** (not `vm`), where top-level
  `var` attaches to `globalThis` (a bare `class`/`const` would be block-scoped and never
  attach). Main-realm, not `vm`, because `vm` adds a ~7-10x hot-loop tax on per-tick global
  reads and we never need its sandbox isolation (conventions §4). Never fork the sim core.
- **All DOM lives in `ui.js` + `index.html`.** Sim classes (`world`, `gravity`, `collide`, `observer`,
  `datamanager`) touch zero DOM — that's what keeps them headless-safe.
- **Particles are structure-of-arrays typed arrays** in `world.js` (Float64Array x, y, vx, vy,
  m, r, ...), not one object per particle; that's what makes many thousands of particles fast
  enough. (`agent.js` was removed in Stage 1.) This is the one deliberate departure from the
  template. Alive bodies are packed into 0..n-1 and compacted every step, so **no body index is
  stable across steps**; nothing may hold one from one step to the next.
- **Conservation is the test.** Any change to merging, removal or the integrator must keep
  `smoketest.mjs` green: mass closes to ~1e-13, brute-force L_z (orbital + spin + banked) to
  round-off. Merges move orbital L_z into `spin`; don't drop it.
- **Model/view split:** the world holds state and never draws; the `Observer` renders it.
- **Config:** one `PARAMETERS` global (`params.js`), serialized verbatim into every saved
  packet. `PARAM_SCHEMA` drives the control panel.
- **DB:** the vendored standard client `src/db.js` (see `~/.claude/conventions.md` §4).
  Use `db.packet()`, `db.nextBatch()`, and `db.scratch()` for throwaway work.

## Conventions
Follow `~/.claude/conventions.md`. STATUS is overwritten every close (present truth); DEVLOG is
append-only, newest on top (history); DEVPLAN stages carry `[ DONE ] / [ ACTIVE ] / [ PLANNED ]`
tokens and a `**Done when:**` criterion. `/log-session` rewrites STATUS — don't hand-edit its
`Verified:` line (that moves only on a cold `/audit`).

## Run
- Browser: open `index.html`.
- Headless batch: `node runner.mjs --reps N` (writes to MongoDB via the Server).
- Smoke (no DB): `node smoketest.mjs` — prints the numbers that go in the DEVLOG entry.
- Benchmark: `node bench.mjs --spf 4` (and `--spf 1`) — max N at 30 fps, brute vs Barnes-Hut.
- Viewing: http://localhost:8000/research/Disk%20Accretion/sim/index.html (the always-on Static
  Server; never start a server just to view). A hidden browser pane suspends
  requestAnimationFrame, so measure fps there by driving frames synchronously from JS.
