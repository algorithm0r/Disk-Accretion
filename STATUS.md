# Disk Accretion — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-15 (Stages 2 + 3 close; Pages prep) — refreshed every session close; may carry unverified claims
**Verified:** 2026-10-15 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
Stages 1, 2 (target half met) and 3 `[ DONE ]` (closed 2026-10-15). No stage active.
`[ PLANNED ]`: Stage 4 (past 5× scale: GPU collisions, multi-step GPU) and Stage 5 (robustness
of the Stage 3 numbers: dt-convergence, more seeds).

## State
- Published 2026-10-15: public repo https://github.com/algorithm0r/Disk-Accretion, Pages from
  `main` at https://algorithm0r.github.io/Disk-Accretion/. Live page loaded and ran in the browser
  pane (cpu backend, bodies merging, no console errors) @ c1da12c.
- Browser sim with three force backends: cpu (default), workers (4-worker pool), gpu (WebGPU
  all-pairs). Both off-thread backends were stepped from the UI in the browser pane @ b457288.
- smoke PASS 17/17 @ b457288 (2026-10-15): mass, L_z, energy, merge conservation, BH force
  error, and the pool's split matching the serial walk bit for bit.
- Stage 3 results in `analysis/FINDINGS.md`: 58 runs, MongoDB `diskAccretionDB` batch_001–006
  plus local `analysis/runs/` (git-ignored); figures regenerate with `python analysis/stage3.py`.

## Metrics
- Max N at 30 fps (i7-12700K / RTX 3070 Ti): CPU tree ~11.5k at 4 steps/frame, ~40k at 1;
  GPU ~27k / ~88k (2.2–2.4×); worker pool ~1.9× per step at best (4 workers).
- Runaway: M₁/⟨m⟩ peaks at 31–61 around 13–40 orbits; mass-function index q = 2.35 at 10 orbits.
- Final spacing (default disk, 8 seeds, 3000 orbits): median 7.6 mutual Hill radii (IQR 6.8–8.1).
- Growth time ∝ M_disk^−0.75 and ∝ inflation^−0.88. Ejections per run: 0 at inflation 100,
  61–90 at inflation 3.

## Branches
- `main` (local only, no remote)

## Open
- **Publish pending:** public repo algorithm0r/Disk-Accretion + Pages from main, approved by Chris
  (via the PA session) but blocked in the build session by the auto-mode classifier; Pages prep done.
- Accepted gap: fixed-dt leapfrog under-resolves the closest encounters. The late-phase numbers
  (ejection counts, final e) are unconverged in dt until Stage 5 runs.
- Finding to explain (Stage 5): oligarchs crowd at ≪ 1 R_H in 2D before the giant-impact phase
  spaces them out.
- Chris's call: make fading inflation (f₀ = 30, q = 1) the demo default? It keeps the fast early
  growth and brings back scattering and ejection.

## Next action
Stage 5: rerun batch_003 and batch_005 at dt/2 and dt/4 (`--set dt=0.005`), then compare.

## Blockers
- none
