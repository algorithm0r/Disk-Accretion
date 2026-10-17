# Disk Accretion — DEVLOG
Newest entry on top. **Append only — never edit past entries.**

## 2026-10-16 — Stage 8: analytic benchmarks as teaching presets (VALIDATION.md)

**Done:** Stage 8, closed. Chris approved it ("yes, let's do that"), relayed from the PA session.
- **Finding first:** a pinned star has no L4/L5 at all, which is more than the brief's expected
  "O(μ)" shift. The star's reflex pull toward the planet (the indirect term) is what balances the
  planet's tangential pull at the triangular points. Scratch test: particles at 60° circulate the
  whole orbit with a pinned star but librate about 60.0° with a live one. So the Trojan, Routh,
  chaotic-zone and Kirkwood presets run with a live star, and the pinned failure is a stated
  teaching point (VALIDATION §2, About panel, FINDINGS caveat).
- **Core:**
  - Massless test particles (m = 0, r = 0).
  - An exact massive-only gravity sum and swept collision check when ≤ 64 bodies have mass
    (`gravityMode 'direct'`; 4–8× faster for presets).
  - `liveStar`: the star is body 0, barycentric, leapfrog-only.
  - Bodies carry `tag` through compaction so trackers can follow them.
- **`src/presets.js`:** 8 presets (disk, toomre, kepler, trojans, routh, gap, kirkwood, hill), each
  setup + Tracker, shared by the panel, `smoketest.mjs` (6 new checks) and `validate.mjs`.
- **Panel:**
  - preset picker with explainers;
  - a live measured-vs-expected readout, which shows "measuring… x / N orbits" until a minimum run
    length (Hill may conclude early on an encounter);
  - preset-scoped controls (planet mass, eccentricity, Δ, live star);
  - per-preset steps/frame (Trojans pass in ~28 s of viewing);
  - an About panel on what the model simplifies, linking to VALIDATION.md and FINDINGS.md.
- **Defaults unchanged:** default disk, leapfrog, inflation 30.
- **`validate.mjs`** → VALIDATION.md (setup, reference, tolerance, measured; amendments
  append-only). 7.9 min, sections in parallel. **All PASS:**
  1. **Kepler (hybrid, 100 orbits):** |ΔE/E| 2e-11, period error 1.4e-11, no apse drift. Leapfrog
     contrast at dt 0.01: |ΔE/E| 4e-8 at e = 0, 0.38 at e = 0.85.
  2. **Trojans (μ = 1e-3, live star):** small tadpoles centred at **+60.05° / −60.05°** (±0.5°).
     Pinned star: 0 tadpoles; all particles librate about 180°.
  3. **Routh:** linear probes 1e-5 rad off L4 put the edge between μ = m/(M★+m) = **0.03846 (stable)
     and 0.03865 (unstable)**, around μ_c = 0.03852.
     - Pinned star: unstable even at μ = 0.001.
     - A first pass "failed" because it used m/M★ rather than the mass fraction.
     - The visible 1° swarm saturates just above μ_c (nonlinear), so the verdict uses the probes.
  4. **Chaotic zone, 300 orbits:** inner half-width **0.100 / 0.140 / 0.200 / 0.242 / 0.358** against
     1.3 μ^{2/7} = 0.094 / 0.128 / 0.181 / 0.247 / 0.349 (μ = 1e-4 … 1e-2). The fitted exponent is
     **0.269** (2/7 = 0.286). The outer zone is wider (reported).
  5. **Resonance gaps, 1000 orbits, planet e = 0.05:**
     - At μ = 3e-3: 3:1 at 0.482 (predicted 0.481, 3.2σ, marginal) and 2:1 at 0.632 (0.630, 7.6σ).
     - At μ = 1e-2: 5:2 at 0.542 as well.
     - At μ = 1e-3: only the 2:1 shows.
     - 7:3 never shows.
     - It is a location test: these dips are resonant excitation within ~100 orbits, not the
       ~10⁵-orbit chaotic clearing of the real belt (stated plainly).
  6. **Hill stability (hybrid, 10⁴ orbits per Δ):** encounters at Δ ≤ 3.3 (first at orbit 31 →
     4968 as Δ → 3.3), none at Δ ≥ 3.4 (Gladman 2√3 = 3.464).
  7. **Toomre:** peak clumping 3.55× at Q ≈ 0.3 against 1.31× at Q ≈ 9.
  8. **Runaway/spacing:** points to FINDINGS §1, §6.

