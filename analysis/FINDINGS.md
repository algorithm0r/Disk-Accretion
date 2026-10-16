# Disk Accretion — Stage 3 findings, with the Stage 5 and Stage 6 robustness checks (2026-10-15/16)

Each claim names the figure/table that carries it and how to regenerate it. All runs are
headless (`runner.mjs`), launched by `sweep.mjs`, stored in MongoDB `diskAccretionDB` (via the
research Server) and as local JSON under `analysis/runs/` (git-ignored). Figures and tables:
`python analysis/stage3.py` → `analysis/figures/`, `analysis/tables.md`.

Units: G = M_star = 1, r in AU-like units, time in orbits at r = 1. Disk 0.5–2.0, Σ ∝ r⁻¹,
dispersion 1% of v_circ, equal initial masses m₀ = M_disk / N, perfect merging, ε = 1e-3, dt = 0.01
(Stage 3); Stage 5 reruns the inflation sweep and the default disk at dt = 0.005 and 0.0025 (§4);
Stage 6 reruns the hot configs and the default disk with a hybrid symplectic integrator (§6).
**Read §6 before quoting any number from §1–5:** it has the converged numbers and lists, item by
item, which earlier headlines they change.

| batch | regenerate | what |
|---|---|---|
| batch_001 | `node sweep.mjs base` | default disk (N 10k, M 0.003, inflation 30), 4 seeds, 1000 orbits (pass 1) |
| batch_002 | `node sweep.mjs mass` | disk mass 1e-4 … 0.1, N 5000, 2 seeds, 1000 orbits (pass 1) |
| batch_003 | `node sweep.mjs inflation` | inflation 1, 3, 10, 30, 100, and fading (ramp q = 1) from 30 and 100; N 5000, M 0.003, 2 seeds, 1000 orbits |
| batch_004 | `node sweep.mjs toomre` | collisions off, M 0.003 … 0.1, N 10k, 3 orbits |
| batch_005 | `node sweep.mjs base3k` | batch_001's config, 8 seeds, 3000 orbits, per-sample big-body (k, a, e) — supersedes 001 |
| batch_006 | `node sweep.mjs mass3k` | batch_002's configs, 3000 orbits, per-sample (k, a, e) — supersedes 002 |
| batch_007 | `node sweep.mjs infl4` | batch_003's configs, seeds 3–4, dt = 0.01, per-sample (k, a, e) (003 + 007 = 4 seeds) |
| batch_008 | `node sweep.mjs infl005` | batch_003's configs, 4 seeds, dt = 0.005 |
| batch_009 | `node sweep.mjs infl0025` | batch_003's configs, 4 seeds, dt = 0.0025 |
| batch_010 | `node sweep.mjs base005` | batch_005's config, 8 seeds, 3000 orbits, dt = 0.005 |
| batch_011 | `node sweep.mjs base0025` | batch_005's config, 8 seeds, 3000 orbits, dt = 0.0025 |

batch_007–011 run together as `node sweep.mjs dtconv` (86 runs, 32 min at 16 processes).

| batch | regenerate | what (Stage 6, `integrator: 'hybrid'`, run names `_hyb`) |
|---|---|---|
| batch_012 / 013 / 014 | `node sweep.mjs hybconv` | f = 1, 3, 10 and both fading ramps (4 seeds) + the default disk (8 seeds), dt = 0.01 / 0.005 / 0.0025 |
| batch_015 / 016 / 017 | `node sweep.mjs hybmore` | contacts swept over each encounter substep: f = 1 and 3 seeds 1–8 (supersede 012–014 for those two), f = 10 and the ramps seeds 5–8 |

Stage 6: 168 runs, ~2.5 h wall at 16 processes.

## 1. Runaway → oligarchic → spacing: reproduced, with a 2D twist

