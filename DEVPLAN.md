# Disk Accretion — DEVPLAN
*Living document, not frozen. Update as the design evolves.*

## Built
- Scaffolded from engine v2 (vanilla-JS canvas + standard DB client). Demo "drifters"
  model runs in-browser and headless (smoke PASS @ 3d1c845, 2026-10-15).

## Not yet built
- The disk model itself: everything below.

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

**Collisions = perfect merge.** Merges conserve mass, momentum and angular momentum but dissipate
energy. That damps random velocities, so the disk stays cold and circular while bodies grow. The
merged body sits at the centre of mass and moves at the mass-weighted velocity. Radius ∝ m^{1/3}
times a **radius inflation factor** (real planetesimals are tiny relative to their orbits, so
without inflation nothing collides on watchable timescales; REBOUND-style sims inflate too).
Expose it as a parameter, because it sets the growth timescale.

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
### Stage 1 — Physics core + watchable prototype  [ ACTIVE ]
- [ ] `params.js`: N, disk mass, r_in/r_out, velocity dispersion, ε, dt, θ, radius inflation,
      steps-per-frame, brute-force/Barnes-Hut toggle
- [ ] `world.js`: SoA particle state, disk initialisation, leapfrog step, star term
- [ ] Gravity: brute-force reference + Barnes-Hut quadtree
- [ ] Collisions: spatial hash + perfect merge (compact or tombstone dead particles)
- [ ] `observer.js`: fast draw (ImageData/point sprites for small bodies, circles for big),
      colour by mass; zoom/pan nice-to-have
- [ ] Live readouts: N alive, largest mass, # bodies > threshold, L_z drift, fps / ms per step
- [ ] `smoketest.mjs`: real invariants (mass conserved incl. star/ejected bookkeeping;
      |ΔL_z|/L_z small over K orbits; N non-increasing; BH force vs brute-force error < tol on a
      small N)
- [ ] **Benchmark:** record max N at ~30 fps (brute vs BH) in DEVLOG
**Done when:** a disk of ≥ several thousand particles runs at a watchable frame rate in the
browser, visibly shows bodies sweeping up their lanes into a few large ones, and `smoketest.mjs`
asserts the conservation invariants.

### Stage 2 — Scale up  [ PLANNED ]
- [ ] Move the sim to a Web Worker (SharedArrayBuffer or transferable snapshots to render)
- [ ] GPU gravity (WebGPU compute, or WebGL2 fallback) for the particle-particle term
- [ ] Re-benchmark; pick the default path
**Done when:** max N at ~30 fps is at least ~5× the Stage 1 figure, logged.

### Stage 3 — Does it reproduce the known regimes?  [ PLANNED ]
- [ ] Mass-distribution plot over time (log-log cumulative), to look for the runaway tail
- [ ] Spacing of final protoplanets in mutual Hill radii, vs the ~5–10 expectation
- [ ] Sweep disk mass: planetesimal regime vs Toomre-unstable clumping
- [ ] Headless batch runs via `runner.mjs` → MongoDB
**Done when:** runaway → oligarchic → isolated spacing is shown quantitatively, not just visually.