**Changed:**
- New: `src/presets.js`, `validate.mjs`, `VALIDATION.md`, `analysis/validation_table.md` +
  `validation.json`.
- Core: `src/world.js` (preset hook, starIndex, massive-only path, liveStar branches, tag, guarded
  massError/LzDrift); `src/gravity.js` (`massiveAccel`); `src/collide.js` (`collideMassive`).
- UI: `src/params.js` (preset, liveStar, planetMass, planetEcc, hillDelta; preset-scoped schema;
  DEFAULT_PARAMETERS; steps/frame up to 400); `src/ui.js` (picker, applyPreset,
  refreshPresetResult, About); `src/main.js` (preset tracker entity); `src/observer.js` (live star
  at its body; test particles as bright 2×2 dots); `index.html` (picker, explainer, result box,
  About modal, presets.js).
- Tests: `smoketest.mjs` §8.
- Docs: FINDINGS caveat (pinned star, no co-orbitals); DEVPLAN Stage 8 (closed); CLAUDE.md and
  README.

**State:**
- smoke PASS 29/29 @ b81555e; validate PASS (7.9 min).
- Pushed; the live Pages site @ a121efb was verified in the browser pane: 8 presets, Trojans and
  Kepler pass, About links to VALIDATION.md, no console errors. All served files byte-identical
  to HEAD.

**Next:** Stage 7 (parked: disk-mass sweep under the hybrid), or Chris's demo-default calls
(fading inflation; which preset opens first).

## 2026-10-16 — Stage 6: hybrid symplectic integrator; the hot disks converge

**Done:** Stage 6, closed. Chris approved it ("ok, let's do stage 6"), relayed from the PA session.
- **`src/hybrid.js`**, MERCURIUS-style (Chambers 1999; Rein et al. 2019) with the star fixed:
  - Every body drifts along its exact Kepler orbit (universal variables, Stumpff series,
    Halley; 2.7 iterations on average).
  - Pair potentials are split by Chambers's C² changeover at 3 R_H. The kick takes the far part,
    as the gradient of the split potential (K·F + Φ·K′·r̂, not K·F).
  - Encounter groups (union-find over a Hermite prediction between the Kepler ends) are
    re-integrated by adaptive DP5(4) at 1e-11, with star grazing and contact swept over each
    substep.
  - r_c is held fixed within a step.
- **`World`:** `integrator` param ('leapfrog' | 'hybrid') with a panel control and a readout;
  `removeBody()`; `rc` carried through compaction; hybrid + async GPU/worker providers work.
  `runner.mjs` packets record the hybrid counters; `bench.mjs --integrator`.
- **Bugs found on the way:**
  - The encounter groups merged bodies with `collisions: false`. That gave |ΔE/E| 2e-4, the same as
    leapfrog, until fixed; the fixed version reaches 3e-9.
  - Contacts checked only at substep ends let 10% of f = 1 contacts slip through to the
    end-of-step grid, which delayed merges (t½ 71 against 67). The fix is a swept Hermite check
    per substep, and batch_015–017 rerun f = 1 and 3 with it.
  - The candidate-pair search used a needlessly wide reach (2·r_c): 5.3 → 3.6 ms at 10k.
- **Smoketest checks 7a–d**, all PASS:
  - e = 0.9 pericentres: |ΔE/E| 7.6e-14 against leapfrog's 0.23.
  - 2 R_H flyby: position error 4.9e-7 against 2.1e-4; energy 2.5e-8 against 1.5e-7.
  - Grazing contact found in the drift.
  - Brute disk: L_z 3e-14.
  - Self-gravity, collisions off: |ΔE/E| 2.9e-9 against 1.8e-4.
