# Disk Accretion — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-11-13 (Stage 9 close) — refreshed every session close; may carry unverified claims
**Verified:** 2026-10-15 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
Stages 1, 2 (target half met), 3, 5, 6, 8 and 9 `[ DONE ]` (9 closed 2026-11-13). No stage active.
`[ PLANNED ]`: Stage 4 (past 5× scale) and Stage 7 (parked: the disk-mass sweep and light disks
under the hybrid; a faster hybrid; the demo-default call). DEVPLAN now has a Backlog.

## State
- Public repo https://github.com/algorithm0r/Disk-Accretion; Pages serves `main` at
  https://algorithm0r.github.io/Disk-Accretion/. Pushes to `main` go live.
- **The page is on Claude Basic 0.6.0** (`vendor/`, pinned). The world is on the left, the scenario
  card (picker, explainer, "Measured against theory") and line charts on the right; the dial, key
  and Physics/Engine control strips sit under the world. World colours come from theme tokens.
  `index.html#<preset>` opens a scenario. All 8 scenarios ran with no console errors, checked in
  the browser pane @ 1abeac9-dirty. Pushed; the live Pages site serves it (kit loaded, grouped
  picker, 5 charts, no console errors) @ ddb1eae, 2026-11-13.
- Two integrators: leapfrog (browser default) and hybrid (`src/hybrid.js`; the one for science runs).
- smoke PASS (28 checks) and validate PASS (7.9 min, table unchanged but for its date) @
  1abeac9-dirty, 2026-11-13.
- Teaching presets (`src/presets.js`): Kepler, Trojans, Routh, chaotic zone, resonance gaps, Hill
  stability, Toomre and the default disk, each with a live measured-vs-expected check.
- Results in `analysis/FINDINGS.md` (§6 = converged hybrid numbers): 312 runs, MongoDB
  `diskAccretionDB` batch_001–017 plus local `analysis/runs/` (git-ignored).

## Metrics
- Cost at 30 fps (i7-12700K, Node; core unchanged since 2026-10-16): leapfrog 6.6 ms/step at 10k,
  max N ~12.0k at 4 steps/frame, ~41.6k at 1. Hybrid 15.7 ms/step, ~5.7k / ~17.6k. GPU backend
  (leapfrog) ~27k / ~88k. The new page's in-browser fps has not been timed (the pane was hidden).
- Converged under the hybrid (8 seeds): ejections per run f = 1: 70 ± 3, f = 3: 53 ± 3, f = 10:
  15 ± 1, fading-30: 23 ± 1, fading-100: 13 ± 1. First ejection in the hot disks ~220–280 orbits.
- Default disk (8 seeds, 3000 orbits): final e 0.14 ± 0.02, spacing 7.0 ± 0.4 mutual Hill radii,
  ejections 4–6 per run, t½ 2.6 orbits. Runaway peak M₁/⟨m⟩ ~47 at ~18 orbits (the page showed
  40× at year 19 on 2026-11-13).
- Validation: Trojans ±60.05°; Routh edge 0.03846–0.03865 (μ_c 0.03852); chaotic zone ∝ μ^0.269;
  Hill edge 3.3–3.4 (2√3 = 3.46); Kepler exact (hybrid); gaps at 3:1 / 2:1.

## Branches
- `main`, tracking `origin` = https://github.com/algorithm0r/Disk-Accretion (public; GitHub Pages serves `main`)

## Open
- Demo default (Stage 7, Chris's call). Stage 9 recommends opening on the default disk with
  constant inflation, and switching to Trojans for "matches theory". Fading inflation's extra
  ejections start at ~220 orbits, past a demo's first minutes; the q slider shows it on demand.
- `src/db.js:69` browser socket save is broken (`root.io`); `autoSave` is off (Backlog).
- Kit gaps (`CB.sim.controls`, `.cb-progress[hidden]`) are worked around in `ui.js` / `index.html`
  until the kit fixes them.
- Accepted gaps: the disk-mass sweep and the Toomre runs are still leapfrog at dt = 0.01 (Stage 7);
  the pinned star has no L4/L5 (the live star fixes it, leapfrog only).

## Next action
Chris shows the page to the grad students; watch real fps there. Then Stage 7 or the Backlog.

## Blockers
- none
