# Disk Accretion — DEVPLAN
*Living document, not frozen. Update as the design evolves.*

## Built
- Scaffolded from engine v2 (vanilla-JS canvas + standard DB client), 2026-10-15.
- **Stage 1 (2026-10-15):** the disk sim. SoA world (`world.js`), leapfrog KDK, fixed star,
  Barnes-Hut quadtree with a grouped walk + quadrupoles and a brute-force reference
  (`gravity.js`), spatial-hash collisions with a swept contact test and perfect merging with
  spin bookkeeping (`collide.js`), accretion/ejection banking, ImageData renderer with mass
  colours and Hill rings (`observer.js`), live readouts + controls (`ui.js`), a 16-check
  invariant smoketest and `bench.mjs`. Demo "drifters" model and `agent.js` removed.
- **Stage 2 (2026-10-15):** async force providers in `src/pool.js` (browser only): a Web Worker
  pool over the grouped walk and WebGPU all-pairs gravity; `World.updateAsync` + an async engine
  loop; "Force backend" control; `bench-pool.mjs`. GPU path: ~2.3× the CPU's max N at 30 fps.
- **Stage 3 (2026-10-15):** orbit-sampled `runner.mjs` (mass spectra, big-body a/e, snapshots;
  MongoDB over socket + local JSON), `sweep.mjs` (parallel batches), `inflationRamp`,
  `analysis/stage3.py` (9 figures, tables) and `analysis/FINDINGS.md`.
- **Stage 5 (2026-10-15):** dt-convergence batches (`sweep.mjs dtconv`, batch_007–011, 86 runs),
  `stage3.py` convergence table + fig9 and leader-spacing analysis + fig10, FINDINGS §4–5.

## Not yet built
- 5× scale-up: GPU collisions, multi-step GPU integration, SharedArrayBuffer (Stage 4).
- A step that resolves pericentre passes and close encounters, so the hot-disk (scattering)
  numbers converge (Stage 6; see the integrator note below).

## Origin
Came out of a PA conversation with Chris (2026-10-15): "a 2d rotating disk of particles that
are subject to gravity and collision." The survey found no clean, open, interactive 2D version
of this. Research codes (REBOUND) do it properly but aren't interactive toys. Browser toys skip
the disk physics (no central star, no circular orbits). That gap is the reason for the project.

## Design notes (rationale — amend in place as decisions change)

**Gravity is 1/r², not "true 2D".** True 2D gravity falls off as 1/r (log potential) and orbits
behave differently. We model a *thin 3D disk*: 1/r² forces, particles constrained to the plane,
Plummer softening ε (F ∝ r/(r²+ε²)^{3/2}).

**Units.** G = 1, M_star = 1. Disk from r_in to r_out (e.g. 0.3–1.0, or 1–3). Orbital period at
r is 2π r^{3/2}. Initial velocity is circular, v = sqrt(M_enc / r), plus a small random dispersion
(a few % of v_circ). Total disk mass is a parameter, usually ≪ M_star (1e-3 to 1e-2).

**The star dominates.** With a dominant central mass and near-circular orbits we are in the
planetesimal regime: runaway growth, then oligarchic growth, then isolation. A heavy,
self-gravitating disk goes Toomre-unstable (clumps, spiral arms) instead. Disk mass is the knob
between the two regimes; both are interesting, but the planetesimal regime is the default.
The star can be a fixed potential at the origin (simplest; L_z about the origin is still
conserved) or a live particle (it wobbles; momentum is conserved). Start fixed.

