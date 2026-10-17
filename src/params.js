'use strict';
// Single source of truth for every tunable. Serialized verbatim into every saved data
// packet (see datamanager.js) so any run reconstructs from its stored parameters.
// Declared `var` so it's a global in the browser AND in the headless main realm.
//
// Units: G = 1, M_star = 1, length unit ≈ 1 AU, so one orbit at r = 1 takes 2π time units
// and an orbit at radius r takes 2π r^1.5.
var PARAMETERS = {
  // --- disk (changing any of these rebuilds the disk) ---
  N: 10000,             // initial number of bodies (all equal mass, diskMass / N)
  diskMass: 0.003,      // total disk mass in M_star units (planetesimal regime ≪ 1)
  rIn: 0.5,             // inner edge of the disk
  rOut: 2.0,            // outer edge
  sigmaSlope: 1.0,      // surface density Σ ∝ r^-p (p = 1 → uniform in r)
  dispersion: 0.01,     // random velocity, as a fraction of the local circular speed
  seed: 1,              // RNG seed for the initial disk (same seed → same disk)

  // --- bodies ---
  radiusInflation: 30,  // body radius = inflation × (Earth density at r = 1); sets growth speed
  inflationRamp: 0,     // q > 0: inflation fades with mass, 1 + (f−1)(m₀/m)^q (0 = constant)

  // --- gravity ---
  gravity: 'bh',        // 'bh' (Barnes-Hut quadtree) | 'brute' (exact O(N²), the reference)
  theta: 1.0,           // Barnes-Hut opening angle (0 = exact, larger = faster + rougher; with the
                        // quadrupole, 1.0 is ~2x more accurate than monopole at 0.6)
  bhGroup: 32,          // grouped tree walk: bodies per group (0 = plain monopole walk per body)
  softening: 1e-3,      // Plummer softening length ε for body-body forces
  selfGravity: true,    // false → bodies feel only the star (test particles)

  // --- integrator + removal ---
  integrator: 'leapfrog', // 'leapfrog' (fixed-step KDK) | 'hybrid' (Kepler drift + resolved encounters)
  hybridHillFac: 3,     // hybrid: changeover radius in Hill radii (MERCURIUS default 3)
  hybridTol: 1e-11,     // hybrid: relative tolerance of the encounter integrator (DP5(4))
  dt: 0.01,             // fixed leapfrog step (inner-edge orbit ≈ 222 steps)
  collisions: true,     // perfect merging on contact
  rStar: 0.1,           // bodies inside this radius are accreted by the star
  rEject: 10,           // bodies beyond this radius are counted as ejected

  // --- browser force backend (headless always runs 'cpu') ---
  backend: 'cpu',       // 'cpu' (main thread) | 'workers' (pool over the grouped walk) | 'gpu' (WebGPU all-pairs)
  workers: 4,           // pool size for the 'workers' backend (4 is the measured optimum; see DEVLOG)

  // --- presets (presets.js; the defaults below are the plain disk) ---
  preset: 'disk',       // which setup reset() builds
  liveStar: false,      // true: the star is a moving body (barycentric), so its reflex motion is in
  planetMass: 1e-3,     // planet presets: planet mass in star masses (μ)
  planetEcc: 0,         // planet presets: planet eccentricity
  hillDelta: 3.0,       // hill preset: planet separation in mutual Hill radii

  // --- engine ---
  stepsPerFrame: 4,     // sim steps per rendered frame
  bruteMaxN: 20000,     // brute force refuses to start above this N (it would hang the tab)

  // --- data collection ---
  reportingPeriod: 25,  // sample stats every N steps
  epoch: 20000,         // a headless run ends (and ships a packet) at N steps
  autoSave: false,      // browser: ship a packet to the DB at epoch (off for the watchable demo)

  // --- database (the standard vendored client, src/db.js) ---
  db: {
    transport: 'socket',
    server: 'https://research.climbinggiants.com:8888',
    mongoUrl: 'mongodb://127.0.0.1:27017',
    db: 'diskAccretionDB',
    run: 'run',
  },
};

// Schema drives the auto-generated control panel (ui.js). One entry per live-tunable.
//   log: slider moves in log10 space    resets: changing it rebuilds the disk
//   options: renders a <select>         type 'bool': renders a checkbox
//   presets: shown only for those presets (presets.js)
var PARAM_SCHEMA = [
  { key: 'planetMass', label: 'Planet mass μ (star = 1)', min: 1e-5, max: 0.06, log: true, resets: true, presets: ['trojans', 'routh', 'gap', 'kirkwood'] },
  { key: 'planetEcc', label: 'Planet eccentricity', min: 0, max: 0.3, step: 0.01, resets: true, presets: ['kirkwood'] },
  { key: 'hillDelta', label: 'Separation Δ (mutual Hill radii)', min: 1.5, max: 6, step: 0.05, resets: true, presets: ['hill'] },
  { key: 'liveStar', label: 'Live star (moves; barycentric)', type: 'bool', resets: true, presets: ['trojans', 'routh', 'gap', 'kirkwood'] },
  { key: 'N', label: 'Bodies N', min: 100, max: 200000, log: true, round: true, resets: true, presets: ['disk', 'toomre'] },
  { key: 'diskMass', label: 'Disk mass', min: 1e-4, max: 0.1, log: true, resets: true, presets: ['disk', 'toomre'] },
  { key: 'dispersion', label: 'Velocity dispersion', min: 0, max: 0.1, step: 0.001, resets: true, presets: ['disk', 'toomre'] },
  { key: 'radiusInflation', label: 'Radius inflation', min: 1, max: 300, log: true, live: 'radii', presets: ['disk', 'toomre'] },
  { key: 'stepsPerFrame', label: 'Steps / frame', min: 1, max: 400, log: true, round: true },
  { key: 'theta', label: 'θ (Barnes-Hut)', min: 0, max: 1.5, step: 0.05 },
  { key: 'dt', label: 'dt', min: 0.001, max: 0.03, step: 0.001 },
  { key: 'integrator', label: 'Integrator', options: ['leapfrog', 'hybrid'] },
  { key: 'gravity', label: 'Gravity (cpu)', options: ['bh', 'brute'] },
  { key: 'backend', label: 'Force backend', options: ['cpu', 'workers', 'gpu'], live: 'backend' },
  { key: 'selfGravity', label: 'Self-gravity', type: 'bool' },
  { key: 'collisions', label: 'Collisions', type: 'bool' },
];

// the untouched defaults: a preset's params are applied over these, never over another preset's
var DEFAULT_PARAMETERS = JSON.parse(JSON.stringify(PARAMETERS));
