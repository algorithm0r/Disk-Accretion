# Disk Accretion — VALIDATION

*Where correctness is measured from.* Two kinds of evidence:

- **Verification** (does the code solve its equations right?): conservation of mass, momentum
  and angular momentum, energy with collisions off, Barnes-Hut force error against brute force,
  and dt-convergence. That evidence lives in `smoketest.mjs` and `analysis/FINDINGS.md` §4 and §6.
- **Validation** (do the equations reproduce known physics?): this file. Each benchmark is a
  setup with an exact or textbook answer, a stated tolerance, and a measured value. Each is also
  a one-click preset in the panel ("measured vs expected" readout), so the classroom readout and
  this table are the same measurement (`src/presets.js`).

Run them: `node smoketest.mjs` (fast versions, every change) and `node validate.mjs` (the full set,
~8 min, sections in parallel; writes `analysis/validation_table.md` and `analysis/validation.json`).

Units throughout: G = 1, star mass 1, planet orbit radius 1 (so one planet orbit = 2π time units).
Test particles are massless (they feel gravity, exert none and never touch each other).

## Results (2026-10-16, `node validate.mjs`)

| # | benchmark (preset) | setup | reference | tolerance | measured | verdict |
|---|---|---|---|---|---|---|
| 1 | Kepler orbits (`kepler`) | 16 test particles, a = 0.5–2, e = 0–0.85, star only, 100 orbits, **hybrid** integrator, dt 0.01 | exact two-body motion: T ∝ a^1.5, no apsidal precession, E constant | \|ΔE/E\| < 1e-9, apse drift < 1e-4°, period error < 1e-8 | \|ΔE/E\| 2.0e-11, apse drift 0.000°, period error 1.4e-11 | PASS |
| 1b | same, **leapfrog** (contrast) | dt 0.01 / 0.001 | as above | informational | worst \|ΔE/E\| at e = 0, 0.3, 0.6, 0.85: 4e-8, 4e-4, 6e-3, 0.38 (dt 0.01); 4e-12, 4e-6, 6e-5, 4e-3 (dt 0.001) | leapfrog is not exact at high e |
| 2 | Trojans (`trojans`) | **live star**, planet μ = 1e-3 circular at a = 1, 200 test particles near L4/L5 and the orbit, dt 0.005, 120 orbits | L4/L5 at ±60° from the planet | small-amplitude (< 5°) tadpoles centred within ±0.5° | +60.05° / −60.05°; all 200 on tadpoles | PASS |
| 2b | Trojans, **pinned star** | same, star fixed | no triangular equilibria without the indirect term (see note) | 0 tadpoles | 0 tadpoles; all 200 librate about 180° | PASS |
| 3 | Routh criterion (`routh`) | **live star**, planet mass swept 0.01–0.05; linear probes 1e-5 rad from L4/L5, plus a 1° swarm; dt 0.002, 300 orbits | L4/L5 linearly stable iff μ = m/(M★+m) < μ_c = (1 − √(23/27))/2 = 0.03852 | stability edge brackets μ_c, bracket ≤ 0.0005 wide | stable up to μ = 0.03846, unstable from 0.03865 | PASS |
| 3b | Routh, **pinned star** | m = 0.001, 0.01 | no L4 at all | probes leave | probes reach 120° at both | PASS |
| 4 | Chaotic zone (`gap`) | **live star**, planet circular, 2000 test particles on circular orbits across ±2.2× the expected zone, 300 orbits, μ = 1e-4 … 1e-2 | Wisdom (1980): cleared half-width Δa = 1.3 μ^{2/7} a | interior half-width within ±25% at each μ; exponent 0.286 ± 0.04 | interior half-width 0.100 / 0.140 / 0.200 / 0.242 / 0.358 vs 0.094 / 0.128 / 0.181 / 0.247 / 0.349 (μ = 1e-4, 3e-4, 1e-3, 3e-3, 1e-2); fit ∝ μ^0.269, coefficient 1.22 | PASS |
| 5 | Resonance gaps (`kirkwood`) | **live star**, planet e = 0.05, 6000 test particles a = 0.42–0.72 on circular orbits, 1000 planet orbits | gaps at a = (p/q)^{2/3}: 3:1 0.481, 5:2 0.543, 7:3 0.569, 2:1 0.630 | at μ = 3e-3: 3:1 and 2:1 each a > 3σ deficit within 0.01 of the prediction | μ = 3e-3: 3:1 at 0.482 (27% deep, 3.2σ), 2:1 at 0.632 (52%, 7.6σ); μ = 1e-2: 3:1 0.482, 5:2 0.542, 2:1 0.637; μ = 1e-3: 2:1 only; 7:3 never | PASS (3:1 marginal) |
| 6 | Hill stability (`hill`) | two planets m = 1e-5 each, circular, separation Δ mutual Hill radii, **hybrid** integrator (pinned star), 10⁴ orbits per Δ | Gladman (1993): no close encounter is possible for Δ > 2√3 = 3.464 | no encounter (< 1 R_H) at Δ ≥ 3.5; measured edge within 3.2–3.46 | encounters at Δ = 2.5, 3.0, 3.1, 3.2, 3.3 (at orbits 31, 264, 992, 1071, 4968); none at 3.4, 3.45, 3.5, 3.6, 4.0 | PASS |
| 7 | Toomre instability (`toomre`) | default disk, collisions off, disk mass 0.1 (Q ≈ 0.3) and 0.003 (Q ≈ 9), 1 orbit | a disk with Q < 1 fragments; Q ≫ 1 does not | peak clumping (count variance / Poisson) > 2× at Q ≈ 0.3, < 1.4× at Q ≈ 9 | 3.55× / 1.31× | PASS |
| 8 | Runaway → oligarchic → spacing (`disk`) | the default disk | runaway growth, then oligarchs ~5–10 mutual Hill radii apart (Kokubo & Ida) | — (statistical, many runs) | see FINDINGS §1 and §6: runaway peak M₁/⟨m⟩ ≈ 47 at ~18 orbits; final spacing 7.0 ± 0.4 R_H | evidence in FINDINGS |