- **Convergence:** batch_012–014 (`sweep.mjs hybconv`, 84 runs, 61 min) and batch_015–017
  (`hybmore`, 84 runs, ~85 min), at 16 processes, all inserted in MongoDB.
  - f = 3 and both fading ramps converge in every quantity from dt to dt/4. f = 1 converges from
    dt/2 (ejections 59 → 69 → 70).
  - Default disk final e 0.14 / 0.16 / 0.14 → **0.14 ± 0.02, resolved**.
  - Converged ejections per run: f = 1 70, f = 3 53, f = 10 15, fading-30 23, fading-100 13.
- **Headlines that change** (FINDINGS §6):
  - Leapfrog dt = 0.01 over-ejected in the hot disks by ~45–75% and fed the star 2–3× too often.
    Stage 5's leapfrog dt/4 values were close to the converged ones.
  - The first ejection comes at ~220–280 orbits, not ~100.
  - f = 1 ejects more than f = 3, which confirms Stage 5's reversal of Correction 2.
  - Fading inflation: 23 ejections per run, not 36–42.
  - Default-disk spacing is 7.0 ± 0.4 R_H per run, against 7.6 (z = −1.6).
  - Unchanged: runaway and q = 2.37 at 10 orbits.
- **Cost:** hybrid 15.7 ms/step at 10k against leapfrog 6.6. Max N at 30 fps: 5.7k against 12.0k
  at 4 steps/frame, and 17.6k against 41.6k at 1. In-page at 4 steps/frame: leapfrog 10k 34.9 fps,
  hybrid 10k 14.8 fps, hybrid 5k 33.7 fps. Leapfrog therefore stays the browser default.

**Changed:**
- New: `src/hybrid.js`; `sweep.mjs` plans hybconv/hybmore (batch_012–017); `stage3.py` `hybconv()`
  + fig11 + 2 tables; FINDINGS §6 (header, batch table and caveats updated).
- Code: `src/world.js` (step dispatch, removeBody, rc); `src/params.js` (`integrator`,
  `hybridHillFac`, `hybridTol`; panel control); `src/ui.js` (Integrator readout); `index.html` +
  every headless loader (hybrid.js); `runner.mjs` (hybrid counters); `bench.mjs` (`--integrator`);
  `smoketest.mjs` (§7).
- Docs: DEVPLAN (integrator design note, Stage 6 closed, new Stage 7); CLAUDE.md and README (two
  integrators, batch range).

**State:** smoke PASS 23/23 @ d76667d. `python analysis/stage3.py` runs clean (fig1–11). The page
was checked in the browser pane @ d76667d: hybrid and leapfrog both step, switching works live, no
console errors. Not done: the disk-mass and Toomre sweeps are still leapfrog (Stage 7).

**Next:** Stage 7, the disk-mass sweep under the hybrid. Chris's call: fading inflation as the demo
default.

## 2026-10-15 — Stage 5: dt-convergence of the Stage 3 numbers, and the oligarch crowding

**Done:** Stage 5 (closed). It ran in a side session started from the PA session.
- **dt sweep.** `sweep.mjs` gained `infl4 infl005 infl0025 base005 base0025` (and `dtconv` = all
  five). Run names carry `_dt<dt>`; `cost` orders the queue; the wall cap scales with 1/dt.
  86 runs, batch_007–011, 32 min at 16 processes, no wall caps, all 86 inserted in MongoDB.
  This covers the inflation sweep at 4 seeds (seeds 3–4 added at dt 0.01) and the default disk at
  8 seeds, each at dt 0.01, 0.005 and 0.0025.
- **`analysis/stage3.py`.** `dtconv()`: mean ± SE table with z-scores, plus fig9. t½ is now
  interpolated in log n vs log t (`half_time`), where before it was quantised to the sample grid.
  `feeding()`: leader spacing (k ≥ 30% k_max), e·a/R_H and the leaders' mass share, plus fig10.
- **Survives at dt/4** (FINDINGS §4):
  - the default disk: final spacing 7.6 / 7.0 / 7.6 R_H, ejections 5.4 / 3.6 / 5.9 per run, first
    ejection ~360–400 orbits, t½ 2.6
  - every quantity at f = 10, 30, 100
  - every growth time except f = 1, and the f ≥ 3 exponent (−0.73 to −0.74)
