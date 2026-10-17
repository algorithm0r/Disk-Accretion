# Disk Accretion — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-16 (Stage 8 close) — refreshed every session close; may carry unverified claims
**Verified:** 2026-10-15 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
Stages 1, 2 (target half met), 3, 5, 6 and 8 `[ DONE ]` (8 closed 2026-10-16). No stage active.
`[ PLANNED ]`: Stage 4 (past 5× scale) and Stage 7 (parked: the disk-mass sweep and light disks
under the hybrid; a faster hybrid; the demo-default call).

## State
- Public repo https://github.com/algorithm0r/Disk-Accretion; Pages serves `main` at
  https://algorithm0r.github.io/Disk-Accretion/. Pushes to `main` go live.
- Two integrators: leapfrog (browser default) and hybrid (`src/hybrid.js`: Kepler drift +
  MERCURIUS-style encounters, swept contacts; the one for science runs). Both run from the panel;
  the hybrid with the cpu and gpu backends was stepped in the browser pane @ d76667d, no console
  errors.
- smoke PASS 29/29 @ b81555e (2026-10-16), including hybrid checks 7a–d and 6 analytic benchmarks.
- Teaching presets (`src/presets.js`): Kepler, Trojans, Routh, chaotic zone, resonance gaps, Hill
  stability, Toomre, default disk, each with a live measured-vs-expected readout. `validate.mjs`
  PASS (7.9 min) → `VALIDATION.md`. Live Pages @ a121efb verified in the browser pane.
- Results in `analysis/FINDINGS.md` (§6 = converged hybrid numbers and which earlier headlines
  they change): 312 runs, MongoDB `diskAccretionDB` batch_001–017 plus local `analysis/runs/`
  (git-ignored). `python analysis/stage3.py` regenerates fig1–11 and `tables.md` (ran clean).

## Metrics
- Cost at 30 fps (i7-12700K, Node, matched in-page): leapfrog 6.6 ms/step at 10k, max N ~12.0k at
  4 steps/frame, ~41.6k at 1. Hybrid 15.7 ms/step, max N ~5.7k / ~17.6k (2.4×). GPU backend
  (leapfrog) ~27k / ~88k.
- Converged under the hybrid (8 seeds, dt 0.01 / 0.005 / 0.0025): ejections per run f = 1: 70 ± 3
  (from dt/2), f = 3: 53 ± 3, f = 10: 15 ± 1, fading-30: 23 ± 1, fading-100: 13 ± 1. First ejection
  in the hot disks ~220–280 orbits.
- Default disk (8 seeds, 3000 orbits): final e 0.14 ± 0.02 (resolved), spacing 7.0 ± 0.4 mutual
  Hill radii per run (pooled median 6.5), ejections 4–6 per run, t½ 2.6 orbits.
- Unchanged: runaway peak M₁/⟨m⟩ ~47 at ~18 orbits; mass-function index q = 2.37 at 10 orbits.
- Validation (VALIDATION.md):
  - Trojan centres 60.05° / −60.05°.
  - Routh edge between μ = 0.03846 and 0.03865 (μ_c 0.03852).
  - Chaotic zone ∝ μ^0.269 (Wisdom 2/7), within 3–10% of 1.3 μ^{2/7}.
  - Hill edge 3.3–3.4 (2√3 = 3.46).
  - Kepler exact (hybrid).
  - Resonance gaps located at 3:1 / 2:1 (μ = 3e-3; 3:1 marginal).

## Branches
- `main`, tracking `origin` = https://github.com/algorithm0r/Disk-Accretion (public; GitHub Pages serves `main`)

## Open
- The disk-mass sweep (batch_006) and the Toomre runs are still leapfrog at dt = 0.01; the heavy
  (hot) disks likely over-eject there (Stage 7).
- Residual flags with no trend: f = 10 final e (0.21 / 0.26 / 0.15), f = 3 t½ ±2%.
- The pinned star (all disk runs) has no L4/L5: no co-orbital configurations among oligarchs.
  The live star fixes it, but only with leapfrog.
- Chris's call: make fading inflation (f₀ = 30, q = 1) the demo default? Converged, it ejects 23
  per run (not 36–42).

## Next action
Chris's call: resume Stage 7 (the disk-mass sweep under the hybrid) or tune the teaching presets
after classroom use.

## Blockers
- none
