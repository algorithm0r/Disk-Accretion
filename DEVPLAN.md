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

## Not yet built
- Web Worker / GPU (Stage 2); quantitative regime checks (Stage 3); adaptive steps for
  close encounters (see the integrator note below).

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

### Stage 2 — Scale up  [ PLANNED ]
*Starting point (from Stage 1's profile):* the CPU path is bound by sqrt/div throughput in the
force sum (~2.6 ns/interaction), not by traversal or memory. So the levers are parallelism (this
machine has 20 threads, and the grouped walk is embarrassingly parallel over groups, so a worker
pool on a SharedArrayBuffer should scale near-linearly) and the GPU's fast f32 rsqrt. Collisions
are ~15% of a step and would need their own parallel pass.
- [ ] Move the sim to a Web Worker (SharedArrayBuffer or transferable snapshots to render)
- [ ] Split the grouped walk across a worker pool (groups are independent); needs COOP/COEP
      headers for SharedArrayBuffer, so file:// stops being enough
- [ ] GPU gravity (WebGPU compute, or WebGL2 fallback) for the particle-particle term
- [ ] Re-benchmark; pick the default path
**Done when:** max N at ~30 fps is at least ~5× the Stage 1 figure, logged.

### Stage 3 — Does it reproduce the known regimes?  [ PLANNED ]
- [ ] Mass-distribution plot over time (log-log cumulative), to look for the runaway tail
- [ ] Spacing of final protoplanets in mutual Hill radii, vs the ~5–10 expectation
- [ ] Sweep disk mass: planetesimal regime vs Toomre-unstable clumping
- [ ] Headless batch runs via `runner.mjs` → MongoDB
**Done when:** runaway → oligarchic → isolated spacing is shown quantitatively, not just visually.