- **Fails at dt/4: the hot configs** (f ≤ 3, fading ramps). At smaller dt, ejections fall
  26–44%, accretion falls 35–67%, and the first ejection comes ~2× later (still moving between
  dt/2 and dt/4).
  - f = 1 grows faster at smaller dt (t½ 104 → 67) and ejects more than f = 3, so "f = 1 ejects
    fewer than f = 3" (half of Stage 3's Correction 2) was a dt artifact.
  - The default disk's final e (0.14 / 0.11 / 0.21) is unresolved.
  - Likely cause: pericentre passes. A star-only orbit at e = 0.9 has peak |ΔE/E| 0.23 at
    dt 0.01 and 1.5e-2 at dt/4 (scratch test, numbers in FINDINGS §4).
- **Crowding** (FINDINGS §5): the Stage 3 "≪ 1 R_H" was the selection cut counting the field.
  - The leaders sit at 1.5–4 R_H through 7–40 orbits.
  - No inflation scheme gives feeding-zone spacing: the leaders reach 5 R_H only when they hold
    most of the mass.
  - Fading inflation crowds the leaders more.
  - The contact separation is 0.2 R_H,mutual at f = 30, so inflated radii don't short-circuit
    Hill-scale dynamics.

**Changed:**
- `sweep.mjs` (Stage 5 plans, `_dt` names, cost ordering); `analysis/stage3.py` (dtconv,
  feeding, half_time; inflation table now 4 seeds; UTF-8 stdout)
- `analysis/FINDINGS.md`: §1–3 amended in place, new §4–5, caveats; `tables.md`, fig6/7
  regenerated; new fig9, fig10
- DEVPLAN: Stage 5 DONE; new Stage 6 "Converge the hot disks" `[ PLANNED ]`; integrator note
  amended
- CLAUDE.md: batch_001–011 taken, the `_dt` naming, the ensemble-not-seed rule, the hot configs
  unconverged. README: batch range and the `dtconv` plan.

**State:**
- Smoke PASS 17/17 @ db96a0d-dirty (sim core untouched): mass err 6.07e-15, L_z 1.70e-15, star-only
  |dE/E| 8.15e-8, self-gravity |dE/E| 1.76e-4 → 6.35e-7 (dt 0.01 → 0.0025).
- `python analysis/stage3.py` regenerates every table and figure on a plain console.
- Not done: the disk-mass sweep (batch_006) was not rerun at dt/4, and the heavy disks are hot.

**Next:** Stage 6, an adaptive or hybrid step for pericentres and close encounters, then rerun
the hot configs. Or Stage 4 (GPU collisions) for scale. Chris's call: fading inflation as the demo
default (it still holds at dt/4, with fewer ejections).

## 2026-10-15 — published

**Done:** Published from the PA session on Chris's direct go-ahead: public repo
https://github.com/algorithm0r/Disk-Accretion, GitHub Pages from `main` at
https://algorithm0r.github.io/Disk-Accretion/ (live page verified running there), About set.
README links came in 099f55f. This supersedes the "not published" State line of the Pages-prep
entry below.
**Changed:** STATUS (Branches now names the remote; the "publish pending" Open item is gone).
**State:** `main` level with `origin/main` at 099f55f before this commit; smoke unchanged.
**Next:** Stage 5 (dt-convergence) as before. Pushes to `main` now go live on Pages.

## 2026-10-15 — Pages prep (publish pending)

