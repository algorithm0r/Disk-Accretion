# Disk Accretion — DEVLOG
Newest entry on top. **Append only — never edit past entries.**

## 2026-10-15 — Pages prep (publish pending)

**Done:** Prepared for publishing as public `algorithm0r/Disk-Accretion` with GitHub Pages from
`main` (Chris approved this in the PA session; relayed here). Audit: 40 tracked files, no secrets.
The largest files are the 9 Stage 3 figures (1.7 MB). Run packets (`analysis/runs/`, 31 MB) and
sweep logs are git-ignored. The only infrastructure reference is the research Server URL in
`params.js`, and `autoSave: false` means the page never writes to the DB. Pages needs no COOP/COEP:
the workers backend copies bodies by message rather than using SharedArrayBuffer, and the gpu
and workers backends fall back to cpu when unavailable. The panel now follows the fallback
(`syncControl`), verified in the browser pane by forcing the GPU path to fail.
**Changed:** `src/ui.js` (CONTROL_SYNC/syncControl), `src/main.js` (fallback re-syncs the backend
select).
**State:** smoke unchanged (sim core untouched). **Not published:** this session's auto-mode
classifier refused the `gh` calls ("Create Public Surface") because the approval reached it
secondhand, so the repo, Pages and About settings are not created yet.
**Next:** Chris runs the publish commands, or approves them in this session; then check the live
Pages URL and add the URLs to README / STATUS / the PA hub.

## 2026-10-15 — Stages 2 + 3: worker/GPU backends, regime batches, the inflation test

**Done:** Stage 2 (closed, target half met) and Stage 3 (closed), at Chris's "try to get through
stage 3".
*Stage 2.* Split `World.step` into begin / body-body force / end so an async provider can supply
the force (`updateAsync`, async engine loop, "Force backend" control). Two providers in
`src/pool.js` (browser only):
- `GravityPool`: blob-URL Workers built from the same `BarnesHut` source, each summing a slice of
  the groups. Bit-identical to the serial walk (smoke check 6).
- `GpuGravity`: WebGPU all-pairs in f32. Median force error vs f64 brute force 4e-6; L_z drift 1.4e-9
  over 4 orbits at 10k.
- No SharedArrayBuffer: the page isn't cross-origin isolated (needs COOP/COEP headers), so the pool
  copies bodies to each worker and every worker rebuilds the tree.

Benchmarks:
| path | 4 steps/frame | 1 step/frame | notes |
|---|---|---|---|
| CPU tree (Stage 1) | ~11.5k | ~40k | |
| worker pool, 4 workers | ~1.9× per step | | Node `bench-pool.mjs`, same worker code: 10k 8.6 → 4.6 ms, 40k 30.6 → 17.8, 100k 89 → 52; 8–16 workers slower |
| **GPU (RTX 3070 Ti)** | **~27k** (20k: 42.4 fps, 30k: 26.4) | **~88k** (80k: 34.8, 100k: 26.4) | in-page, full steps incl. collisions |
GPU force time alone: 3.9 ms at 10k, 7.2 at 40k, 18.9 at 100k (~5e11 interactions/s). So 2.2–2.4×
the CPU, not the 5× target. Serial CPU collisions (half the step at ≥ 80k) and the ~3–4 ms GPU
round trip per step now limit it → Stage 4. In-page CPU timings were throttled ~3× while the pane
was hidden (tree at 20k: 40 ms in-page vs 13.7 in Node), hence the pool numbers come from Node.
*Stage 3.* `runner.mjs` rewritten:
- orbit-based sampling (full mass spectrum, bound big-body (k, a, e), unbound and ejected counts,
  position snapshots)
- packets to MongoDB over socket via the standard client (`npm install` socket.io-client; Server
  round-trip verified) plus local JSON in `analysis/runs/`

Also added `sweep.mjs` (parallel batches, run-name grammar in its header), `inflationRamp`
(inflation fading with mass, 1 + (f−1)(m₀/m)^q) and `analysis/stage3.py` (9 figures + `tables.md`).
58 runs in batch_001–006, ~15 min wall at 14–16 processes. The write-up is `analysis/FINDINGS.md`.

Results:
- **Runaway:** M₁/⟨m⟩ peaks at 31–61 around 13–40 orbits (8 seeds). The tail index q passes
  2.35 ± 0.08 at 10 orbits.
- **Oligarchic:** M₁/M₁₀ ≈ 1.5–6 for 3–40 orbits, while the leaders pull 10²–10³× away from the median.
- **Spacing:** median Δa/R_H,mutual climbs 0.7 → 3.4 → 6.5 → 7.4 → **7.6** at 10/100/300/1000/3000
  orbits (IQR 6.8–8.1, e ≈ 0.11). Every disk mass plateaus at 5–8.3. *Finding:* the 5–10 band is
  reached through a giant-impact phase; during the oligarchic phase big bodies crowd at ≪ 1 R_H.
- **Disk mass:** t(N halves) ∝ M^−0.75 (40 → 0.25 orbits, M 1e-4 → 0.1). With collisions off,
  Q < 1 disks form sheared wakes: clumping 2.6–3.1× Poisson against 1.2 at Q = 9, transient over
  2–3 orbits.
- **Inflation account (holds in direction, two corrections):** ejections per run go 0 (f = 100) →
  1–5 (30) → 15–20 (10) → 61–90 (3). Bodies reach the star at f ≤ 3. Big-body e rises 0.06 → 0.5,
  and growth time goes as t ∝ f^−0.88.
  - Correction 1: f = 30 does eject, just late; all 8 seeds make their first ejection at 160–790
    orbits, so the 150-orbit zero was timing.
  - Correction 2: Θ of the largest body alone doesn't order the counts. f = 1 ejects fewer than
    f = 3 (growth too slow), and fading inflation from 100 has Θ 1.8 but 20–22 ejections.
  - Fading inflation from 30 keeps fast growth (t_half 4.5 orbits) with 36–42 ejections.

**Changed:** new `src/pool.js`, `bench-pool.mjs`, `sweep.mjs`, `analysis/` (stage3.py, FINDINGS.md,
tables.md, figures/), `package.json`. `world.js` gained the step split, `addStarAccel` and the
inflation ramp; `gravity.js` gained range-limited `accelGrouped`; the engine loop is async; `params`
gained `backend`, `workers` and `inflationRamp`. Smoketest gained check 6 (the pool split).
DEVPLAN closes Stages 2 and 3 and adds Stage 4 (past 5×) and Stage 5 (robustness: dt-convergence,
seeds). CLAUDE.md and README updated (pool.js browser-only, runner/sweep/analysis, the
hidden-pane throttle). Dropped my two scratch collections on mint (roundtrip, scratch_runs; 1
doc each).
**State:** smoke PASS 17/17 @ b457288. Batches are in MongoDB `diskAccretionDB` (batch_001–006)
and in `analysis/runs/` (git-ignored, 31 MB). In-page (@ b457288), the gpu and workers backends
step correctly from the UI. Not done: dt-convergence of the late-phase numbers (Stage 5); visible-pane
fps for the CPU/worker backends (the pane stayed hidden).
**Next:** Stage 5, if the numbers are going anywhere: rerun the inflation and base batches at dt/2
and dt/4. Or Stage 4 (GPU collisions) for scale. Chris's call: whether fading inflation becomes the
demo default.

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
