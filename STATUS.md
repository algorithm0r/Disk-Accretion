# Disk Accretion — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-15 (Stage 1 close) — refreshed every session close; may carry unverified claims
**Verified:** 2026-10-15 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
DEVPLAN Stage 1 — Physics core + watchable prototype `[ DONE ]` (closed 2026-10-15).
Stage 2 (scale up: workers/GPU) and Stage 3 (regime checks) are `[ PLANNED ]`, not started.

## State
- Disk sim runs in the browser (http://localhost:8000/research/Disk%20Accretion/sim/ or file://) and
  headless. smoke PASS 16/16 @ 9c12d6a (2026-10-15): mass closes to ~1e-14, brute L_z to round-off,
  BH L_z 3.4e-7 over 4 orbits, BH force error checked vs brute.
- Default run (10k bodies) visibly sweeps into a few oligarchs: 9 bodies hold 96% of the mass by
  150 orbits (in-browser run, 2026-10-15).
- `runner.mjs` ported to the new API, but **unverified against MongoDB** (no `node_modules`;
  needs `npm i mongodb`).

## Metrics
- Max N at 30 fps (i7-12700K, Chrome 152): Barnes-Hut ~11,500 at 4 steps/frame, ~40,000 at 1;
  brute force ~2,200 at 4, ~4,700 at 1. Draw < 1 ms at 10k.
- Step cost at 10k: ~6.6 ms (gravity ~5.6, collisions ~1.0). Force sum ~2.6 ns/interaction,
  bound by sqrt/div throughput.
- BH accuracy (N = 2000, default θ = 1.0, grouped + quadrupole): median 0.3% of the self-force.

## Branches
- `main` (local only, no remote)

## Open
- Accepted gap: fixed-dt leapfrog under-resolves the closest softened encounters (|dE/E| ≈ 2e-4
  with collisions off at dt = 0.01; converges with dt). Fine for watching. Stage 3 numbers need
  a dt-convergence check or an adaptive/hybrid step.
- The default disk is heavy (~1000 M⊕; oligarchs reach ~0.8 M_J) and ends in giant impacts, not
  isolation. Disk-mass choice goes to Stage 3.

## Next action
Chris's pick: Stage 2 (a worker pool over the grouped walk, independent groups, 20 threads) or
Stage 3 (a disk-mass sweep toward an MMSN-like disk, mass spectrum, Hill spacing).

## Blockers
- none
