'use strict';
// Presets: one-click setups for teaching, each with an exact (or textbook) answer and a tracker
// that measures the sim against it. The browser shows them in the panel (ui.js); smoketest.mjs
// runs the fast ones and validate.mjs the slow ones, with the SAME setup and tracker code, so
// the classroom readout and the validation table are one measurement. VALIDATION.md records
// the references and tolerances.
//
// A preset = { label, explainer, params (applied over the defaults), setup(world) (replaces the
// disk), Tracker (a class: track(world) every few steps, result(world) → { text, measured,
// expected, pass }) }. Test particles are bodies with m = 0: they feel gravity but exert none,
// have radius 0 (so they never touch each other) and are absorbed if they hit a planet or star.
//
// Two star models. Pinned (default): a fixed unit mass at the origin, an external potential.
// Live (params.liveStar): the star is body 0, a unit mass that moves, and the setup is
// barycentric. The difference is the "indirect term": a real star is pulled toward its planets,
// and that pull is what makes the triangular Lagrange points L4/L5 equilibria at all. With a
// pinned star they do not exist (see the trojans preset and VALIDATION.md).

var DEG = Math.PI / 180;

function wrapDeg(a) { a = ((a % 360) + 540) % 360 - 180; return a; }

// Replace the world's bodies with `list` ([{x, y, vx, vy, m, r}]); world.cap must fit it.
function placeBodies(w, list) {
  if (list.length > w.cap) throw new Error('preset needs N ≥ ' + list.length + ' (have ' + w.cap + ')');
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    w.x[i] = b.x; w.y[i] = b.y; w.vx[i] = b.vx; w.vy[i] = b.vy;
    w.m[i] = b.m; w.r[i] = b.r != null ? b.r : (b.m > 0 ? w.radiusOf(b.m) : 0);
    w.spin[i] = 0; w.dead[i] = 0;
  }
  w.n = list.length;
}

// heliocentric osculating elements of body i (relative to the star: the origin, or body 0 when live)
function elements(w, i) {
  const s = w.starIndex;
  const x = w.x[i] - (s >= 0 ? w.x[s] : 0), y = w.y[i] - (s >= 0 ? w.y[s] : 0);
  const vx = w.vx[i] - (s >= 0 ? w.vx[s] : 0), vy = w.vy[i] - (s >= 0 ? w.vy[s] : 0);
  const mu = 1 + (s >= 0 ? w.m[i] : 0);
  const r = Math.sqrt(x * x + y * y), E = 0.5 * (vx * vx + vy * vy) - mu / r, h = x * vy - y * vx;
  const a = -mu / (2 * E);
  const ex = (vy * h) / mu - x / r, ey = (-vx * h) / mu - y / r;
  return { a, e: Math.hypot(ex, ey), varpi: Math.atan2(ey, ex), r, x, y, E, lam: Math.atan2(y, x) };
}

// star + planet on a circular orbit of radius 1 about their barycentre (live) or about the pinned
// star; returns the bodies and the planet's mean motion
function starAndPlanet(w, mu, ecc) {
  const P = w.P, list = [];
  ecc = ecc || 0;
  if (P.liveStar) {
    // relative orbit with a = 1 started at pericentre, split about the barycentre
    const M = 1 + mu, f = mu / M, rp = 1 - ecc, vrel = Math.sqrt(M * (1 + ecc) / rp);
    list.push({ x: -f * rp, y: 0, vx: 0, vy: -f * vrel, m: 1, r: P.rStar });
    list.push({ x: (1 - f) * rp, y: 0, vx: 0, vy: (1 - f) * vrel, m: mu });
    w.starIndex = 0;
    return { list, n: Math.sqrt(M), planet: 1 };
  }
  const rp = 1 - ecc;
  list.push({ x: rp, y: 0, vx: 0, vy: Math.sqrt((1 + ecc) / rp), m: mu });
  return { list, n: 1, planet: 0 };
}

// a test particle on a circular heliocentric orbit of radius r at angle phi (from the star)
function tpCircular(w, list, r, phi) {
  const s = w.starIndex >= 0 ? list[w.starIndex] : { x: 0, y: 0, vx: 0, vy: 0 };
  const v = Math.sqrt(1 / r);
  list.push({ x: s.x + r * Math.cos(phi), y: s.y + r * Math.sin(phi),
    vx: s.vx - v * Math.sin(phi), vy: s.vy + v * Math.cos(phi), m: 0, r: 0 });
}