**Runaway (yes).** In the default disk the largest body pulls away from the mean: M₁/⟨m⟩ climbs to
a peak of 31–61 (8 seeds) at 12.6–40 orbits, then falls as the field is consumed
(fig2_growth_modes, table "end of runaway"). The mass function grows a power-law tail whose
cumulative slope flattens through β = 3.3 → 2.2 → 1.35 → 0.72 at 1, 3, 10, 30 orbits; the
differential index q = β + 1 passes **2.35 ± 0.08 at 10 orbits**, the value runaway-growth models
give (q ≈ 2.5), but it is a moving snapshot, not a steady power law (fig1_mass_function, table
"power-law tail").

**Oligarchic (yes, in mass).** From ~3 to ~40 orbits the top ten bodies stay within a factor 1.5–5
of each other (M₁/M₁₀ ≈ 1.5–6) while pulling 10²–10³× away from the median body: a bimodal population of
comparable leaders over a field of small bodies (fig2 right).

**Spacing: lands in the 5–10 band, but not by quiet isolation.** With true semimajor axes
(fig3_hill_spacing, fig8_spacing_vs_time, tables):
- Default disk (8 seeds): median Δa / R_H,mutual = 0.70 (10 orbits) → 0.64 (30) → 3.4 (100) →
  6.5 (300) → 7.4 (1000) → **7.6 (3000; IQR 6.8–8.1, 14 gaps)**, median e 0.11.
- Every disk mass converges into the band and plateaus: 8.1 (M 1e-4), 7.7 (3e-4), 7.3 (1e-3),
  8.3 (3e-3), then ~5.0–5.8 for the Q ≲ 3 disks (1e-2 … 0.1) at 3000 orbits.
- **What differs from the 3D textbook picture:** during the oligarchic phase (10–30 orbits) the
  big bodies are *not* spaced at ~5–10 R_H; they crowd at ≪ 1 R_H (many ≥ 30 m₀ bodies on nearly
  the same orbits). *Amended (Stage 5, §5):* the "≪ 1 R_H" is mostly the selection cut, which at
  10–30 orbits admits 40–80 bodies, the leaders plus the mid-mass field. The leaders alone
  (k ≥ 30% of k_max) bottom out at ~1.5 R_H at 7–9 orbits and sit at 3–4 R_H by 25–40 orbits.
  That is still below the band, so the rest of this bullet stands. The 5–10 R_H spacing is reached only afterwards, by mergers and scattering
  among the oligarchs, and it then holds (300 → 3000 orbits). So the end state sits at the
  orbital-stability spacing, reached through a giant-impact phase rather than through
  feeding-zone isolation. Plausible causes, untested: a 2D disk has no vertical dimension to hide
  in, so encounters are far more likely to end in contact; and inflation 30 merges bodies that in
  reality would repel each other (see §3).
- Light disks stay cold: M = 1e-4 ends with 10–12 bodies ≥ 30 m₀ at e ≈ 0.03, the closest thing
  here to a quiet oligarchic system. Heavy disks end hot (e 0.17–0.37) with 2–4 survivors.

## 2. Disk mass: growth time and Toomre instability

- Growth time scales as **t(N halves) ∝ M_disk^−0.75** (t½ now interpolated between samples; slope
  unchanged at −0.76) over three decades (38 orbits at M = 1e-4 →
  0.20 orbits at M = 0.1; fig5_mass_sweep_N, table batch_006).
- Ejections per run by 3000 orbits rise with disk mass: 0 for M ≤ 3e-4, 0–1 at 1e-3, 2–6 at 3e-3,
  16–20 at 1e-2, 28–42 at 3e-2, 47–54 at 0.1. Bodies reach the star only for Q ≲ 3 (0–1 at 1e-2,
  1–4 at 3e-2, 10 at 0.1).
