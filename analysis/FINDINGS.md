# Disk Accretion — Stage 3 findings (2026-10-15)

Each claim names the figure/table that carries it and how to regenerate it. All runs are
headless (`runner.mjs`), launched by `sweep.mjs`, stored in MongoDB `diskAccretionDB` (via the
research Server) and as local JSON under `analysis/runs/` (git-ignored). Figures and tables:
`python analysis/stage3.py` → `analysis/figures/`, `analysis/tables.md`.

Units: G = M_star = 1, r in AU-like units, time in orbits at r = 1. Disk 0.5–2.0, Σ ∝ r⁻¹,
dispersion 1% of v_circ, equal initial masses m₀ = M_disk / N, perfect merging, ε = 1e-3, dt = 0.01.

| batch | regenerate | what |
|---|---|---|
| batch_001 | `node sweep.mjs base` | default disk (N 10k, M 0.003, inflation 30), 4 seeds, 1000 orbits (pass 1) |
| batch_002 | `node sweep.mjs mass` | disk mass 1e-4 … 0.1, N 5000, 2 seeds, 1000 orbits (pass 1) |
| batch_003 | `node sweep.mjs inflation` | inflation 1, 3, 10, 30, 100, and fading (ramp q = 1) from 30 and 100; N 5000, M 0.003, 2 seeds, 1000 orbits |
| batch_004 | `node sweep.mjs toomre` | collisions off, M 0.003 … 0.1, N 10k, 3 orbits |
| batch_005 | `node sweep.mjs base3k` | batch_001's config, 8 seeds, 3000 orbits, per-sample big-body (k, a, e) — supersedes 001 |
| batch_006 | `node sweep.mjs mass3k` | batch_002's configs, 3000 orbits, per-sample (k, a, e) — supersedes 002 |

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
  the same orbits). The 5–10 R_H spacing is reached only afterwards, by mergers and scattering
  among the oligarchs, and it then holds (300 → 3000 orbits). So the end state sits at the
  orbital-stability spacing, reached through a giant-impact phase rather than through
  feeding-zone isolation. Plausible causes, untested: a 2D disk has no vertical dimension to hide
  in, so encounters are far more likely to end in contact; and inflation 30 merges bodies that in
  reality would repel each other (see §3).
- Light disks stay cold: M = 1e-4 ends with 10–12 bodies ≥ 30 m₀ at e ≈ 0.03, the closest thing
  here to a quiet oligarchic system. Heavy disks end hot (e 0.17–0.37) with 2–4 survivors.

## 2. Disk mass: growth time and Toomre instability

- Growth time scales as **t(N halves) ∝ M_disk^−0.75** over three decades (40 orbits at M = 1e-4 →
  0.25 orbits at M = 0.1; fig5_mass_sweep_N, table batch_006).
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

What the sweep shows (batch_003, fig6_inflation_growth, fig7_inflation_removal, table batch_003):

| inflation | t(N halves) | ejected / accreted per run by 1000 orbits | first ejection | big-body e |
|---|---|---|---|---|
| 100 | 2.0 | 0 / 0 | none | 0.05–0.07 |
| 30 | 3.6 | 1–5 / 0 | 160–840 orbits | 0.17–0.18 |
| 10 | 7.9 | 15–20 / 1 | 110–190 | 0.14–0.35 |
| 3 | 30 | 61–90 / 8–21 | 100–120 | 0.33–0.61 |
| 1 | 110 | 49–78 / 18–28 | 390–520 | 0.48–0.50 |
| 30, fading (q = 1) | 4.5 | 36–42 / 9 | 100–140 | 0.41–0.50 |
| 100, fading (q = 1) | 2.0 | 20–22 / 6–7 | 80–110 | 0.43–0.48 |

- **Holds:** lowering inflation turns merging into scattering. Ejections rise from 0 (f = 100) to
  61–90 (f = 3), bodies start falling into the star, and big-body eccentricities rise from ~0.06
  to ~0.5. Growth slows as **t ∝ f^−0.88**, between the geometric (f⁻¹) and gravitationally focused
  (f^−½, 2D) limits and nearer the geometric one.
- **Correction 1: "zero at 150 orbits" was partly timing.** At f = 30 ejections do happen, but late:
  all 8 default-disk seeds make their first ejection between 160 and 790 orbits (1–11 per run by
  3000 orbits). The 150-orbit run stopped just before the scattering phase.
- **Correction 2: Θ of the largest body doesn't predict the count alone.** f = 1 ejects *fewer*
  bodies than f = 3 by 1000 orbits, and the fading-inflation runs have the highest final Θ (1.8 for
  f₀ = 100) but fewer ejections than f = 3 (Θ 0.4). Ejection needs a high Θ *and* massive
  scatterers early enough: at f = 1 growth is so slow that the first ejection waits until ~400–500
  orbits, and 370–436 of the 5000 bodies are still unmerged at 1000 orbits.
- **Useful by-product:** fading inflation (f₀ = 30, q = 1) keeps the fast, watchable early growth
  (t_half 4.5 vs 3.6 orbits) while restoring scattering, ejection and star-grazing. It's a better
  demo default than constant inflation if realism of the late phase matters.

## Caveats

- 2D, perfect merging (no fragmentation), fixed dt with under-resolved closest encounters
  (DEVPLAN integrator note). The late-phase scattering numbers in §3 are exactly the regime where
  that limit bites hardest; they need a dt-convergence check before anyone quotes them.
- Seeds: 8 for the default disk, 2 per sweep point; the sweep tables show both seeds (a/b) so the
  scatter is visible.
- Spacing uses bodies with k ≥ max(30 m₀, 5% of the largest), bound orbits inside r = 5.
