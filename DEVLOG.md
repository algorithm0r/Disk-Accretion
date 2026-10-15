# Disk Accretion — DEVLOG
Newest entry on top. **Append only — never edit past entries.**

## 2026-10-15 — Stage 1: the disk sim, Barnes-Hut + merging, benchmark

**Done:** Replaced the drifters demo with the disk (DEVPLAN Stage 1, now DONE). SoA world, leapfrog
KDK with fixed dt, fixed unit star, accretion (r < 0.1) and ejection (r > 10) banked with their
mass and L_z. Gravity: exact O(N²) reference plus a Barnes-Hut quadtree (leaf cap 8). The plain
per-body walk ran 14 ms/step at 10k. A grouped walk (groups ≤ 32, bodies in tree order) plus
quadrupole moments brought it to ~6 ms at θ = 1.0, *and* more accurate: median force error 0.3%
vs 1.0% for plain monopole at θ = 0.6. The force sum is sqrt/div-throughput bound
(~2.6 ns/interaction); unrolling over 4 bodies gained nothing. Collisions: spatial hash, swept
closest-approach test, 5-cell forward scan, perfect merge with the pair's internal L_z kept in
`spin`. Renderer: ImageData pixels plus mass-coloured circles and Hill rings. Readouts: N, largest
mass, bodies ≥ 100 m₀, L_z drift, mass error, accreted/ejected, ms/step (grav/coll), ms/draw, fps.
Controls: N, disk mass, dispersion, inflation (live), steps/frame, θ, dt, gravity, self-gravity,
collisions. Wheel zoom, drag pan, space to pause.
**Benchmark** (i7-12700K, Chrome 152, frames driven synchronously in-page, 10k-body draw ≈ 0.9 ms;
`node bench.mjs` agrees within ~5%). Max N at 30 fps:
| path | 4 steps/frame | 1 step/frame |
|---|---|---|
| brute force | ~2,200 (2.0k: 39.5 fps, 2.5k: 26.4) | ~4,700 (4k: 42.8, 5k: 27.8) |
| Barnes-Hut | ~11,500 (10k: 33.9, 12k: 28.7) | ~40,000 (40k: 30.6, 50k: 24.4) |
100k bodies: 93 ms/step (10.7 fps at 1 step/frame).
**Dynamics** (default: N = 10k, disk 0.003 M_star ≈ 1000 M⊕, m₀ = 0.1 M⊕, inflation 30, in-browser
run). 1.5 orbits (at r = 1): 6,542 bodies, max 15 m₀. 10 orbits: 1,594, max 106 m₀, inner disk
clears first. 40 orbits: 226 bodies, 19 ≥ 100 m₀ holding 74% of the mass, largest 1,578 m₀, while
the small-body tail stays ~2 m₀ (bimodal, oligarchic). 150 orbits: 40 bodies, 9 oligarchs hold 96%,
largest 2,608 m₀ (261 M⊕). Big-body e 0.03–0.18, spacing 0.3–6.7 mutual Hill radii, so not yet
isolated: the heavy default disk is in a giant-impact phase. Nothing was accreted or ejected.
L_z drift −5.3e-6 and mass error 1.3e-13 at 150 orbits.
**Changed:** new `src/gravity.js`, `src/collide.js`, `bench.mjs`; rewrote `world.js`,
`observer.js`, `params.js`, `ui.js`, `main.js`, `datamanager.js`, `index.html`, `smoketest.mjs`; the
engine gained fps/frameMs, a pause flag and `stepsPerFrame`; `runner.mjs` was ported to the new
API (dry-checked headless, not run against Mongo: no `node_modules`). Removed `src/agent.js`.
DEVPLAN design notes amended (spin bookkeeping, grouped+quadrupole BH, θ = 1.0, the collision grid,
the heavy-disk note, the measured dt limit on close encounters). CLAUDE.md gained the
no-stable-index and conservation-is-the-test rules plus how to view and bench. README updated.
**State:** smoke PASS (16/16) @ 9c12d6a. Merge conserves mass/momentum/L_z (dL 1.7e-16). Brute
N = 600 over 2 orbits: mass err 4e-15, L_z 2e-15, 600 → 416. BH N = 3000 over 4 orbits: mass err
1e-14, L_z 3.4e-7, 3000 → 1405. Star-only |dE/E| = 8e-8. Self-gravity with collisions off:
|dE/E| = 1.8e-4 at dt = 0.01, converging to 6.4e-7 at dt = 0.0025 (close encounters
under-resolved; accepted for the prototype). BH vs brute at N = 2000: θ = 0 rms 1.6e-15;
grouped+quad at θ = 1 median 3.0e-3; plain at θ = 0.6 median 1.0e-2. Collision scan exhaustive:
0 missed overlaps in 600 brute-checked steps. Viewed in the browser pane via the Static Server
(the pane was mostly hidden, which suspends rAF, hence the synchronous frame timing; while rAF
did run early on, the live loop read 25–30 fps at ~10k).
**Next:** Stage 2 if wanted: a worker pool over the grouped walk (20 threads here, groups are
independent), then GPU. Or Stage 3: a disk-mass sweep toward a lighter, MMSN-like disk, which
should reach isolation rather than giant impacts.

<!-- append new entries above this line -->

## 2026-10-15 — scaffolded
**Done:** project scaffolded from engine v2 — vanilla-JS canvas microframework with
model/view split, the vendored standard DB client, a headless `runner.mjs`, and `smoketest.mjs`.
**Changed:** initial file tree.
**State:** runs (demo drifters model, in-browser + headless); `smoketest.mjs` passes.
**Next:** replace the demo model with the real Disk Accretion dynamics (DEVPLAN Stage 1).