**Done:** Prepared for publishing as public `algorithm0r/Disk-Accretion` with GitHub Pages from
`main` (Chris approved this in the PA session; relayed here). Audit: 40 tracked files, no secrets.
The largest files are the 9 Stage 3 figures (1.7 MB). Run packets (`analysis/runs/`, 31 MB) and
sweep logs are git-ignored. The only infrastructure reference is the research Server URL in
`params.js`, and `autoSave: false` means the page never writes to the DB. Pages needs no COOP/COEP:
the workers backend copies bodies by message rather than using SharedArrayBuffer, and the gpu
and workers backends fall back to cpu when unavailable. The panel now follows the fallback
(`syncControl`), verified in the browser pane by forcing the GPU path to fail.
**Changed:** `src/ui.js` (CONTROL_SYNC/syncControl), `src/main.js` (fallback re-syncs the backend
select).
**State:** smoke unchanged (sim core untouched). **Not published:** this session's auto-mode
classifier refused the `gh` calls ("Create Public Surface") because the approval reached it
secondhand, so the repo, Pages and About settings are not created yet.
**Next:** Chris runs the publish commands, or approves them in this session; then check the live
Pages URL and add the URLs to README / STATUS / the PA hub.

## 2026-10-15 — Stages 2 + 3: worker/GPU backends, regime batches, the inflation test

**Done:** Stage 2 (closed, target half met) and Stage 3 (closed), at Chris's "try to get through
stage 3".
*Stage 2.* Split `World.step` into begin / body-body force / end so an async provider can supply
the force (`updateAsync`, async engine loop, "Force backend" control). Two providers in
`src/pool.js` (browser only):
- `GravityPool`: blob-URL Workers built from the same `BarnesHut` source, each summing a slice of
  the groups. Bit-identical to the serial walk (smoke check 6).
- `GpuGravity`: WebGPU all-pairs in f32. Median force error vs f64 brute force 4e-6; L_z drift 1.4e-9
  over 4 orbits at 10k.
- No SharedArrayBuffer: the page isn't cross-origin isolated (needs COOP/COEP headers), so the pool
  copies bodies to each worker and every worker rebuilds the tree.

Benchmarks:
| path | 4 steps/frame | 1 step/frame | notes |
|---|---|---|---|
| CPU tree (Stage 1) | ~11.5k | ~40k | |
| worker pool, 4 workers | ~1.9× per step | | Node `bench-pool.mjs`, same worker code: 10k 8.6 → 4.6 ms, 40k 30.6 → 17.8, 100k 89 → 52; 8–16 workers slower |
| **GPU (RTX 3070 Ti)** | **~27k** (20k: 42.4 fps, 30k: 26.4) | **~88k** (80k: 34.8, 100k: 26.4) | in-page, full steps incl. collisions |
GPU force time alone: 3.9 ms at 10k, 7.2 at 40k, 18.9 at 100k (~5e11 interactions/s). So 2.2–2.4×
the CPU, not the 5× target. Serial CPU collisions (half the step at ≥ 80k) and the ~3–4 ms GPU
round trip per step now limit it → Stage 4. In-page CPU timings were throttled ~3× while the pane
was hidden (tree at 20k: 40 ms in-page vs 13.7 in Node), hence the pool numbers come from Node.
*Stage 3.* `runner.mjs` rewritten:
- orbit-based sampling (full mass spectrum, bound big-body (k, a, e), unbound and ejected counts,
  position snapshots)
- packets to MongoDB over socket via the standard client (`npm install` socket.io-client; Server
  round-trip verified) plus local JSON in `analysis/runs/`

Also added `sweep.mjs` (parallel batches, run-name grammar in its header), `inflationRamp`
(inflation fading with mass, 1 + (f−1)(m₀/m)^q) and `analysis/stage3.py` (9 figures + `tables.md`).
58 runs in batch_001–006, ~15 min wall at 14–16 processes. The write-up is `analysis/FINDINGS.md`.

Results:
- **Runaway:** M₁/⟨m⟩ peaks at 31–61 around 13–40 orbits (8 seeds). The tail index q passes
  2.35 ± 0.08 at 10 orbits.
- **Oligarchic:** M₁/M₁₀ ≈ 1.5–6 for 3–40 orbits, while the leaders pull 10²–10³× away from the median.
- **Spacing:** median Δa/R_H,mutual climbs 0.7 → 3.4 → 6.5 → 7.4 → **7.6** at 10/100/300/1000/3000
  orbits (IQR 6.8–8.1, e ≈ 0.11). Every disk mass plateaus at 5–8.3. *Finding:* the 5–10 band is
  reached through a giant-impact phase; during the oligarchic phase big bodies crowd at ≪ 1 R_H.