- **Toomre instability reproduced** (collisions off, fig4b_toomre_nocollisions, table batch_004):
  count variance / Poisson in polar cells peaks at **2.6 (Q = 0.93) and 3.1 (Q = 0.28)** within
  0.5–1 orbit, as sheared wakes and clumps; Q = 9.3 stays at ≤ 1.2 and Q = 2.8 at ~1.5. The
  structure is transient: by 2–3 orbits the wakes have heated the disk and it relaxes (Q = 0.28
  disk spreads radially). With collisions on (fig4_mass_regimes), the same disks simply grow
  ~15× faster; the clumps merge as they form, so no wakes are visible.

## 3. The radius-inflation account — mostly holds, with two corrections

The account (from the PA conversation): inflation f lowers the surface escape speed by √f and the
Safronov number Θ = v_esc² / 2v_K² by f, so close passes merge instead of scattering, which is why
the 150-orbit default run showed no ejection or accretion.

What the sweep shows (batch_003 + 007, fig6_inflation_growth, fig7_inflation_removal, table
"batch_003 + 007"). *Amended (Stage 5):* now 4 seeds, with t½ interpolated between samples; the
three right-hand columns are the same configs at dt = 0.0025 (batch_009). Ranges are over seeds.
Bold marks the numbers that move with dt (§4).

| inflation | t(N halves) | ejected / accreted by 1000 orbits | first ejection | big-body e | dt/4: ejected / accreted | dt/4: first ejection | dt/4: e |
|---|---|---|---|---|---|---|---|
| 100 | 1.75 | 0 / 0 | none | 0.05–0.14 | 0 / 0 | none | 0.08–0.14 |
| 30 | 3.24 | 1–5 / 0 | 130–840 orbits | 0.09–0.18 | 1–5 / 0 | 160–730 | 0.10–0.27 |
| 10 | 7.36 | 15–20 / 1–2 | 110–190 | 0.14–0.35 | 14–17 / 0–3 | 110–240 | 0.08–0.32 |
| 3 | 22.7 | **61–90 / 8–21** | **80–120** | 0.33–0.61 | **43–60 / 4–8** | **200–250** | 0.30–0.47 |
| 1 | **104** (dt/4: 67) | 45–78 / 16–35 | 390–560 | 0.47–0.51 | 66–86 / 10–19 | 320–440 | 0.35–0.48 |
| 30, fading (q = 1) | 3.93 | **32–42 / 7–11** | **70–140** | 0.41–0.55 | **21–33 / 2–4** | **160–230** | 0.26–0.49 |
| 100, fading (q = 1) | 2.0 | **20–25 / 6–7** | **80–110** | 0.43–0.53 | **9–17 / 2–6** | **180–310** | 0.35–0.54 |

- **Holds:** lowering inflation turns merging into scattering. Ejections rise from 0 (f = 100) to
  61–90 (f = 3), bodies start falling into the star, and big-body eccentricities rise from ~0.06
  to ~0.5. Growth slows as **t ∝ f^−0.88**, between the geometric (f⁻¹) and gravitationally focused
  (f^−½, 2D) limits and nearer the geometric one. *Amended (Stage 5):* at dt/4 the slope is −0.80,
  because the f = 1 point moves (t½ 104 → 67). Over f ≥ 3 alone it is −0.73 to −0.74 at every dt.
- **Correction 1: "zero at 150 orbits" was partly timing.** At f = 30 ejections do happen, but late:
  all 8 default-disk seeds make their first ejection between 160 and 790 orbits (1–11 per run by
  3000 orbits). The 150-orbit run stopped just before the scattering phase.
- **Correction 2: Θ of the largest body doesn't predict the count alone.** f = 1 ejects *fewer*
  bodies than f = 3 by 1000 orbits, and the fading-inflation runs have the highest final Θ (1.6–2.0)
  but fewer ejections than f = 3 (Θ 0.5). Ejection needs a high Θ *and* massive
  scatterers early enough: at f = 1 growth is so slow that the first ejection waits until ~400–500
  orbits, and 370–451 of the 5000 bodies are still unmerged at 1000 orbits.
  *Amended (Stage 5):* the f = 1 half is a dt artifact. At dt/4, f = 1 grows faster (148–169 bodies
  left at 1000 orbits) and ejects 66–86, more than f = 3's 43–60. The fading half survives: at
  dt/4, fading from 30 ejects 21–33 and from 100 ejects 9–17, both below f = 3.
