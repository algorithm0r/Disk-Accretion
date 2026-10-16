# Disk Accretion — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-15 (Stage 5 close) — refreshed every session close; may carry unverified claims
**Verified:** 2026-10-15 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
Stages 1, 2 (target half met), 3 and 5 `[ DONE ]` (all closed 2026-10-15). No stage active.
`[ PLANNED ]`: Stage 4 (past 5× scale: GPU collisions, multi-step GPU) and Stage 6 (converge the
hot disks: a step that resolves pericentres and close encounters).

## State
- Public repo https://github.com/algorithm0r/Disk-Accretion; Pages serves `main` at
  https://algorithm0r.github.io/Disk-Accretion/ (live page verified running @ c1da12c).
- Browser sim with three force backends: cpu (default), workers, gpu (WebGPU). Stepped from the UI
  in the browser pane @ b457288.
- smoke PASS 17/17 @ db96a0d-dirty (2026-10-15; sim core unchanged since b457288).
- Results in `analysis/FINDINGS.md`: 144 runs, MongoDB `diskAccretionDB` batch_001–011 plus local
  `analysis/runs/` (git-ignored). `python analysis/stage3.py` regenerates fig1–10 and `tables.md`
  (ran clean this session).
- Stage 5 dt sweep (batch_007–011): 86 runs in 32 min, all inserted in MongoDB.

## Metrics
- Max N at 30 fps (i7-12700K / RTX 3070 Ti): CPU tree ~11.5k at 4 steps/frame, ~40k at 1;
  GPU ~27k / ~88k.
- Default disk (8 seeds, 3000 orbits), dt-converged to dt/4:
  - final spacing 7.6 / 7.0 / 7.6 mutual Hill radii at dt 0.01 / 0.005 / 0.0025
  - ejections 5.4 ± 1.1 / 3.6 ± 0.7 / 5.9 ± 0.9 per run
  - t½ 2.6 orbits
- Final big-body e of the default disk: 0.11–0.21, unresolved in dt.
- Growth time ∝ f^−0.73 for f ≥ 3 (every dt) and ∝ M_disk^−0.76 (dt 0.01 only).

## Branches
- `main`, tracking `origin` = https://github.com/algorithm0r/Disk-Accretion (public; GitHub Pages serves `main`)

## Open
- Accepted gap: the hot, scattering-heavy disks (f ≤ 3, fading ramps, heavy disks) are not
  dt-converged at dt/4. They eject fewer bodies, later, at smaller dt. Their removal counts are
  unquotable until Stage 6.
- The disk-mass sweep (batch_006) has not been rerun at smaller dt.
- Chris's call: make fading inflation (f₀ = 30, q = 1) the demo default? It still holds at dt/4,
  with fewer ejections.

## Next action
Stage 6: an adaptive or hybrid step for pericentre passes and close encounters, keeping smoke
green; then rerun batch_008/009's hot configs.

## Blockers
- none