// mean longitude λ = ϖ + M, via the true anomaly so it stays well defined as e → 0
function meanLongitude(el) {
  const f = el.lam - el.varpi, e = Math.min(el.e, 0.999999);
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(f / 2), Math.sqrt(1 + e) * Math.cos(f / 2));
  return el.varpi + E - e * Math.sin(E);
}

// angle of body i from the planet, seen from the star, in degrees (−180, 180]
function angleFromPlanet(w, i, ip) {
  const s = w.starIndex, sx = s >= 0 ? w.x[s] : 0, sy = s >= 0 ? w.y[s] : 0;
  return wrapDeg((Math.atan2(w.y[i] - sy, w.x[i] - sx) - Math.atan2(w.y[ip] - sy, w.x[ip] - sx)) / DEG);
}

// Trackers follow bodies through compaction (indices shift when bodies die) by each body's
// initial index, kept in w.tag, which World.compact moves along with the other arrays.
function tagBodies(w) {
  if (!w.tag || w.tag.length < w.cap) w.tag = new Float64Array(w.cap);
  for (let i = 0; i < w.n; i++) w.tag[i] = i;
}

var PRESETS = {
  disk: {
    label: 'Planet formation (default disk)',
    explainer: 'Ten thousand planetesimals orbit a star and merge when they touch. The largest bodies grow fastest ' +
      '(runaway growth), then a handful of oligarchs divide the disk between them, ending a few mutual Hill radii apart. ' +
      'Evidence: FINDINGS §1, §6 (runaway peak at ~20 orbits, final spacing ~7 R_H).',
    params: {},
    Tracker: class {
      constructor() { this.peak = 0; this.peakT = 0; }
      track(w) {
        const s = w.stats(), rel = s.maxMassRatio / (w.cap / Math.max(1, s.n));
        if (rel > this.peak) { this.peak = rel; this.peakT = s.orbits; }
      }
      result(w) {
        const s = w.stats();
        return { text: 'largest/mean mass peaked at ' + this.peak.toFixed(0) + '× (orbit ' + this.peakT.toFixed(0) + '); ' + s.nBig + ' bodies ≥ 100 m₀',
          measured: this.peak, expected: 'peak ~40–60× at ~15–30 orbits (FINDINGS §1, §6)', pass: null };
      }
    },
  },

  toomre: {
    label: 'Gravitational instability (Toomre Q < 1)',
    explainer: 'A disk heavy enough that its own gravity beats rotation and random motion (Toomre Q ≈ 0.3). With ' +
      'collisions off you see it break into sheared wakes and clumps within one orbit, then heat up and relax. ' +
      'Evidence: FINDINGS §2 (clumping 3× random at Q = 0.28 vs 1.2 at Q = 9).',
    params: { N: 10000, diskMass: 0.1, collisions: false },
    minOrbits: 1,
    Tracker: class {
      constructor() { this.peak = 1; }
      track(w) {
        // count variance / mean in polar cells (Poisson = 1), averaged over annuli
        const nr = 10, nphi = 48, g = new Float64Array(nr * nphi);
        for (let i = 0; i < w.n; i++) {
          const r = Math.hypot(w.x[i], w.y[i]);
          if (r < 0.5 || r >= 2) continue;
          const ir = Math.floor((r - 0.5) / 1.5 * nr), ip = Math.floor((Math.atan2(w.y[i], w.x[i]) + Math.PI) / TAU * nphi) % nphi;
          g[ir * nphi + ip]++;
        }
        let acc = 0;
        for (let a = 0; a < nr; a++) {
          let s = 0, s2 = 0;
          for (let p = 0; p < nphi; p++) { const c = g[a * nphi + p]; s += c; s2 += c * c; }
          const mean = s / nphi; acc += mean > 0 ? (s2 / nphi - mean * mean) / mean : 1;
        }
        this.now = acc / nr; if (this.now > this.peak) this.peak = this.now;
      }
      result() {
        return { text: 'clumping ' + (this.now || 1).toFixed(2) + '× random now, peak ' + this.peak.toFixed(2) + '×',
          measured: this.peak, expected: '≫ 1 (≈ 3) within 0.5–1 orbit for Q < 1; ≈ 1.2 at Q ≈ 9', pass: null };
      }
    },
  },

  kepler: {
    label: 'Kepler orbits (test particles)',
    explainer: 'Massless particles on single orbits around the star, from circular to very eccentric. Kepler: the period ' +
      'depends only on the semi-major axis (T ∝ a^1.5), the orbit closes on itself (no precession) and the energy stays ' +
      'fixed. The readout is the worst error over all orbits, with the hybrid integrator. Switch to leapfrog to see the ' +
      'eccentric orbits drift.',
    params: { N: 16, rStar: 0.01, integrator: 'hybrid', stepsPerFrame: 20 },
    minOrbits: 5,
    setup(w) {
      const list = [];
      for (const a of [0.5, 1, 1.5, 2]) for (const e of [0, 0.3, 0.6, 0.85]) {
        // start at pericentre
        const rp = a * (1 - e), v = Math.sqrt((1 + e) / rp), ph = list.length * 0.7;
        list.push({ x: rp * Math.cos(ph), y: rp * Math.sin(ph), vx: -v * Math.sin(ph), vy: v * Math.cos(ph), m: 0, r: 0 });
      }
      placeBodies(w, list); tagBodies(w);
      w.m0 = 1e-6;
    },
    Tracker: class {
      track(w) {
        if (!this.init) {
          this.init = []; this.lam = []; this.turns = [];
          for (let i = 0; i < w.n; i++) {
            const el = elements(w, i);
            this.init.push({ a: el.a, e: el.e, varpi: el.varpi, E: el.E });
            this.lam.push(meanLongitude(el)); this.turns.push(0);
          }
          this.t0 = w.t; this.tLast = w.t; this.worstE = 0; this.worstVarpi = 0;
          return;
        }
        this.tLast = w.t;
        for (let i = 0; i < w.n; i++) {
          const el = elements(w, i), I = this.init[w.tag[i]];
          this.worstE = Math.max(this.worstE, Math.abs((el.E - I.E) / I.E));
          if (I.e > 0.05) this.worstVarpi = Math.max(this.worstVarpi, Math.abs(wrapDeg((el.varpi - I.varpi) / DEG)));
          const lam = meanLongitude(el), k = w.tag[i];
          let d = lam - this.lam[k];
          d -= TAU * Math.round(d / TAU);
          this.turns[k] += d; this.lam[k] = lam;
        }
      }
      result(w) {
        // mean motion error: total mean longitude advanced vs n = a^-1.5 · time, over the tracked span
        const T = this.tLast - this.t0;
        let worstN = 0;
        if (T > 0) for (let i = 0; i < w.n; i++) {
          const I = this.init[w.tag[i]], nExp = Math.pow(I.a, -1.5);
          worstN = Math.max(worstN, Math.abs(this.turns[w.tag[i]] / T / nExp - 1));
        }
        const orbits = T / TAU;
        return { text: 'worst |ΔE/E| ' + (this.worstE || 0).toExponential(1) + ', apse drift ' + (this.worstVarpi || 0).toFixed(3) + '°, period error ' + worstN.toExponential(1) + ' (' + orbits.toFixed(0) + ' orbits)',
          measured: { energy: this.worstE, apseDeg: this.worstVarpi, period: worstN },
          expected: '|ΔE/E| < 1e-9, apse drift < 1e-4°, period error < 1e-8', pass: this.worstE < 1e-9 && this.worstVarpi < 1e-4 && worstN < 1e-8 };
      }
    },
  },
  trojans: {
    label: 'Trojans: Lagrange points L4 / L5',
    explainer: 'A Jupiter-mass planet (μ = 0.001) and swarms of massless particles sharing its orbit. Particles near ' +
      'the points 60° ahead (L4) and behind (L5) librate around them on tadpole orbits; others swap ends on horseshoe ' +
      'orbits. The readout is the measured libration centre. Untick "Live star" to see why the star must move: with a ' +
      'pinned star the Lagrange points do not exist.',
    params: { N: 202, liveStar: true, planetMass: 1e-3, radiusInflation: 1, rStar: 0.01, integrator: 'leapfrog', dt: 0.005, stepsPerFrame: 60 },
    minOrbits: 40,
    setup(w) {
      const P = w.P, rng = new RNG(P.seed), sp = starAndPlanet(w, P.planetMass, 0), list = sp.list;
      const ip = sp.planet, pl = list[ip], st = w.starIndex >= 0 ? list[0] : { x: 0, y: 0 };
      const phiP = Math.atan2(pl.y - st.y, pl.x - st.x);
      for (let k = 0; k < 140; k++) {   // tadpole candidates around L4 (k even) and L5 (odd); half close in
        const side = k % 2 ? -1 : 1, near = k < 70, phi = phiP + side * (60 + (rng.next() * 2 - 1) * (near ? 4 : 20)) * DEG;
        tpCircular(w, list, 1 + (rng.next() * 2 - 1) * (near ? 0.0008 : 0.004), phi);
      }
      for (let k = 0; k < 60; k++) {    // horseshoe candidates: far from the planet, very close to its orbit
        const side = k % 2 ? -1 : 1, phi = phiP + side * (90 + rng.next() * 80) * DEG;
        tpCircular(w, list, 1 + (rng.next() * 2 - 1) * 0.0015, phi);
      }
      placeBodies(w, list); tagBodies(w);
      w.planetIndex = ip; w.m0 = P.planetMass / 2000;
    },
    Tracker: class {
      constructor() { this.s = new Map(); }
      track(w) {
        const ip = w.planetIndex;
        this.last = w.steps;
        for (let i = 0; i < w.n; i++) {
          if (w.m[i] > 0) continue;
          const th = angleFromPlanet(w, i, ip), k = w.tag[i];
          let q = this.s.get(k);
          if (!q) { q = { min: th, max: th, sum: 0, n: 0, pos: false, neg: false, near: false }; this.s.set(k, q); }
          q.min = Math.min(q.min, th); q.max = Math.max(q.max, th); q.sum += th; q.n++;
          if (th > 0) q.pos = true; else q.neg = true;
          if (Math.abs(th) < 10) q.near = true;
          q.alive = w.steps;
        }
      }
      result(w) {
        const L4 = [], L5 = [];
        let tad = 0, horse = 0, other = 0;
        for (const q of this.s.values()) {
          if (q.alive !== this.last) { other++; continue; }   // gone (hit the planet or star, or ejected)
          if (q.pos !== q.neg) {
            tad++;
            // the centre of small librations: the midpoint of the swing (larger tadpoles are
            // lopsided toward L3 and their centre drifts outward, ~1° at 20° amplitude)
            if (q.max - q.min < 10) (q.pos ? L4 : L5).push((q.max + q.min) / 2);
          } else if (!q.near) horse++; else other++;
        }
        const mean = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
        const c4 = mean(L4), c5 = mean(L5);
        const ok = L4.length > 3 && L5.length > 3 && Math.abs(c4 - 60) < 0.5 && Math.abs(c5 + 60) < 0.5;
        return { text: (tad ? 'libration centres ' + (isNaN(c4) ? '—' : c4.toFixed(2) + '°') + ' / ' + (isNaN(c5) ? '—' : c5.toFixed(2) + '°') +
            ' (expected ±60°); ' : 'NO tadpoles (no L4/L5 with a pinned star); ') + tad + ' tadpoles, ' + horse + ' librating about 180° / horseshoes',
          measured: { L4: c4, L5: c5, nL4: L4.length, nL5: L5.length, tadpoles: tad, horseshoes: horse }, expected: '+60° and −60°, ±0.5° (small-amplitude tadpoles)', pass: ok };
      }
    },
  },

  routh: {
    label: 'Routh criterion: when L4 / L5 stop being stable',
    explainer: 'The triangular Lagrange points are stable only if the planet is less than 1/26 of the system ' +
      '(μ = m/(M★+m) < 0.0385, Routh 1875). Raise the planet mass past that and the swarm parked at L4 drifts away. Needs the live ' +
      'star: the classical result assumes both bodies orbit their common centre of mass.',
    params: { N: 42, liveStar: true, planetMass: 0.03, radiusInflation: 1, rStar: 0.01, integrator: 'leapfrog', dt: 0.002, stepsPerFrame: 150 },
    minOrbits: 100,
    setup(w) {
      const P = w.P, rng = new RNG(P.seed), sp = starAndPlanet(w, P.planetMass, 0), list = sp.list;
      const st = w.starIndex === 0 ? list[0] : { x: 0, y: 0, vx: 0, vy: 0 }, pl = list[sp.planet];
      // L4/L5 exactly: equilateral with star and planet, co-rotating with the binary about the
      // barycentre (the origin) at its mean motion
      const om = sp.n;
      // 20 visible particles within ±1° of L4/L5, then 20 linear probes 1e-5 rad off the exact points
      for (let k = 0; k < 40; k++) {
        const probe = k >= 20, side = k % 2 ? -1 : 1;
        const dphi = side * 60 * DEG + (probe ? (k % 4 < 2 ? 1 : -1) * 1e-5 : (rng.next() * 2 - 1) * 1 * DEG);
        const dx = pl.x - st.x, dy = pl.y - st.y;
        const x = st.x + dx * Math.cos(dphi) - dy * Math.sin(dphi), y = st.y + dx * Math.sin(dphi) + dy * Math.cos(dphi);
        list.push({ x, y, vx: -om * y, vy: om * x, m: 0, r: 0 });
      }
      placeBodies(w, list); tagBodies(w);
      w.planetIndex = sp.planet; w.m0 = P.planetMass / 2000;
    },
    // Routh is a LINEAR stability criterion, so the verdict comes from the probes: below μ_c they
    // stay within ~0.01° of L4/L5; above it they grow exponentially (e-folding in a few orbits) past
    // 1°. The 1° swarm is the visible part; just above μ_c it saturates into a bounded orbit near
    // L4 instead of flying off (nonlinear), which is why it can't be the test.
    Tracker: class {
      constructor() { this.dev = 0; this.probeDev = 0; this.alive0 = null; }
      track(w) {
        let worst = 0, n = 0;
        for (let i = 0; i < w.n; i++) {
          if (w.m[i] > 0) continue;
          const d = Math.abs(Math.abs(angleFromPlanet(w, i, w.planetIndex)) - 60);
          if (w.tag[i] >= 22) this.probeDev = Math.max(this.probeDev, d);
          else worst = Math.max(worst, d);
          n++;
        }
        if (this.alive0 == null) this.alive0 = n;
        this.dev = Math.max(this.dev, worst); this.n = n;
      }
      result(w) {
        // Routh's μ is the planet's share of the total mass, m / (M★ + m), not m / M★
        const m = w.P.planetMass, mu = m / (1 + m), MU_C = (1 - Math.sqrt(23 / 27)) / 2, stable = this.probeDev < 1;
        return { text: 'μ = m/(M★+m) = ' + mu.toFixed(4) + ': probes 6e-4° off L4/L5 reached ' + this.probeDev.toExponential(1) + '° → ' + (stable ? 'stable' : 'unstable') +
            '; the 1° swarm strayed up to ' + this.dev.toFixed(1) + '°' +
            ' (Routh: ' + (mu < MU_C ? 'stable' : 'unstable') + ' for μ ' + (mu < MU_C ? '<' : '>') + ' 0.03852)',
          measured: { mu, maxDevDeg: this.dev, probeDevDeg: this.probeDev, stable }, expected: 'stable iff μ < 0.03852 (probes stay < 1°)', pass: stable === (mu < MU_C) };
      }
    },
  },

  gap: {
    label: 'A planet clears its chaotic zone',
    explainer: 'A Jupiter-mass planet in a ring of massless particles. Within a band around its orbit, overlapping ' +
      'resonances make orbits chaotic and the particles are scattered away in a few hundred orbits, leaving a gap of ' +
      'half-width Δa ≈ 1.3 μ^{2/7} a (Wisdom 1980): 0.18 for μ = 0.001. Particles in the co-orbital zone (Trojans, ' +
      'horseshoes) survive inside it.',
    params: { N: 1202, liveStar: true, planetMass: 1e-3, radiusInflation: 1, rStar: 0.02, integrator: 'leapfrog', dt: 0.005, stepsPerFrame: 60 },
    minOrbits: 300,
    setup(w) {
      const P = w.P, rng = new RNG(P.seed), sp = starAndPlanet(w, P.planetMass, 0), list = sp.list;
      // particles over a ± 2.2·(1.3 μ^{2/7}) (at least ±0.4): the range scales with μ so the zone's
      // edges always fall inside it (the setup knows the expected width; the measurement does not use it)
      const half = Math.max(0.4, 2.2 * 1.3 * Math.pow(P.planetMass, 2 / 7)), lo = Math.max(0.3, 1 - half), hi = 1 + half;
      const nTp = w.cap - list.length;
      for (let k = 0; k < nTp; k++) tpCircular(w, list, lo + (hi - lo) * (k + rng.next()) / nTp, rng.next() * TAU);
      placeBodies(w, list); tagBodies(w);
      w.planetIndex = sp.planet; w.m0 = P.planetMass / 2000; w.gapRange = [lo, hi];
    },
    Tracker: class {
      track(w) {
        if (!this.a0) {
          this.a0 = new Map();
          for (let i = 0; i < w.n; i++) if (w.m[i] === 0) this.a0.set(w.tag[i], elements(w, i).a);
        }
      }
      result(w) {
        // A particle is cleared if it is gone (hit the planet or star, or ejected) or its semi-major
        // axis moved by > 5%. Resonances outside the zone pump e but keep a, so they don't count.
        // Each edge: walking outward from just beyond the co-orbital band (|a − 1| > 0.05), the
        // first bin in which fewer than half the particles are cleared.
        const [lo, hi] = w.gapRange, bins = Math.round((hi - lo) / 0.02), bw = (hi - lo) / bins;
        const tot = new Float64Array(bins), clr = new Float64Array(bins), alive = new Map();
        for (let i = 0; i < w.n; i++) if (w.m[i] === 0) alive.set(w.tag[i], i);
        for (const [k, a0] of this.a0) {
          const b = Math.min(bins - 1, Math.floor((a0 - lo) / bw));
          tot[b]++;
          const i = alive.get(k);
          let c = i == null;
          if (!c) { const el = elements(w, i); c = !(el.a > 0) || Math.abs(el.a - a0) / a0 > 0.05; }
          if (c) clr[b]++;
        }
        const frac = (b) => tot[b] ? clr[b] / tot[b] : 0, mid = (b) => lo + (b + 0.5) * bw;
        let inner = null, outer = null;
        for (let b = Math.floor((0.95 - lo) / bw); b >= 0; b--) if (frac(b) < 0.5) { inner = mid(b) + 0.5 * bw; break; }
        for (let b = Math.ceil((1.05 - lo) / bw); b < bins; b++) if (frac(b) < 0.5) { outer = mid(b) - 0.5 * bw; break; }
        const mu = w.P.planetMass, exp = 1.3 * Math.pow(mu, 2 / 7);
        const wi = inner == null ? NaN : 1 - inner, wo = outer == null ? NaN : outer - 1;
        const ok = Math.abs(wi / exp - 1) < 0.25;
        this.profile = Array.from(tot, (t, b) => [+mid(b).toFixed(3), t ? +(clr[b] / t).toFixed(2) : null]);
        return { text: 'cleared a = ' + (inner == null ? '—' : inner.toFixed(2)) + ' … ' + (outer == null ? '—' : outer.toFixed(2)) +
            ': inner half-width ' + wi.toFixed(3) + ' vs 1.3 μ^{2/7} = ' + exp.toFixed(3) + ' (outer ' + wo.toFixed(3) + ')',
          measured: { inner, outer, halfInner: wi, halfOuter: wo }, expected: 'inner half-width 1.3 μ^{2/7} a (±25%); outer reported', pass: ok };
      }
    },
  },

  kirkwood: {
    label: 'Resonance gaps (Kirkwood-like)',
    explainer: 'A belt of massless asteroids inside the orbit of an eccentric giant planet (e = 0.05). Where an ' +
      'asteroid\'s period is a simple fraction of the planet\'s (3:1, 5:2, 7:3, 2:1) the planet\'s kicks add up and the ' +
      'orbits are excited out of the belt, opening gaps at a = a_p (p/q)^{2/3}. Here the planet is 3× Jupiter (μ = 0.003) ' +
      'so 3:1 and 2:1 show within ~100 orbits; the real gaps are carved by slow chaos over ~10⁵ orbits (VALIDATION.md).',
    params: { N: 3002, liveStar: true, planetMass: 3e-3, planetEcc: 0.05, radiusInflation: 1, rStar: 0.02, integrator: 'leapfrog', dt: 0.005, stepsPerFrame: 60 },
    minOrbits: 300,
    setup(w) {
      const P = w.P, rng = new RNG(P.seed), sp = starAndPlanet(w, P.planetMass, P.planetEcc), list = sp.list;
      const nTp = w.cap - list.length;
      for (let k = 0; k < nTp; k++) tpCircular(w, list, 0.42 + 0.30 * (k + rng.next()) / nTp, rng.next() * TAU);
      placeBodies(w, list); tagBodies(w);
      w.planetIndex = sp.planet; w.m0 = P.planetMass / 2000;
    },
    Tracker: class {
      track(w) {
        if (!this.a0) { this.a0 = new Map(); for (let i = 0; i < w.n; i++) if (w.m[i] === 0) this.a0.set(w.tag[i], elements(w, i).a); }
      }
      result(w) {
        // Low-e survivors (bound, e < 0.3) binned by their CURRENT a (bins 0.005 wide), as a fraction of
        // the initial count per bin. Near each resonance (±0.012) find the emptiest bin; its depth is
        // 1 − that fraction / the median fraction 0.015–0.04 away on both sides, and its significance in
        // Poisson σ. Location is the test: the gap must sit at a = (p/q)^{2/3} within 0.01.
        const lo = 0.42, hi = 0.72, bw = 0.005, bins = Math.round((hi - lo) / bw);
        const now = new Float64Array(bins), init = new Float64Array(bins);
        for (const a0 of this.a0.values()) init[Math.min(bins - 1, Math.floor((a0 - lo) / bw))]++;
        for (let i = 0; i < w.n; i++) {
          if (w.m[i] !== 0) continue;
          const el = elements(w, i);
          if (el.a > lo && el.a < hi && el.e < 0.3) now[Math.floor((el.a - lo) / bw)]++;
        }
        const fr = (b) => init[b] ? now[b] / init[b] : NaN, mid = (b) => lo + (b + 0.5) * bw;
        const res = [['3:1', 1 / 3], ['5:2', 2 / 5], ['7:3', 3 / 7], ['2:1', 1 / 2]].map(([nm, r]) => {
          const ar = Math.pow(r, 2 / 3);
          let bMin = -1, fMin = Infinity;
          for (let b = 0; b < bins; b++) if (Math.abs(mid(b) - ar) <= 0.012 && fr(b) < fMin) { fMin = fr(b); bMin = b; }
          const ref = [];
          for (let b = 0; b < bins; b++) { const d = Math.abs(mid(b) - ar); if (d >= 0.015 && d <= 0.04 && !isNaN(fr(b))) ref.push(fr(b)); }
          ref.sort((x, y) => x - y);
          const fRef = ref.length ? ref[ref.length >> 1] : NaN, depth = 1 - fMin / fRef;
          const sigma = bMin >= 0 && init[bMin] ? Math.sqrt(Math.max(now[bMin], 1)) / init[bMin] / fRef : NaN;
          return { nm, aRes: +ar.toFixed(3), aGap: bMin >= 0 ? +mid(bMin).toFixed(3) : null, depth: +depth.toFixed(2), sigma: +(depth / sigma).toFixed(1) };
        });
        this.profile = Array.from(now, (c, b) => [+mid(b).toFixed(4), c, init[b]]);
        // a gap is SEEN when the deficit is > 3σ (Poisson) and sits within 0.01 of the prediction;
        // depth is reported, not required (narrow resonances redistribute a as much as they clear it)
        const seen = (x) => x.sigma > 3 && x.depth > 0 && Math.abs(x.aGap - x.aRes) <= 0.01;
        const R = (nm) => res.find((x) => x.nm === nm);
        return { text: res.map((x) => x.nm + ' ' + (seen(x) ? 'gap at ' + x.aGap + ' (predicted ' + x.aRes + ', ' + (x.depth * 100).toFixed(0) + '% deep, ' + x.sigma + 'σ)' : 'no clear gap')).join('; '),
          measured: res, expected: 'gaps at a = (p/q)^{2/3}: 3:1 0.481, 5:2 0.543, 7:3 0.569, 2:1 0.630 (within 0.01)',
          pass: w.P.planetMass >= 2e-3 && w.P.planetMass <= 5e-3 ? seen(R('3:1')) && seen(R('2:1')) : null };
      }
    },
  },

  hill: {
    label: 'Hill stability of two planets',
    explainer: 'Two planets on circular orbits, Δ mutual Hill radii apart. Gladman (1993): if Δ > 2√3 ≈ 3.46 they can ' +
      'never have a close encounter; below it they meet within a few synodic periods. Move the Δ slider across 3.46 ' +
      'and watch the readout.',
    params: { N: 2, hillDelta: 3.0, integrator: 'hybrid', radiusInflation: 1, dt: 0.005, stepsPerFrame: 300 },
    minOrbits: 1000,
    // an encounter settles it early; "never" needs the full run
    ready: (w, r) => r.measured.encounter,
    setup(w) {
      const P = w.P, m = 1e-5, h = Math.cbrt(2 * m / 3), D = P.hillDelta;
      const a1 = 1, a2 = a1 * (1 + D * h / 2) / (1 - D * h / 2), v1 = 1, v2 = 1 / Math.sqrt(a2);
      placeBodies(w, [
        { x: a1, y: 0, vx: 0, vy: v1, m },
        { x: -a2, y: 0, vx: 0, vy: -v2, m },
      ]);
      tagBodies(w);
      w.m0 = m / 100; w.rhm = h * (a1 + a2) / 2;
    },
    Tracker: class {
      constructor() { this.minSep = Infinity; this.firstT = null; }
      track(w) {
        if (w.n < 2) { if (this.firstT == null) this.firstT = w.t / TAU; this.minSep = 0; return; }
        const d = Math.hypot(w.x[1] - w.x[0], w.y[1] - w.y[0]) / w.rhm;
        if (d < this.minSep) this.minSep = d;
        if (d < 1 && this.firstT == null) this.firstT = w.t / TAU;
      }
      result(w) {
        const D = w.P.hillDelta, enc = this.firstT != null, expect = D < 2 * Math.sqrt(3);
        return { text: 'Δ = ' + D.toFixed(2) + ': closest approach ' + this.minSep.toFixed(2) + ' R_H' + (enc ? ', close encounter at orbit ' + this.firstT.toFixed(1) : ', no close encounter') +
            ' (Gladman: ' + (expect ? 'encounter expected' : 'never') + ' for Δ ' + (expect ? '<' : '>') + ' 3.46)',
          measured: { minSep: this.minSep, encounter: enc, firstOrbit: this.firstT }, expected: 'encounter iff Δ < 2√3 = 3.46', pass: enc === expect };
      }
    },
  },
};

// The UI shows a verdict only once the preset has run long enough to mean anything.
function presetVerdict(id, w, r) {
  const pre = PRESETS[id], orbits = w.t / TAU, min = pre.minOrbits || 0;
  if (orbits >= min || (pre.ready && pre.ready(w, r))) return r;
  return Object.assign({}, r, { text: 'measuring… ' + orbits.toFixed(0) + ' / ' + min + ' orbits. So far: ' + r.text, pass: null });
}

// Headless helper (smoketest.mjs, validate.mjs): build the preset's world with params over the
// defaults, run `orbits` (time units / 2π), tracking every `every` steps; returns the result.
function runPreset(id, over, orbits, every) {
  const pre = PRESETS[id];
  const P = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PARAMETERS)), pre.params, over || {}, { preset: id });
  const w = new World(P), tr = new pre.Tracker();
  every = every || 5;
  tr.track(w);
  const steps = Math.round(orbits * TAU / P.dt);
  for (let s = 1; s <= steps; s++) { w.step(); if (s % every === 0) tr.track(w); }
  const res = tr.result(w);
  res.world = w; res.tracker = tr;
  return res;
}