- **Useful by-product:** fading inflation (f₀ = 30, q = 1) keeps the fast, watchable early growth
  (t½ 3.9 vs 3.2 orbits) while restoring scattering, ejection and star-grazing. It's a better
  demo default than constant inflation if realism of the late phase matters. (It still holds at
  dt/4, with fewer of each: 21–33 ejected, 2–4 accreted.)

## 4. Stage 5: which numbers survive at dt/4

The same configs were rerun at dt = 0.01, 0.005 and 0.0025 (fig9_dt_convergence). The table
"Stage 5 — dt-convergence" in tables.md gives mean ± SE, the relative change Δ from dt to dt/4,
and z = Δmean / combined SE. The dynamics are chaotic, so each dt gives a fresh realisation. The
test therefore compares ensembles (4 seeds per inflation config, 8 for the default disk), and
|z| < 2 counts as converged within seed scatter.

**Survive (dt-converged within seed scatter):**
- **Default disk (f = 30, N 10k, 3000 orbits):**
  - Final spacing, pooled median: **7.6 → 7.0 → 7.6** R_H,mutual (IQR 6.8–8.1 / 5.7–8.0 /
    6.4–9.3). Per-run mean: 7.9 ± 0.5 / 6.9 ± 0.4 / 8.2 ± 0.7.
  - The spacing path also holds: 0.6–0.7 at 10 orbits, 2.3–3.4 at 100, 6.2–7.4 at 1000.
  - Ejections per run: 5.4 ± 1.1 / 3.6 ± 0.7 / 5.9 ± 0.9 (ranges 1–11 / 1–6 / 1–9).
  - First ejection: 374 ± 75 / 356 ± 64 / 400 ± 184 orbits.
  - No accretion at any dt. t½: 2.62 / 2.63 / 2.63 orbits.
- **Constant inflation f = 10, 30, 100:** every quantity (ejected, accreted, first ejection, final
  e, final spacing, t½) is within seed scatter. The one borderline case is f = 10 ejections, 18.5
  → 15.5 (z = −2.2).
- **Growth times** of every config except f = 1 (changes ≤ 2%). This includes the fading ramps
  and the f ≥ 3 growth exponent (−0.73 / −0.74 / −0.74).
- **The qualitative inflation account (§3).** At dt/4, ejections still fall monotonically with
  inflation for f ≥ 3: 54 (f = 3) → 16 (10) → 2 (30) → 0 (100). Bodies reach the star only at
  f ≤ 10 or with a fading ramp, and big-body e still rises from ~0.1 to ~0.4.

**Do not survive (dt-dependent, with a consistent sign):** the scattering-heavy configs, f ≤ 3
and both fading ramps, where big-body e ≈ 0.4–0.5. At smaller dt they scatter *less*:
- Ejections fall 26–44%: f = 3 76 → 54, fading-30 36 → 26, fading-100 22.5 → 12.5.
- Accretion onto the star falls 35–67%.
- The first ejection comes about twice as late: f = 3 103 → 218 orbits, fading-30 98 → 205,
  fading-100 93 → 228. All three were **still moving between dt/2 and dt/4** (160 → 218,
  175 → 205, 160 → 228), so the dt/4 values are not converged either; read them as lower bounds.
- The final spacing widens: f = 3 4.2 → 9.2 R_H, fading-30 2.7 → 4.7.
- Final e falls 14–19% in each, but within seed scatter.

f = 1 is dt-dependent the other way: it grows faster at smaller dt (t½ 104 → 72 → 67, z = −28)
and ejects more (57 → 75).

