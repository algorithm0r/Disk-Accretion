'use strict';
// The disk. Holds all state and advances it; draws nothing (the Observer renders it), which
// is what lets the same world run headlessly with no canvas.
//
// State is structure-of-arrays: body i is (x[i], y[i], vx[i], vy[i], m[i], r[i], spin[i]).
// Alive bodies are always packed into 0..n-1; deaths (merges, accretion, ejection) are
// flagged during a step and compacted at its end, so every hot loop runs over a dense range.
//
// The star is a fixed unit mass at the origin. Its pull is central, so L_z about the origin
// is conserved; momentum is not (the fixed star soaks it up).
//
// One step is kick-drift-kick with fixed dt, in one of two integrators (P.integrator):
//   leapfrog: v += a·dt/2;  x += v·dt;  [remove, collide+merge, compact];  a = a(x);  v += a·dt/2
//             (a = star + body-body; collisions on the drifted positions, drift velocities)
//   hybrid:   the same shape, but a = body-body far part only and the drift is the exact Kepler
//             orbit, with close encounters, contacts and star grazing resolved inside it
//             (hybrid.js). The grid collision pass then only counts contacts the drift missed.

// Body radius per unit m^(1/3), chosen so radiusInflation = 1 is Earth's mean density at
// r = 1 AU: R_earth/AU = 4.26e-5 and (M_earth/M_sun)^(1/3) = 0.01443 → 2.95e-3.
var K_RADIUS = 2.95e-3;

