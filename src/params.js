'use strict';
// Single source of truth for every tunable. Serialized verbatim into every saved data
// packet (see datamanager.js) so any run reconstructs from its stored parameters.
// Declared `var` so it's a global in the browser AND in the headless vm context.
var PARAMETERS = {
  // --- model ---
  nAgents: 300,         // number of drifting agents
  drift: 0.4,           // mean step in +x per tick
  jitter: 1.2,          // std-dev of random step (x and y)

  // --- engine ---
  updatesPerDraw: 1,    // fast-forward: sim updates per rendered frame

  // --- data collection ---
  reportingPeriod: 30,  // sample the metric every N ticks
  epoch: 600,           // a run ends (and ships a packet) at N ticks

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
var PARAM_SCHEMA = [
  { key: 'nAgents', label: 'Agents', min: 10, max: 2000, step: 10, resets: true },
  { key: 'drift', label: 'Drift', min: -2, max: 2, step: 0.1 },
  { key: 'jitter', label: 'Jitter', min: 0, max: 5, step: 0.1 },
  { key: 'updatesPerDraw', label: 'Speed', min: 1, max: 100, step: 1 },
];