**Unresolved: the default disk's final big-body e.** The per-run mean is 0.14 ± 0.02 / 0.11 ±
0.02 / 0.21 ± 0.02 (z = 2.2); the pooled median is 0.11 / 0.07 / 0.16. It is non-monotonic in
dt, so it may be scatter rather than a trend. Quote it as "e ≈ 0.1–0.2".

**Not rerun:** the disk-mass sweep (batch_006) and the Toomre runs (batch_004). The M = 0.003
default disk is the only disk mass checked. The heavy disks (e 0.17–0.37 at the end, 16–54
ejections) are in the hot, scattering regime that failed the test here, so treat their
late-phase counts as unconverged.

**A likely cause (measured in isolation, not tested in the full runs):** fixed-dt leapfrog
under-resolves eccentric orbits near the star. A star-only orbit with a = 1, started at
apocentre, has this peak |ΔE/E| over 20 orbits (same KDK step as `world.js`):

| e (pericentre q) | dt 0.01 | dt 0.005 | dt 0.0025 |
|---|---|---|---|
| 0.5 (0.5) | 2.7e-4 | 6.7e-5 | 1.7e-5 |
| 0.8 (0.2) | 1.3e-2 | 3.4e-3 | 8.5e-4 |
| 0.9 (0.1) | 2.3e-1 | 5.8e-2 | 1.5e-2 |

The inner disk edge gets ~220 steps per orbit, but at dt = 0.01 a pericentre pass at q = 0.1–0.2
spans only a few steps. On its own the error oscillates rather than accumulates. A body perturbed
mid-pericentre, though, keeps the wrong energy, and hot disks are what put bodies on these
orbits. The other candidate is close body-body encounters at a hot disk's higher relative speeds.
This check does not separate the two. The fix is a step that resolves pericentres and close
encounters (adaptive or hybrid; DEVPLAN integrator note). Until then, hot-disk removal counts
carry the dt dependence above.

## 5. Stage 5: do the oligarchs crowd? Lower and fading inflation

The Stage 3 big-body cut (k ≥ max(30 m₀, 5% of k_max)) admits 40–80 bodies at 10–30 orbits in the
default disk. Feeding-zone spacing is a claim about the *leaders*, so this section measures those
alone (k ≥ 30% of k_max). It tracks three things:
- the leaders' spacing in R_H,mutual;
- how far their eccentric excursions reach, e·a / R_H (above ~1, a neighbour a few R_H away is
  on a crossing orbit);
- the share of the remaining disk mass the leaders hold.

Feeding-zone spacing would show as leaders at ≥ 5 R_H while that share is still small. Sources:
fig10_leader_spacing and the table "Stage 5 — spacing of the leaders", with dt = 0.005 and 0.0025
pooled (16 default-disk runs, 8 per inflation config). dt = 0.01 is left out because §4 found the
spacing of the hot configs unconverged there.

- **Default disk.** The leaders' median spacing dips to ~1.5 R_H at 7–9 orbits, recovers to
  ~3.7 R_H by 25–35 orbits, and reaches 5 R_H only at ~100–130 orbits. Over the same window the
  Stage 3 cut gives 0.5–0.7. So the crowding is real but milder than "≪ 1 R_H": the leaders sit at
  1.5–4 R_H with e·a/R_H ≈ 1–1.5, i.e. on nearly crossing orbits.
- **No config shows feeding-zone spacing.** At every constant inflation (f = 1, 3, 10, 30, 100) the
  leaders reach ≥ 5 R_H only once they hold most of the remaining mass, so the spacing arrives
  with the field's depletion: the giant-impact phase, at every f.

  | time | share of remaining mass in the leaders | median leader spacing |
  |---|---|---|
  | 3 t½ | 0.12–0.18 | 1.9–2.5 R_H |
  | 10 t½ | ~0.4 | 2.9–5.8 R_H |
  | 30 t½ | 0.72–0.76 | 3.7–7.4 R_H |

  Lower inflation (f = 3, 10) gets there somewhat sooner in units of t½ (4.8–5.8 R_H at 10 t½, against
  ~3 at f = 30 and 100). But its leaders are hotter (e·a/R_H 1.6–2.4), the opposite of quiet
  isolation.