var World = class World {
  constructor(params) {
    this.P = params || PARAMETERS;
    const N = Math.max(2, Math.round(this.P.N));
    this.cap = N;
    this.x = new Float64Array(N); this.y = new Float64Array(N);
    this.vx = new Float64Array(N); this.vy = new Float64Array(N);
    this.ax = new Float64Array(N); this.ay = new Float64Array(N);
    this.m = new Float64Array(N); this.r = new Float64Array(N);
    this.spin = new Float64Array(N);   // internal angular momentum soaked up by merges
    this.dead = new Uint8Array(N);
    this.n = 0;
    this.t = 0;
    this.steps = 0;

    // bookkeeping for what leaves the disk (mass + the L_z it carries away)
    this.massAccreted = 0; this.LAccreted = 0; this.nAccreted = 0;
    this.massEjected = 0; this.LEjected = 0; this.nEjected = 0;
    this.nMerges = 0;
    this.pendingDeaths = 0;

    this.tree = new BarnesHut(N);
    this.grid = new CollisionGrid(N);
    this.lastInteractions = 0;
    this.gravityMode = this.P.gravity;
    this.timing = { step: 0, gravity: 0, collide: 0, drift: 0 };   // EMA, ms

    this.starIndex = -1;   // ≥ 0 when the star is a live body (P.liveStar, set by a preset)
    this.initDisk();
    // a preset (presets.js) may replace the disk with its own setup: test particles, planets, a live star
    const pre = (typeof PRESETS !== 'undefined' && this.P.preset) ? PRESETS[this.P.preset] : null;
    if (pre && pre.setup) pre.setup(this);
    this.computeForces();
    this.M0 = this.totalMass();
    this.L0 = this.totalLz();
  }

  // Radius = inflation × K·m^(1/3). With inflationRamp q > 0 the inflation fades as a body
  // grows, f(m) = 1 + (f₀ − 1)(m₀/m)^q: small bodies stay puffy (fast, watchable sweeping) while
  // big ones approach true density, so their surface escape speed (and Safronov number) is
  // realistic. q = 0 is plain constant inflation.
  radiusOf(mass) {
    const P = this.P, q = P.inflationRamp || 0;
    const f = q > 0 ? 1 + (P.radiusInflation - 1) * Math.pow(this.m0 / mass, q) : P.radiusInflation;
    return f * K_RADIUS * Math.cbrt(mass);
  }

  // Equal-mass bodies on circular orbits plus a small random velocity. Σ ∝ r^-p means
  // dN/dr ∝ r^(1-p); sampled by inverting its CDF. The circular speed counts the star plus
  // the disk mass inside r (a spherical approximation, good to ~diskMass).
  initDisk() {
    const P = this.P, N = this.cap, rng = new RNG(P.seed);
    const rIn = P.rIn, rOut = P.rOut, p = P.sigmaSlope, k = 2 - p;
    const m0 = P.diskMass / N;
    this.m0 = m0;
    const encFrac = (rr) => (Math.abs(k) < 1e-9)
      ? Math.log(rr / rIn) / Math.log(rOut / rIn)
      : (Math.pow(rr, k) - Math.pow(rIn, k)) / (Math.pow(rOut, k) - Math.pow(rIn, k));
    for (let i = 0; i < N; i++) {
      const u = rng.next();
      const rr = (Math.abs(k) < 1e-9)
        ? rIn * Math.pow(rOut / rIn, u)
        : Math.pow(Math.pow(rIn, k) + u * (Math.pow(rOut, k) - Math.pow(rIn, k)), 1 / k);
      const phi = rng.next() * TAU;
      const vc = Math.sqrt((1 + P.diskMass * encFrac(rr)) / rr);
      // epicyclic ratio: Keplerian σ_φ = σ_r / 2
      const vr = P.dispersion * vc * rng.normal();
      const vt = vc + 0.5 * P.dispersion * vc * rng.normal();
      const c = Math.cos(phi), s = Math.sin(phi);
      this.x[i] = rr * c; this.y[i] = rr * s;
      this.vx[i] = vr * c - vt * s; this.vy[i] = vr * s + vt * c;
      this.m[i] = m0; this.r[i] = this.radiusOf(m0); this.spin[i] = 0;
    }
    this.n = N;
  }

  // the engine entity hook: one sim step per update
  update() { this.step(); }

  // Browser hook for an async force provider (worker pool or GPU, see pool.js): the provider
  // replaces only the body-body term, everything else is the same step. Without a provider
  // this is the synchronous step.
  async updateAsync() {
    const prov = this.provider;
    if (!prov || !this.P.selfGravity) { this.step(); return; }
    this.beginStep();
    const t2 = nowMs();
    this.gravityMode = prov.name;
    this.lastInteractions = await prov.selfAccel(this);
    this.finishKickAccel();
    this.endStep(t2, nowMs());
  }

  step() {
    this.beginStep();
    const t2 = nowMs();
    this.computeForces();
    this.endStep(t2, nowMs());
  }

  // P.integrator: 'leapfrog' (the fixed-step KDK of Stages 1–5) or 'hybrid' (hybrid.js:
  // Kepler drift + MERCURIUS-style close encounters). Switching rebuilds what the kick needs.
  // (the hybrid's Kepler drift needs the star fixed at the origin, so a live star means leapfrog)
  get isHybrid() { return this.P.integrator === 'hybrid' && !this.P.liveStar; }
  syncIntegrator() {
    if (this.isHybrid && !this.hybrid) this.hybrid = new HybridIntegrator(this);
    if (this.isHybrid) this.hybrid.recomputeRc();
    this.computeForces();
  }

  // kick (half) + drift, then removal, collisions and compaction
  beginStep() {
    const P = this.P, dt = P.dt, hdt = 0.5 * dt;
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, ax = this.ax, ay = this.ay;
    const t0 = nowMs();
    const n = this.n;
    if (this.isHybrid !== this._wasHybrid) this.syncIntegrator();
    if (this.isHybrid) {
      // far-part kick, then Kepler drift with the encounter groups resolved (contacts merge
      // inside the drift); the grid pass afterwards only counts contacts the drift missed
      for (let i = 0; i < n; i++) { vx[i] += ax[i] * hdt; vy[i] += ay[i] * hdt; }
      this.hybrid.drift(dt);
    } else {
      for (let i = 0; i < n; i++) {
        const vxi = vx[i] + ax[i] * hdt, vyi = vy[i] + ay[i] * hdt;
        vx[i] = vxi; vy[i] = vyi;
        x[i] += vxi * dt; y[i] += vyi * dt;
      }
    }
    this.t += dt;
    const t1 = nowMs();
    this.removeEscapers();
    if (P.collisions) {
      const missed = this.gravityMode === 'direct' && this.massIdx
        ? this.grid.collideMassive(this, dt, this.massIdx, this._nMassive)
        : this.grid.collide(this, dt);
      if (this.isHybrid) { this.hybrid.stats.missed = missed; this.hybrid.total.missed += missed; }
    }
    if (this.pendingDeaths) this.compact();
    this._t0 = t0; this._t1 = t1;
  }

  // the closing half kick (forces at the new positions are in ax/ay), plus timing
  endStep(t2, t3) {
    const hdt = 0.5 * this.P.dt, n = this.n;
    const vx = this.vx, vy = this.vy, ax = this.ax, ay = this.ay;
    for (let i = 0; i < n; i++) { vx[i] += ax[i] * hdt; vy[i] += ay[i] * hdt; }
    this.steps++;
    const t0 = this._t0, t1 = this._t1;
    const t4 = nowMs(), T = this.timing, a = this.steps < 5 ? 1 : 0.1;
    T.drift += a * ((t1 - t0) + (t4 - t3) - T.drift);
    T.collide += a * ((t2 - t1) - T.collide);
    T.gravity += a * ((t3 - t2) - T.gravity);
    T.step += a * ((t4 - t0) - T.step);
  }

  // The kick acceleration. Leapfrog: softened body-body gravity (tree or exact) + the star.
  // Hybrid: body-body gravity minus the near part of close pairs (the star is in the drift).
  computeForces() {
    const P = this.P, n = this.n;
    const x = this.x, y = this.y, ax = this.ax, ay = this.ay;
    // brute force above bruteMaxN would hang the tab, so it falls back to the tree
    this.gravityMode = (P.gravity === 'brute' && n <= P.bruteMaxN) ? 'brute' : 'bh';
    // few massive bodies among many massless test particles: sum over the massive ones only (exact)
    let nMassive = 0;
    if (P.selfGravity) {
      if (!this.massIdx || this.massIdx.length < n) this.massIdx = new Int32Array(Math.max(16, n));
      for (let i = 0; i < n && nMassive <= 64; i++) if (this.m[i] > 0) this.massIdx[nMassive++] = i;
    }
    if (P.selfGravity && nMassive <= 64 && nMassive < n) {
      this.gravityMode = 'direct';
      this._nMassive = nMassive;
      massiveAccel(x, y, this.m, n, P.softening * P.softening, ax, ay, this.massIdx, nMassive);
      this.lastInteractions = n * nMassive;
    } else if (!P.selfGravity) {
      for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }
      this.lastInteractions = 0;
    } else if (this.gravityMode === 'brute') {
      bruteForceAccel(x, y, this.m, n, P.softening * P.softening, ax, ay);
      this.lastInteractions = n * (n - 1) / 2;
    } else {
      this.tree.build(x, y, this.m, n, P.theta);
      const eps2 = P.softening * P.softening;
      this.lastInteractions = P.bhGroup > 0
        ? this.tree.accelGrouped(x, y, this.m, n, eps2, ax, ay, P.bhGroup)
        : this.tree.accel(x, y, this.m, n, eps2, ax, ay);
    }
    this.finishKickAccel();
  }

  finishKickAccel() {
    this._wasHybrid = this.isHybrid;
    if (this.isHybrid) {
      if (!this.hybrid) { this.hybrid = new HybridIntegrator(this); }
      if (this.P.selfGravity) this.hybrid.subtractNear();
      else this.hybrid.findCandidates();
    } else if (!this.P.liveStar) {
      this.addStarAccel();
    }
  }

  addStarAccel() {
    const x = this.x, y = this.y, ax = this.ax, ay = this.ay, n = this.n;
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      const r2 = xi * xi + yi * yi;
      const inv = 1 / Math.sqrt(r2);
      const f = inv * inv * inv;
      ax[i] -= f * xi; ay[i] -= f * yi;
    }
  }

  // Perfect merge of bodies i and j: mass and momentum conserved, the pair's orbital angular
  // momentum about their joint centre of mass goes into spin, so (orbital + spin) L_z is
  // conserved exactly. The heavier body's slot survives. Returns the survivor's index.
  merge(i, j) {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, m = this.m;
    const keep = m[j] > m[i] ? j : i, gone = keep === i ? j : i;
    const mi = m[i], mj = m[j], M = mi + mj;
    const X = (mi * x[i] + mj * x[j]) / M, Y = (mi * y[i] + mj * y[j]) / M;
    const VX = (mi * vx[i] + mj * vx[j]) / M, VY = (mi * vy[i] + mj * vy[j]) / M;
    const Lint =
      mi * ((x[i] - X) * (vy[i] - VY) - (y[i] - Y) * (vx[i] - VX)) +
      mj * ((x[j] - X) * (vy[j] - VY) - (y[j] - Y) * (vx[j] - VX));
    this.spin[keep] = this.spin[i] + this.spin[j] + Lint;
    x[keep] = X; y[keep] = Y; vx[keep] = VX; vy[keep] = VY;
    m[keep] = M; this.r[keep] = this.radiusOf(M);
    this.dead[gone] = 1;
    this.pendingDeaths++;
    this.nMerges++;
    return keep;
  }

  // bodies that fall into the star or fly past rEject leave the disk; their mass and L_z
  // are banked so the conservation totals still close
  removeEscapers() {
    const P = this.P, n = this.n;
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, m = this.m, dead = this.dead;
    // with a live star, falling in is a collision with the star body, found by the grid
    const rs2 = P.liveStar ? -1 : P.rStar * P.rStar, re2 = P.rEject * P.rEject;
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const r2 = x[i] * x[i] + y[i] * y[i];
      if (r2 < rs2) this.removeBody(i, 'accrete');
      else if (r2 > re2) this.removeBody(i, 'eject');
    }
  }

  // take body i out of the disk, banking its mass and L_z (orbital + spin)
  removeBody(i, kind) {
    if (this.dead[i]) return;
    const m = this.m[i];
    const L = m * (this.x[i] * this.vy[i] - this.y[i] * this.vx[i]) + this.spin[i];
    if (kind === 'accrete') { this.massAccreted += m; this.LAccreted += L; this.nAccreted++; }
    else { this.massEjected += m; this.LEjected += L; this.nEjected++; }
    this.dead[i] = 1;
    this.pendingDeaths++;
  }

  // pack the survivors into 0..n-1 (order-preserving)
  compact() {
    const n = this.n, dead = this.dead;
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, ax = this.ax, ay = this.ay;
    const m = this.m, r = this.r, spin = this.spin, rc = this.rc;
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      if (w !== i) {
        x[w] = x[i]; y[w] = y[i]; vx[w] = vx[i]; vy[w] = vy[i]; ax[w] = ax[i]; ay[w] = ay[i];
        m[w] = m[i]; r[w] = r[i]; spin[w] = spin[i];
        if (rc) rc[w] = rc[i];
        if (this.tag) this.tag[w] = this.tag[i];
      }
      dead[w] = 0;
      w++;
    }
    this.n = w;
    this.pendingDeaths = 0;
  }

  // re-derive every radius (the inflation slider changes them live)
  updateRadii() {
    for (let i = 0; i < this.n; i++) this.r[i] = this.radiusOf(this.m[i]);
    if (this.hybrid) this.hybrid.recomputeRc();   // r_c includes 2R
  }

  // ─── diagnostics ────────────────────────────────────────────────────────────────
  totalMass() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.m[i];
    return s + this.massAccreted + this.massEjected;
  }

  // orbital + spin L_z of the disk, plus what left it (velocities are synchronised between steps)
  totalLz() {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, m = this.m, spin = this.spin;
    let L = 0;
    for (let i = 0; i < this.n; i++) L += m[i] * (x[i] * vy[i] - y[i] * vx[i]) + spin[i];
    return L + this.LAccreted + this.LEjected;
  }

  // Exact energy, O(N²) (tests only). Merges dissipate it, so it is conserved only with
  // collisions off. Uses the same Plummer-softened potential as the forces.
  totalEnergy() {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, m = this.m, n = this.n;
    const eps2 = this.P.softening * this.P.softening;
    let K = 0, U = 0;
    for (let i = 0; i < n; i++) {
      K += 0.5 * m[i] * (vx[i] * vx[i] + vy[i] * vy[i]);
      if (!this.P.liveStar) U -= m[i] / Math.sqrt(x[i] * x[i] + y[i] * y[i]);
      if (this.P.selfGravity) {
        for (let j = i + 1; j < n; j++) {
          const dx = x[j] - x[i], dy = y[j] - y[i];
          U -= m[i] * m[j] / Math.sqrt(dx * dx + dy * dy + eps2);
        }
      }
    }
    return K + U;
  }

  // the numbers the readouts, the data packets and the smoketest all use
  stats() {
    const m = this.m, n = this.n, m0 = this.m0;
    let maxM = 0, nBig = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      if (i === this.starIndex) continue;
      const mi = m[i];
      sum += mi;
      if (mi > maxM) maxM = mi;
      if (mi >= 100 * m0) nBig++;
    }
    return {
      t: this.t,
      steps: this.steps,
      orbits: this.t / TAU,                 // orbits at r = 1
      n: n,
      maxMass: maxM,
      maxMassRatio: maxM / m0,
      nBig: nBig,                           // bodies ≥ 100 initial masses
      diskMass: sum,
      massAccreted: this.massAccreted,
      massEjected: this.massEjected,
      massError: this.M0 > 0 ? (this.totalMass() - this.M0) / this.M0 : 0,
      LzDrift: this.L0 !== 0 ? (this.totalLz() - this.L0) / this.L0 : 0,
      merges: this.nMerges,
      msStep: this.timing.step,
      msGravity: this.timing.gravity,
      msCollide: this.timing.collide,
      gravityMode: this.gravityMode,
    };
  }
};