**Integrator: leapfrog (kick-drift-kick), fixed dt.** Symplectic, so orbits don't spiral (Euler
adds energy). dt ≈ 1/100–1/200 of the inner-edge orbital period. Close encounters are handled by
softening, not adaptive steps, at prototype level.
*Measured limit (2026-10-15):* star-only orbits hold |ΔE/E| ≈ 8e-8 over 2 orbits at dt = 0.01, but
with self-gravity and collisions off the closest softened encounters (ε = 1e-3, passed in about
one step) cost |ΔE/E| ≈ 2e-4; it converges with dt (6e-7 at dt = 0.0025). With collisions on,
bodies merge at r₁+r₂ ≈ ε, so the same under-resolution applies to the last approach before a
merge. Fine for a watchable prototype; Stage 3 numbers should check dt-convergence or move to a
hybrid/adaptive step (REBOUND's MERCURIUS/IAS15 territory).
*Measured (Stage 5, 2026-10-15):* the default disk and constant inflation f ≥ 10 are dt-converged
at dt/4 within seed scatter. The hot, scattering-heavy disks (f ≤ 3, fading ramps, e ≈ 0.4–0.5)
are not: they eject 26–44% fewer bodies and eject first ~2× later at dt/4, still moving between
dt/2 and dt/4. A star-only orbit at e = 0.9 (q = 0.1) carries |ΔE/E| 0.23 at dt = 0.01 against
1.5e-2 at dt/4, so pericentre passes near the star are a likely cause, alongside fast close
encounters (FINDINGS §4).

**Collisions = perfect merge.** Merges conserve mass, momentum and angular momentum but dissipate
energy. *Amended 2026-10-15:* orbital L_z alone is NOT conserved by a merge: the pair's orbital
angular momentum about their joint centre of mass vanishes when they become one point. It is
kept in a per-body `spin` array, so (orbital + spin + accreted + ejected) L_z is conserved
exactly, and that is the quantity the readout and smoketest track. The contact test is swept:
overlap now, or overlap at the pair's closest approach along the straight drift just taken
(exact for the drift), so fast pairs can't tunnel between snapshots. That damps random velocities, so the disk stays cold and circular while bodies grow. The
merged body sits at the centre of mass and moves at the mass-weighted velocity. Radius ∝ m^{1/3}
times a **radius inflation factor** (real planetesimals are tiny relative to their orbits, so
without inflation nothing collides on watchable timescales; REBOUND-style sims inflate too).
Expose it as a parameter, because it sets the growth timescale.

**The default disk is heavy (noted 2026-10-15).** diskMass = 0.003 M_star is ~1000 M⊕ of
solids, ~100× a minimum-mass solar nebula over 0.5–2 AU, so m₀ = 0.1 M⊕ at N = 10k and the
oligarchs reach ~0.5–0.8 Jupiter masses. That buys a watchable timescale (10k → 1.6k bodies in 10
orbits) and still sits in the star-dominated regime (Toomre Q ≈ 10 initially), but it ends in a
violent giant-impact phase (big-body e up to ~0.2) rather than gentle isolation. A lighter disk
needs more inflation or more patience; Stage 3's disk-mass sweep should take this up.

**Expected phenomenology (what "working" looks like):**
1. *Runaway growth*: biggest bodies grow fastest (gravitational focusing ∝ mass). The mass
   distribution develops a tail. "Rich get richer," the same shape as preferential attachment.
2. *Oligarchic growth*: a handful of protoplanets each dominate a feeding zone.
3. *Isolation*: final spacing ≈ 5–10 mutual Hill radii, r_H = a (m/3M)^{1/3}.
Inner disk evolves faster (shorter orbits). Removal: bodies inside r_star are accreted by the
star; bodies past r_escape are ejected. Track both.

**Performance: as many particles as runs in roughly real time.** "Real time" here means fast
enough to watch: ~30 fps with several sim steps per frame.
- Data layout: **structure-of-arrays typed arrays** (Float64Array x, y, vx, vy, m, r, alive), not
  one object per particle. A deliberate departure from the template's `agent.js` object model.
  `agent.js` may go unused. The sim core still stays DOM-free so `smoketest.mjs` runs headless.
- Gravity: **Barnes-Hut quadtree** (θ ≈ 0.5–0.7) for particle-particle forces, plus the exact star
  term. Brute force O(N²) is the baseline and the accuracy reference.
  *Amended 2026-10-15 (measured, i7-12700K):* the plain per-body walk cost 14 ms/step at 10k
  (~150 interactions/body, ~9 ns each with traversal). Two changes, both kept:
  (1) a **grouped walk** (Barnes 1990): bodies stored in tree (depth-first) order, the tree walked
  once per group of ≤ 32 bodies against the group's bounding box, every body summing one shared
  interaction list. 1.8× faster *and* more accurate, because the box criterion is stricter.
  (2) **quadrupole moments**. The inner loop is bound by sqrt + div throughput (they share the
  divider; unrolling over 4 bodies gained nothing), so the quadrupole's extra multiplies are
  nearly free and it lets θ rise. **Default θ = 1.0**: median force error 0.3% of the
  self-force, vs 1.0% for the plain monopole walk at θ = 0.6, at ~40% of the cost. The plain
  walk stays in the code as the simple reference (`bhGroup: 0`).
- Collision grid: cell h = 2·r_max + (largest non-circular drift per step, capped at 4·r_max);
  each body scans its own cell (j > i) plus the 4 forward neighbours (5 lookups, not 9). Verified
  exhaustive: zero overlapping never-merged pairs left after 600 brute-checked steps, and merge
  counts identical to the 9-cell scan.
- Collisions: **uniform grid / spatial hash** (cell ≈ largest collision diameter), checked after
  the drift step. Large bodies span cells: either check neighbours out to their radius, or keep
  the few "big" bodies in a separate list checked against everything.
- Shortcut if needed (REBOUND's "semi-active" trick): small particles feel the star plus big
  bodies only, and big bodies feel everything. Collisions still catch small-small merges.
- Beyond CPU: a Web Worker (keeps the UI smooth), then WebGPU/WebGL2 all-pairs on the GPU (tens of
  thousands of particles). GPU code can't run in the headless smoketest, so keep a CPU reference
  path.

**References.** REBOUND (Rein & Liu 2012, arXiv:1110.4876, the standard collisional N-body code,
with tree gravity + collision search and a plane-sweep mode for flat systems). Lithwick & Chiang
2006 (arXiv:astro-ph/0607241, inelastically colliding 2D disks, the closest match to this
project). Kokubo & Ida (runaway → oligarchic growth). Barnes & Hut 1986 (the tree). Barnes et al.
2009 (argues perfect merging is wrong even at km sizes, which matters if we ever add
fragmentation).

## Stages
### Stage 1 — Physics core + watchable prototype  [ DONE ] (closed 2026-10-15)
- [x] `params.js`: N, disk mass, r_in/r_out, velocity dispersion, ε, dt, θ, radius inflation,
      steps-per-frame, brute-force/Barnes-Hut toggle
- [x] `world.js`: SoA particle state, disk initialisation, leapfrog step, star term
- [x] Gravity: brute-force reference + Barnes-Hut quadtree (grouped walk + quadrupole)
- [x] Collisions: spatial hash + perfect merge (dead bodies flagged, compacted each step)
- [x] `observer.js`: fast draw (ImageData pixels for small bodies, circles for big),
      colour by mass, Hill rings on the heaviest; zoom/pan
- [x] Live readouts: N alive, largest mass, # bodies > threshold, L_z drift, fps / ms per step
- [x] `smoketest.mjs`: real invariants (mass conserved incl. star/ejected bookkeeping;
      |ΔL_z|/L_z small over K orbits; N non-increasing; BH force vs brute-force error < tol on a
      small N); plus single-merge conservation and leapfrog energy
- [x] **Benchmark:** record max N at ~30 fps (brute vs BH) in DEVLOG
**Done when:** a disk of ≥ several thousand particles runs at a watchable frame rate in the
browser, visibly shows bodies sweeping up their lanes into a few large ones, and `smoketest.mjs`
asserts the conservation invariants. ✓ Met: 10k bodies at 34 fps (4 steps/frame) in Chrome,
10k → 40 bodies with 96% of the mass in 9 oligarchs by 150 orbits, smoke 16/16 PASS.

### Stage 2 — Scale up  [ DONE ] (closed 2026-10-15, target half met)
*Starting point (from Stage 1's profile):* the CPU path is bound by sqrt/div throughput in the
force sum (~2.6 ns/interaction), not by traversal or memory. So the levers are parallelism (this
machine has 20 threads, and the grouped walk is embarrassingly parallel over groups, so a worker
pool on a SharedArrayBuffer should scale near-linearly) and the GPU's fast f32 rsqrt. Collisions
are ~15% of a step and would need their own parallel pass.
- ~~Move the sim to a Web Worker (SharedArrayBuffer or transferable snapshots to render)~~ → not
  needed: the providers below take the force term off the main thread and the UI stays responsive.
  Moving the whole sim is folded into **Stage 4**.
- [x] Split the grouped walk across a worker pool (`GravityPool`, `src/pool.js`): blob-URL Workers
      built from the same `BarnesHut` source, so it works from file://. No SharedArrayBuffer (no
      COOP/COEP headers on file:// or the Static Server), so each step posts one packed copy of
      (x, y, m) and every worker rebuilds the tree. Measured (Node `worker_threads`, `bench-pool.mjs`,
      identical worker code): best at **4 workers, ~1.9×** (10k: 8.6 → 4.6 ms/step; 40k: 30.6 →
      17.8; 100k: 89 → 52); 8–16 workers are slower. The ceiling is the replicated build plus the
      copies, which only SharedArrayBuffer removes.
- [x] GPU gravity (`GpuGravity`, WebGPU compute, f32 all-pairs, 256-body shared-memory tiles; the
      star term and integration stay f64 on the CPU). Force time on the RTX 3070 Ti: 3.9 ms @10k,
      7.2 @40k, 18.9 @100k (~5e11 interactions/s, a ~3–4 ms read-back floor per step). Median force
      error vs f64 brute 4e-6, so it is more accurate than the tree; L_z drift 1.4e-9 over 4 orbits
      at 10k (tree 3.3e-7).
- [x] Re-benchmark; pick the default path. In-page, full steps (collisions included), max N at 30
      fps: **GPU ~27k at 4 steps/frame, ~88k at 1** (vs 11.5k / 40k on the CPU tree): **2.3× / 2.2×**.
      Default stays `cpu` (works everywhere; headless); the panel's "Force backend" picks `workers`
      or `gpu`.
**Done when:** max N at ~30 fps is at least ~5× the Stage 1 figure, logged. **Half met:** the GPU
path is in and logged, but at 2.2–2.4×, not 5×. What now limits it: collision detection, still
serial on the CPU (half the step at ≥80k), and the per-step GPU round trip. Both move to Stage 4.

### Stage 3 — Does it reproduce the known regimes?  [ DONE ] (closed 2026-10-15)
Full write-up: `analysis/FINDINGS.md` (each claim → figure/table → regeneration command).
- [x] Mass-distribution plot over time (log-log cumulative), to look for the runaway tail
      (fig1, fig2: M₁/⟨m⟩ peaks at 31–61 around 13–40 orbits; tail index q passes 2.35 at 10 orbits)
- [x] Spacing of final protoplanets in mutual Hill radii, vs the ~5–10 expectation (fig3, fig8:
      median 7.6 R_H at 3000 orbits, 8 seeds; every disk mass plateaus at 5–8.3)
- [x] Sweep disk mass: planetesimal regime vs Toomre-unstable clumping (fig4, fig4b, fig5:
      t_half ∝ M^−0.75; with collisions off, Q < 1 disks reach 2.6–3.1× Poisson clumping as wakes)
- [x] **Radius-inflation sweep** (added 2026-10-15, from the PA conversation): the 150-orbit
      default run had zero accretion and zero ejection. Account to test: inflation f lowers the
      surface escape speed by √f and the Safronov number Θ = v_esc²/2v_K² by f, so close passes
      merge instead of scattering. Lower the inflation, and ramp it down as bodies grow
      (`inflationRamp`), and check whether ejections appear and how growth time scales with f.
      (fig6, fig7: holds in direction, ejections 0 → 61–90 as f goes 100 → 3, t ∝ f^−0.88; two
      corrections: f = 30 does eject, first at 160–840 orbits; Θ of the largest body alone does
      not predict the count.)
- [x] Headless batch runs via `runner.mjs` → MongoDB (socket transport through the research Server;
      `npm install` for socket.io-client). batch_001–006, 58 runs, ~15 min wall on 14–16 processes.
**Done when:** runaway → oligarchic → isolated spacing is shown quantitatively, not just visually.
✓ Met, with a finding: runaway and oligarchic growth show in the mass statistics, and the end
state sits at 5–10 mutual Hill radii, but it gets there through a giant-impact phase. During the
oligarchic phase the big bodies crowd at ≪ 1 R_H rather than sitting isolated.

### Stage 4 — Past the 5× line  [ PLANNED ]
(From Stage 2.)
- [ ] Collision search off the main thread (GPU spatial hash, or the worker pool once it has a SAB)
- [ ] Whole leapfrog on the GPU for k steps per read-back (removes the ~3–4 ms floor per step)
- [ ] COOP/COEP-capable serving (a per-site header in the Static Server, or a tiny dedicated
      server) → SharedArrayBuffer pool, and the sim itself in a Worker
**Done when:** max N at ~30 fps ≥ 5× the Stage 1 figure (≥ ~57k at 4 steps/frame).

### Stage 5 — Are the Stage 3 numbers robust?  [ DONE ]
(From Stage 3. Closed 2026-10-15.)
- [x] dt-convergence of the late-phase numbers at dt/2, dt/4: batch_007–011 (`node sweep.mjs
      dtconv`, 86 runs, 32 min), `stage3.py` dtconv table + fig9, FINDINGS §4. The default disk
      (spacing 7.6 / 7.0 / 7.6 R_H, 4–6 ejections, first ejection ~360–400 orbits) and f ≥ 10
      survive. The hot configs (f ≤ 3, fading) do not: fewer ejections and later first ejections
      at smaller dt. f = 1 grows faster at smaller dt (t½ 104 → 67), which reverses half of
      Stage 3's Correction 2. The default disk's final e (0.11–0.21) is unresolved.
- [x] More seeds: the inflation sweep 2 → 4 at every dt; the default disk 8 at every dt.
- [x] Why the oligarchs crowd: mostly the selection cut (it counted the field). The leaders alone
      sit at 1.5–4 R_H during 7–40 orbits, not ≪ 1. No inflation scheme (f = 1–100, fading q = 1)
      gives feeding-zone spacing: the leaders reach 5 R_H only once they hold most of the mass
      (FINDINGS §5, fig10). Fading inflation crowds them more.
**Done when:** the Stage 3 headline numbers are quoted with dt-converged error bars.
✓ Met for the default disk and f ≥ 10 (FINDINGS §4, mean ± SE over seeds at three dt). For the
hot configs the finding is that fixed-dt numbers do not converge by dt/4, which moved to Stage 6.

### Stage 6 — Converge the hot disks  [ PLANNED ]
(From Stage 5.)
- [ ] A step that resolves pericentre passes and close encounters (per-body adaptive step,
      or a hybrid à la MERCURIUS), keeping `smoketest.mjs` green. Then rerun batch_008/009's hot
      configs and check that ejection counts and first-ejection times stop moving with dt.
- [ ] Rerun the disk-mass sweep (batch_006) at dt/4, or with the new step. Heavy disks are hot,
      so their late-phase counts are unconverged.
- [ ] A larger N for the light disks (M ≤ 3e-4), the closest thing here to a quiet oligarchy
- [ ] Decide the demo default: fading inflation (f₀ = 30, q = 1) keeps fast early growth and
      restores scattering (Chris's call; still holds at dt/4, with fewer ejections)
*Deferred, not open:* fragmentation instead of perfect merging (Barnes et al. 2009); a 3D option
(would test whether the 2D geometry drives the oligarch crowding, FINDINGS §5).
**Done when:** the hot-disk ejection counts and first-ejection times agree within seed scatter
between two step settings.