- **Disk mass:** t(N halves) ∝ M^−0.75 (40 → 0.25 orbits, M 1e-4 → 0.1). With collisions off,
  Q < 1 disks form sheared wakes: clumping 2.6–3.1× Poisson against 1.2 at Q = 9, transient over
  2–3 orbits.
- **Inflation account (holds in direction, two corrections):** ejections per run go 0 (f = 100) →
  1–5 (30) → 15–20 (10) → 61–90 (3). Bodies reach the star at f ≤ 3. Big-body e rises 0.06 → 0.5,
  and growth time goes as t ∝ f^−0.88.
  - Correction 1: f = 30 does eject, just late; all 8 seeds make their first ejection at 160–790
    orbits, so the 150-orbit zero was timing.
  - Correction 2: Θ of the largest body alone doesn't order the counts. f = 1 ejects fewer than
    f = 3 (growth too slow), and fading inflation from 100 has Θ 1.8 but 20–22 ejections.
  - Fading inflation from 30 keeps fast growth (t_half 4.5 orbits) with 36–42 ejections.

**Changed:** new `src/pool.js`, `bench-pool.mjs`, `sweep.mjs`, `analysis/` (stage3.py, FINDINGS.md,
tables.md, figures/), `package.json`. `world.js` gained the step split, `addStarAccel` and the
inflation ramp; `gravity.js` gained range-limited `accelGrouped`; the engine loop is async; `params`
gained `backend`, `workers` and `inflationRamp`. Smoketest gained check 6 (the pool split).
DEVPLAN closes Stages 2 and 3 and adds Stage 4 (past 5×) and Stage 5 (robustness: dt-convergence,
seeds). CLAUDE.md and README updated (pool.js browser-only, runner/sweep/analysis, the
hidden-pane throttle). Dropped my two scratch collections on mint (roundtrip, scratch_runs; 1
doc each).
**State:** smoke PASS 17/17 @ b457288. Batches are in MongoDB `diskAccretionDB` (batch_001–006)
and in `analysis/runs/` (git-ignored, 31 MB). In-page (@ b457288), the gpu and workers backends
step correctly from the UI. Not done: dt-convergence of the late-phase numbers (Stage 5); visible-pane
fps for the CPU/worker backends (the pane stayed hidden).
**Next:** Stage 5, if the numbers are going anywhere: rerun the inflation and base batches at dt/2
and dt/4. Or Stage 4 (GPU collisions) for scale. Chris's call: whether fading inflation becomes the
demo default.

## 2026-10-15 — Stage 1: the disk sim, Barnes-Hut + merging, benchmark