- **Fading inflation makes the crowding worse.** At 10–30 t½ the leaders sit at 1.4–2.4 R_H, with
  e·a/R_H 2–4.5, while holding only 0.24–0.42 of the mass, and there are 2.5–3× as many of them as
  at the same f₀ held constant. A plausible reading (untested): small bodies keep their inflated radii while big
  ones shrink toward true density, so the leaders sweep up the field less well and many
  comparable bodies coexist on crossing orbits. Both ramps reach the band only after
  ~300–600 orbits.
- **The crowding is not inflated radii overlapping Hill spheres.** For equal masses the contact
  separation is 2R / R_H,mutual = 6.75e-3 · f / a: 0.2 at f = 30 and 0.68 at f = 100 (a = 1).
  Bodies merge well inside their mutual Hill radius at every f tested, so the merge criterion does
  not short-circuit Hill-scale dynamics.
- **Untested:** what drives the crowding. One candidate is the 2D geometry: with no vertical
  dimension, encounters end in contact far more often. The other is dynamical friction too weak
  to keep the leaders' e·a below R_H. Telling them apart needs a 3D option or many more field
  bodies per leader.

## 6. Stage 6: the hybrid integrator, and which numbers change

**The integrator** (`src/hybrid.js`; DEVPLAN integrator note). It is MERCURIUS-style with a fixed
star. Every body drifts along its exact Kepler orbit. Body-body forces are split per pair by a
smooth changeover at 3 Hill radii: the far part goes in the leapfrog kicks, and bodies predicted
to come within the changeover radius during a step are integrated together over the drift by an
adaptive Dormand–Prince 5(4) at 1e-11. Contact is found inside that integration, swept over each
substep, so it happens at the right time. Leapfrog stays in the code (`integrator: 'leapfrog'`,
still the browser default) for comparison.

**What the smoketest shows** (`node smoketest.mjs`, checks 7a–d):

| check | hybrid | leapfrog |
|---|---|---|
| star-only e = 0.9 orbit, peak \|ΔE/E\| over 20 orbits at dt 0.01 | 7.6e-14 | 0.23 |
| two-body flyby to 2.0 R_H (inside the switch): position error vs a dt = 1e-5 reference | 4.9e-7 | 2.1e-4 |
| same flyby, peak \|ΔE/E\| | 2.5e-8 | 1.5e-7 |
| disk with self-gravity, collisions off, \|ΔE/E\| over 2 orbits at dt 0.01 | 2.9e-9 | 1.8e-4 |
| brute-gravity disk with merging: mass error / L_z drift | 4e-15 / 3e-14 | 4e-15 / 2e-15 |
| grazing collision: contact found inside the drift; mass, L_z conserved | yes, L_z 3e-16 | — |

The leapfrog energy error that §4 traced to pericentres and close encounters is gone in both
cases. The flyby's remaining 2.5e-8 is the ordinary second-order splitting error, about
(m/M)·(Ω·dt)², and it falls 16× at dt/4.