## Notes on each benchmark

**1. Kepler.** The hybrid integrator moves every body along its exact Kepler orbit (universal
variables), so these errors are round-off. Leapfrog, the browser default, is fine for near-circular
orbits but not at high e with the default step: a pericentre at q = 0.075 spans only a few steps.
That is why science runs use the hybrid (FINDINGS §6).

**2. Trojans, and why the star must move.** With the star pinned at the origin there are *no*
Lagrange points L4/L5. The real L4 is an equilibrium because two pulls on a particle there cancel:
the planet's tangential pull, and the "indirect term" from the star accelerating toward the planet.
A pinned star never accelerates, so the planet's tangential pull is left unbalanced and particles
drift around the orbit. They end up librating about 180° (the L3 side) instead. This is not an
O(μ) correction; the triangular points vanish. It matters little for the disk runs (local close
encounters dominate), but it rules out co-orbital (Trojan-like) configurations among oligarchs
in the pinned-star disk. The libration centre also shifts outward with amplitude: tadpoles of 20°
amplitude centre ~1° beyond 60°. So the test uses small (< 5°) tadpoles.

**3. Routh.** Routh's criterion is about *linear* stability, so the verdict comes from probes placed
1e-5 rad from the exact L4/L5. Below μ_c they stay within ~0.01°; above it they grow exponentially
(e-folding in a few orbits). The visible 1° swarm behaves differently just above μ_c: its
instability saturates into a bounded orbit near L4 rather than flying off (nonlinear), and it
leaves only from μ ≈ 0.040. μ is the planet's share of the total mass, m/(M★+m). A first pass
compared μ_c with m/M★ and appeared to fail at m = 0.040, which is m/(M★+m) = 0.03846 < μ_c.

**4. Chaotic zone.** "Cleared" means removed (hit the planet or star, or ejected) or |Δa| > 5%.
Resonances outside the zone (e.g. 2:1) pump eccentricity but leave a in place, so they don't
count. Each edge is the first bin, walking outward from just beyond the co-orbital band, in which
fewer than half the particles are cleared. The interior edge matches Wisdom's 1.3 μ^{2/7} within
3–10% at every μ, with a fitted exponent of 0.269 against 2/7 = 0.286. The exterior zone is wider
and grows faster with μ (0.10 → 0.61 for μ = 1e-4 → 1e-2), as in the literature. It is reported,
not tested.

**5. Resonance gaps.** The real Kirkwood gaps are carved by slow chaotic diffusion over ~10⁵ Jupiter
orbits, out of reach here. What *is* reachable in 1000 orbits is resonant excitation: particles at
a commensurability are pumped out of the low-e population, and a narrow resonance also
redistributes a. At the 3:1 a deficit sits next to a pile-up just inside it. So the test is the
gap's *location*, not its depth:
- At μ = 3e-3 (3× Jupiter) the 3:1 and 2:1 sit at the predicted a within 0.002. The 3:1 is
  marginal at 3.2σ.
- At μ = 1e-2 the 5:2 appears too.
- At Jupiter's μ = 1e-3 only the 2:1 shows in 1000 orbits.
- The 7:3 (fourth order, strength ∝ e⁴) never shows.

The preset is therefore a location benchmark with a heavier planet, not a model of the
asteroid belt's history. There is also no gas, and no early Jupiter migrating through the belt.

**6. Hill stability.** Gladman's 2√3 is a guarantee: above it, close encounters are impossible. Below
it they are possible, but can take long to happen. The time to the first encounter rises steeply
toward the edge (31 → 264 → 992 → 1071 → 4968 orbits for Δ = 2.5 → 3.3). With 10⁴ orbits the
measured edge lies between 3.3 and 3.4, within 5% of 3.464, and nothing above 3.4 ever meets. A
longer run would push the measured edge closer to 3.46.

**7–8.** Measured in FINDINGS (§2 for Toomre, §1 and §6 for growth and spacing), with
dt-convergence. The presets show the same setups live.

## Amendments

*(Append-only, dated. Never edit the results table above in place; add a row here when a number
changes, with the commit.)*

- 2026-10-16: first version (Stage 8).