**Done:** Replaced the drifters demo with the disk (DEVPLAN Stage 1, now DONE). SoA world, leapfrog
KDK with fixed dt, fixed unit star, accretion (r < 0.1) and ejection (r > 10) banked with their
mass and L_z. Gravity: exact O(N²) reference plus a Barnes-Hut quadtree (leaf cap 8). The plain
per-body walk ran 14 ms/step at 10k. A grouped walk (groups ≤ 32, bodies in tree order) plus
quadrupole moments brought it to ~6 ms at θ = 1.0, *and* more accurate: median force error 0.3%
vs 1.0% for plain monopole at θ = 0.6. The force sum is sqrt/div-throughput bound
(~2.6 ns/interaction); unrolling over 4 bodies gained nothing. Collisions: spatial hash, swept
closest-approach test, 5-cell forward scan, perfect merge with the pair's internal L_z kept in
`spin`. Renderer: ImageData pixels plus mass-coloured circles and Hill rings. Readouts: N, largest
mass, bodies ≥ 100 m₀, L_z drift, mass error, accreted/ejected, ms/step (grav/coll), ms/draw, fps.
Controls: N, disk mass, dispersion, inflation (live), steps/frame, θ, dt, gravity, self-gravity,
collisions. Wheel zoom, drag pan, space to pause.
**Benchmark** (i7-12700K, Chrome 152, frames driven synchronously in-page, 10k-body draw ≈ 0.9 ms;
`node bench.mjs` agrees within ~5%). Max N at 30 fps:
| path | 4 steps/frame | 1 step/frame |
|---|---|---|
| brute force | ~2,200 (2.0k: 39.5 fps, 2.5k: 26.4) | ~4,700 (4k: 42.8, 5k: 27.8) |
| Barnes-Hut | ~11,500 (10k: 33.9, 12k: 28.7) | ~40,000 (40k: 30.6, 50k: 24.4) |
100k bodies: 93 ms/step (10.7 fps at 1 step/frame).
**Dynamics** (default: N = 10k, disk 0.003 M_star ≈ 1000 M⊕, m₀ = 0.1 M⊕, inflation 30, in-browser
run). 1.5 orbits (at r = 1): 6,542 bodies, max 15 m₀. 10 orbits: 1,594, max 106 m₀, inner disk
clears first. 40 orbits: 226 bodies, 19 ≥ 100 m₀ holding 74% of the mass, largest 1,578 m₀, while
the small-body tail stays ~2 m₀ (bimodal, oligarchic). 150 orbits: 40 bodies, 9 oligarchs hold 96%,
largest 2,608 m₀ (261 M⊕). Big-body e 0.03–0.18, spacing 0.3–6.7 mutual Hill radii, so not yet
isolated: the heavy default disk is in a giant-impact phase. Nothing was accreted or ejected.
L_z drift −5.3e-6 and mass error 1.3e-13 at 150 orbits.
**Changed:** new `src/gravity.js`, `src/collide.js`, `bench.mjs`; rewrote `world.js`,
`observer.js`, `params.js`, `ui.js`, `main.js`, `datamanager.js`, `index.html`, `smoketest.mjs`; the
engine gained fps/frameMs, a pause flag and `stepsPerFrame`; `runner.mjs` was ported to the new
API (dry-checked headless, not run against Mongo: no `node_modules`). Removed `src/agent.js`.
DEVPLAN design notes amended (spin bookkeeping, grouped+quadrupole BH, θ = 1.0, the collision grid,
the heavy-disk note, the measured dt limit on close encounters). CLAUDE.md gained the
no-stable-index and conservation-is-the-test rules plus how to view and bench. README updated.
**State:** smoke PASS (16/16) @ 9c12d6a. Merge conserves mass/momentum/L_z (dL 1.7e-16). Brute
N = 600 over 2 orbits: mass err 4e-15, L_z 2e-15, 600 → 416. BH N = 3000 over 4 orbits: mass err
1e-14, L_z 3.4e-7, 3000 → 1405. Star-only |dE/E| = 8e-8. Self-gravity with collisions off:
|dE/E| = 1.8e-4 at dt = 0.01, converging to 6.4e-7 at dt = 0.0025 (close encounters
under-resolved; accepted for the prototype). BH vs brute at N = 2000: θ = 0 rms 1.6e-15;
grouped+quad at θ = 1 median 3.0e-3; plain at θ = 0.6 median 1.0e-2. Collision scan exhaustive:
0 missed overlaps in 600 brute-checked steps. Viewed in the browser pane via the Static Server
(the pane was mostly hidden, which suspends rAF, hence the synchronous frame timing; while rAF
did run early on, the live loop read 25–30 fps at ~10k).
**Next:** Stage 2 if wanted: a worker pool over the grouped walk (20 threads here, groups are
independent), then GPU. Or Stage 3: a disk-mass sweep toward a lighter, MMSN-like disk, which
should reach isolation rather than giant impacts.

<!-- append new entries above this line -->

## 2026-10-15 — scaffolded
**Done:** project scaffolded from engine v2 — vanilla-JS canvas microframework with
model/view split, the vendored standard DB client, a headless `runner.mjs`, and `smoketest.mjs`.
**Changed:** initial file tree.
**State:** runs (demo drifters model, in-browser + headless); `smoketest.mjs` passes.
**Next:** replace the demo model with the real Disk Accretion dynamics (DEVPLAN Stage 1).