**Convergence** (batch_012–017; fig11_hybrid_convergence; table "Stage 6 — hybrid integrator
dt-convergence" in tables.md). The hot configs have 8 seeds and the default disk 8, each at
dt = 0.01, 0.005, 0.0025. A quantity counts as converged when both |z(dt → dt/4)| and
|z(dt/2 → dt/4)| are < 2. Mean ± SE per run:

| config | ejected (dt / dt/2 / dt/4) | accreted | first ejection (orbits) | final e (≥30 m₀) | final Δa/R_H |
|---|---|---|---|---|---|
| f = 1 | 59 ± 3 / **69 ± 4 / 70 ± 3** | 14 / 15 / 14 | 425 / 374 / 415 | 0.39 / 0.39 / 0.41 | 3.9 / 4.5 / 4.1 |
| f = 3 | 52 ± 2 / 50 ± 3 / 53 ± 3 | 6.0 / 7.0 / 6.5 | 226 / 243 / 218 | 0.30 / 0.31 / 0.35 | 6.9 / 8.1 / 8.7 |
| f = 10 | 14 ± 1 / 16 ± 2 / 15 ± 1 | 1.4 / 0.9 / 0.6 | 155 / 145 / 183 | 0.21 / 0.26 / 0.15 † | 8.2 / 7.2 / 7.2 |
| fading from 30 | 23 ± 1 / 22 ± 1 / 23 ± 2 | 4.9 / 4.5 / 3.5 | 231 / 244 / 283 | 0.40 / 0.41 / 0.40 | 6.1 / 5.2 / 6.6 |
| fading from 100 | 13 ± 1 / 12 ± 1 / 13 ± 2 | 2.5 / 3.0 / 3.0 | 281 / 256 / 230 | 0.37 / 0.41 / 0.40 | 6.7 / 7.4 / 7.3 |
| default disk | 4.3 ± 0.6 / 4.5 ± 0.4 / 5.5 ± 0.9 | 0 / 0 / 0.1 | 323 / 266 / 501 | **0.14 / 0.16 / 0.14** | 7.2 / 7.3 / 7.0 |

- **The hot configs converge.** For f = 3 and both fading ramps, every quantity holds within seed
  scatter across a factor 4 in dt: ejections, accretion, first ejection, final e, spacing and t½.
  So does every quantity for f = 1 except ejections, which need dt ≤ 0.005 (59 → 69 → 70; at
  dt = 0.01 the hybrid under-ejects by ~15%). Quote f = 1 from dt ≤ 0.005.
- **The default disk's final e is resolved: 0.14 ± 0.02** (0.14 / 0.16 / 0.14). Stage 5's 0.21 at
  leapfrog dt/4 was the outlier.
- **Still flagged:** † f = 10's final e (z = −3.6 from dt/2 to dt/4, with no monotone trend), and
  f = 3's t½ wobbling by 2% (22.6 / 23.1 / 22.7). Neither moves a conclusion. Out of 72 z-tests a
  few |z| > 2 are expected by chance.
- **Contacts are resolved in the drift.** Fewer than 0.05% of contacts (f = 1) and ≤ 0.02%
  elsewhere are left to the end-of-step grid. Those are mostly a body that grew in a mid-drift merge
  and then overlaps a neighbour. The first hybrid pass checked contact only at substep ends, and
  10% of f = 1 contacts slipped through to the grid. That delayed merges, and its f = 1 t½ at
  dt = 0.01 read 71 orbits instead of 67. The swept check fixed both; batch_015–017 supersede
  batch_012–014 for f = 1 and f = 3.

**What changes in the Stage 3 and Stage 5 headlines** (hybrid at converged dt, against what §1–5
said):

1. **Hot-disk removal counts.** Stage 3's leapfrog at dt = 0.01 over-ejected in the hot disks:

   | config | Stage 3 (leapfrog dt = 0.01) | hybrid |
   |---|---|---|
   | f = 3 | 61–90 | 52 ± 3 |
   | fading 30 | 36–42 | 23 ± 1 |
   | fading 100 | 20–22 | 13 ± 1 |

   It also fed the star 2–3× too often. Stage 5's leapfrog dt/4 removal counts turn out to be close
   to the converged ones: for ejections and accretion, every |z(HY vs LF @ dt/4)| ≤ 1.3. Stage 5
   read them as lower bounds; they are not far off.
2. **First ejection in the hot disks comes at ~220–280 orbits, not ~100.** Leapfrog at dt = 0.01
   ejected the first body 2–3× too early. Stage 5 reported 205–228 at dt/4 and said it was still
   moving. The hybrid agrees with those values (z ≤ 2.3) and stays put across dt.
3. **The inflation account (§3) holds, with Stage 5's reversal of Correction 2 confirmed.** Converged
   ejections per run fall monotonically as inflation rises:

   | inflation | 1 | 3 | 10 | 30 | 100 |
   |---|---|---|---|---|---|
   | ejections per run | 70 ± 3 | 53 ± 3 | 15 ± 1 | ~2 | 0 |

   All at N = 5000 and 1000 orbits. The f = 30 and 100 values are leapfrog at dt/4, which converged
   there in Stage 5. So f = 1 ejects *more* than f = 3. Stage 3's "f = 1 ejects fewer" was a dt
   artifact, as §4 suspected. Fading inflation still restores scattering (23 ejections against ~2
   at constant f = 30, same N and duration), but at about half what §3 said.
4. **Final spacing of the default disk: 7.0 ± 0.4 R_H per run (pooled median 6.5),** against
   Stage 3's 7.6 (per-run 7.9 ± 0.5). That is a small shift (z = −1.6), still inside the 5–10 band.
   The hot configs' final spacing, which Stage 5 found unconverged (f = 3: 4.2 → 9.2), converges to
   ~7–9 R_H (f = 3), ~4 (f = 1) and ~5–7 (ramps).
5. **Unchanged:** the growth-phase numbers. The runaway peak M₁/⟨m⟩ is 47–48 around 18–19 orbits
   (Stage 3: 41 ± 4 at 21). The mass-function index at 10 orbits is q = 2.37–2.38 (Stage 3: 2.35).
   t½ for every config agrees with Stage 5's dt/4 values, and so does the growth exponent.

**Cost** (`node bench.mjs --modes bh --integrator leapfrog|hybrid --spf 4|1`, i7-12700K; matched
in the browser):

| | ms/step at 10k | max N at 30 fps, 4 steps/frame | max N at 30 fps, 1 step/frame |
|---|---|---|---|
| leapfrog | 6.6 | ~12,000 | ~41,600 |
| hybrid | 15.7 | ~5,700 | ~17,600 |

In-page with 4 steps/frame: leapfrog 34.9 fps at 10k, hybrid 14.8 fps at 10k and 33.7 at 5k. The
hybrid costs ~2.4×, because about half the bodies of the dense early disk are inside some pair's
3 R_H changeover radius at any time. That is MERCURIUS's known cost in planetesimal disks. Since it
halves the browser's capacity, leapfrog stays the default; the hybrid is the integrator for
science runs and is selectable in the panel. Batch wall time is 1.4–2.3× leapfrog's.

**Not rerun with the hybrid:** the disk-mass sweep (batch_006) and the Toomre runs (batch_004).
The heavy disks are hot, so their late-phase counts still carry leapfrog's dt = 0.01 bias (likely
over-ejection, by the pattern in item 1).

## Caveats

- 2D, perfect merging (no fragmentation). Under fixed-dt leapfrog the closest encounters and
  pericentre passes are under-resolved (DEVPLAN integrator note). §4 found the default disk and
  f ≥ 10 hold at dt/4 while the hot configs did not; §6 reran those with the hybrid integrator, which
  converges them. Numbers in §1–3 for hot disks are superseded by §6. The disk-mass sweep and the
  Toomre runs are still leapfrog at dt = 0.01.
- Seeds: 8 for the default disk (at each of the three dt, both integrators), 4 per inflation config
  under leapfrog and 8 per hot config under the hybrid (at each dt), and 2 per disk-mass point. The sweep tables show each seed (a/b/…), so the scatter is visible.
- Spacing uses bodies with k ≥ max(30 m₀, 5% of the largest), bound orbits inside r = 5.
