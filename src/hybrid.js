'use strict';
// Hybrid symplectic integrator, MERCURIUS-style (Chambers 1999; Rein et al. 2019,
// arXiv:1903.04972), for a fixed unit star at the origin.
//
// H = Σ_i Kepler_i  +  Σ_pairs Φ_ij(r) K(r)  +  Σ_pairs Φ_ij(r) (1 − K(r))
//     └─ drift ──┘     └──── kick (far) ───┘     └──── drift (near) ─────┘
//
// One step: kick(dt/2, far part) · drift(dt) · kick(dt/2, far part), where the drift moves every
// body along its EXACT Kepler orbit around the star, except bodies predicted to come within the
// changeover radius of each other during the step. Those form encounter groups, integrated
// together over the drift by an adaptive Dormand–Prince 5(4) on star + near-part forces, with
// contact (perfect merge) and star-grazing checked at every substep. So pericentre passes are
// exact (Stage 5's suspected error source) and close encounters are resolved (the other one).
//
// The changeover K(r) is Chambers's C² polynomial: y = (r − 0.1 r_c)/(0.9 r_c) clamped to [0,1],
// K = 10y³ − 15y⁴ + 6y⁵. The kick uses −∇(ΦK) = K·F + Φ·K′·r̂ — the gradient of the split
// POTENTIAL, not K times the force, or the split stops being Hamiltonian.
// r_c of a pair = max(r_c,i, r_c,j), with r_c,i = max(hillFac·R_H,i, 2R_i, 0.4·v_i·dt), set when
// the body is created or merges and then held fixed (r_c must not move inside a step; REBOUND
// likewise holds dcrit fixed between explicit recalculations).
//
// Kepler drift: universal variables (Danby; Stumpff functions by series for small z), Halley
// iteration. Works for elliptic and hyperbolic orbits.

// ─── Kepler drift (μ = 1) ───────────────────────────────────────────────────────────────
var KEP = { x: 0, y: 0, vx: 0, vy: 0, iters: 0 };

function stumpff(z, out) {
  // c0..c3 of z; series where |z| is small (no cancellation), closed forms otherwise
  if (Math.abs(z) < 0.1) {
    const z2 = z * z, z3 = z2 * z, z4 = z2 * z2, z5 = z4 * z, z6 = z3 * z3;
    out[0] = 1 - z / 2 + z2 / 24 - z3 / 720 + z4 / 40320 - z5 / 3628800 + z6 / 479001600;
    out[1] = 1 - z / 6 + z2 / 120 - z3 / 5040 + z4 / 362880 - z5 / 39916800 + z6 / 6227020800;
    out[2] = 0.5 - z / 24 + z2 / 720 - z3 / 40320 + z4 / 3628800 - z5 / 479001600 + z6 / 87178291200;
    out[3] = 1 / 6 - z / 120 + z2 / 5040 - z3 / 362880 + z4 / 39916800 - z5 / 6227020800 + z6 / 1307674368000;
  } else if (z > 0) {
    const s = Math.sqrt(z);
    out[0] = Math.cos(s); out[1] = Math.sin(s) / s;
    out[2] = (1 - out[0]) / z; out[3] = (1 - out[1]) / z;
  } else {
    const s = Math.sqrt(-z);
    out[0] = Math.cosh(s); out[1] = Math.sinh(s) / s;
    out[2] = (1 - out[0]) / z; out[3] = (1 - out[1]) / z;
  }
}
var _C = new Float64Array(4);

function keplerDrift(x, y, vx, vy, dt) {
  const r0 = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const eta0 = x * vx + y * vy;
  const beta = 2 / r0 - v2;              // 1/a (negative for hyperbolic)
  const zeta0 = 1 - beta * r0;
  let s = dt / r0, it = 0;
  let G0 = 1, G1 = 0, G2 = 0, G3 = 0;
  for (; it < 50; it++) {
    const s2 = s * s;
    stumpff(beta * s2, _C);
    G0 = _C[0]; G1 = s * _C[1]; G2 = s2 * _C[2]; G3 = s2 * s * _C[3];
    const f = r0 * G1 + eta0 * G2 + G3 - dt;
    const fp = r0 * G0 + eta0 * G1 + G2;
    const fpp = eta0 * G0 + zeta0 * G1;
    const ds = f / (fp - 0.5 * f * fpp / fp);   // Halley
    s -= ds;
    if (Math.abs(ds) <= 1e-15 * Math.abs(s) + 1e-300) {
      const s2b = s * s;
      stumpff(beta * s2b, _C);
      G0 = _C[0]; G1 = s * _C[1]; G2 = s2b * _C[2]; G3 = s2b * s * _C[3];
      break;
    }
  }
  const r = r0 * G0 + eta0 * G1 + G2;
  const f = 1 - G2 / r0, g = r0 * G1 + eta0 * G2;
  const fd = -G1 / (r * r0), gd = 1 - G2 / r;
  KEP.x = f * x + g * vx; KEP.y = f * y + g * vy;
  KEP.vx = fd * x + gd * vx; KEP.vy = fd * y + gd * vy;
  KEP.iters = it + 1;
}

// ─── changeover ──────────────────────────────────────────────────────────────────────
// sets CHG.K and CHG.dK (dK/dr) for separation r and changeover radius rc
var CHG = { K: 1, dK: 0 };
function changeover(r, rc) {
  const y = (r - 0.1 * rc) / (0.9 * rc);
  if (y >= 1) { CHG.K = 1; CHG.dK = 0; return; }
  if (y <= 0) { CHG.K = 0; CHG.dK = 0; return; }
  const y2 = y * y, y3 = y2 * y;
  CHG.K = y3 * (10 - 15 * y + 6 * y2);
  CHG.dK = 30 * y2 * (1 - 2 * y + y2) / (0.9 * rc);
}

// Did bodies a and b touch during a substep? Cubic Hermite of their relative motion between the
// substep's two ends (S0 at the start, S1 at the end, step h), sampled at both ends and 7 interior
// points: the substep is short against the encounter, so a pass through contact can't hide
// between samples, while the ends alone miss tiny, fast bodies crossing each other.
function sweptContact(S0, S1, a, b, h, rr2) {
  const a4 = 4 * a, b4 = 4 * b;
  const d1x = S1[b4] - S1[a4], d1y = S1[b4 + 1] - S1[a4 + 1];
  if (d1x * d1x + d1y * d1y < rr2) return true;
  const d0x = S0[b4] - S0[a4], d0y = S0[b4 + 1] - S0[a4 + 1];
  const u0x = (S0[b4 + 2] - S0[a4 + 2]) * h, u0y = (S0[b4 + 3] - S0[a4 + 3]) * h;
  const u1x = (S1[b4 + 2] - S1[a4 + 2]) * h, u1y = (S1[b4 + 3] - S1[a4 + 3]) * h;
  // quick reject: farther apart than the substep could close
  const reach = Math.sqrt(rr2) + Math.max(Math.hypot(u0x, u0y), Math.hypot(u1x, u1y));
  if (d1x * d1x + d1y * d1y > reach * reach && d0x * d0x + d0y * d0y > reach * reach) return false;
  for (let k = 1; k < 8; k++) {
    const t = k / 8, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    const dx = h00 * d0x + h10 * u0x + h01 * d1x + h11 * u1x;
    const dy = h00 * d0y + h10 * u0y + h01 * d1y + h11 * u1y;
    if (dx * dx + dy * dy < rr2) return true;
  }
  return false;
}

// ─── Dormand–Prince 5(4) tableau ───────────────────────────────────────────────────────
var DP = {
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
  a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]],
  b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
  e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],   // b − b*
};

var HybridIntegrator = class HybridIntegrator {
  constructor(world) {
    this.w = world;
    this.hillFac = world.P.hybridHillFac || 3;
    this.rtol = world.P.hybridTol || 1e-11;
    this.cap = 0; this.gCap = 0;
    this.ensure(world.cap);
    // candidate pairs (found at force time, reused by the next drift's encounter prediction)
    this.pi = new Int32Array(1024); this.pj = new Int32Array(1024); this.np = 0;
    this.stats = { groups: 0, inGroups: 0, substeps: 0, pairs: 0, near: 0, contacts: 0, missed: 0, maxGroup: 0 };   // last step
    this.total = { groups: 0, bodySteps: 0, substeps: 0, contacts: 0, missed: 0, maxGroup: 0 };                     // cumulative
    this.recomputeRc();
  }

  ensure(n) {
    if (n <= this.cap) return;
    this.cap = n;
    this.x1 = new Float64Array(n); this.y1 = new Float64Array(n);
    this.vx1 = new Float64Array(n); this.vy1 = new Float64Array(n);
    this.parent = new Int32Array(n); this.grpStart = new Int32Array(n + 1);
    this.grpOff = new Int32Array(n); this.grpFill = new Int32Array(n);
    this.member = new Int32Array(n); this.inGroup = new Uint8Array(n);
  }

  // changeover radius of body i (held fixed until its mass changes)
  rcOf(i) {
    const w = this.w, x = w.x[i], y = w.y[i];
    const r = Math.sqrt(x * x + y * y);
    const rh = r * Math.cbrt(w.m[i] / 3);
    const v = Math.sqrt(w.vx[i] * w.vx[i] + w.vy[i] * w.vy[i]);
    return Math.max(this.hillFac * rh, 2 * w.r[i], 0.4 * v * w.P.dt);
  }

  recomputeRc() {
    const w = this.w;
    if (!w.rc || w.rc.length < w.cap) w.rc = new Float64Array(w.cap);
    for (let i = 0; i < w.n; i++) w.rc[i] = this.rcOf(i);
  }

  // ─── pair candidates: |d| < reach(i, j) = 1.1·max(rc_i, rc_j) + pad ─────────────────────
  // Found at force time (end of a step) and reused by the next drift's encounter prediction;
  // pad = 2·(largest non-circular speed)·dt covers how far a pair can close during one step;
  // the 10% covers shear between neighbours r_c apart (1.5·Ω·r_c·dt ≪ r_c).
  findCandidates() {
    const w = this.w, n = w.n, x = w.x, y = w.y, vx = w.vx, vy = w.vy, rc = w.rc;
    const dt = w.P.dt;
    // relative-drift pad from the largest non-circular speed, as the collision grid does
    let u2max = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i], rr = Math.sqrt(xi * xi + yi * yi), om = 1 / Math.sqrt(rr * rr * rr);
      const ux = vx[i] + yi * om, uy = vy[i] - xi * om, u2 = ux * ux + uy * uy;
      if (u2 > u2max) u2max = u2;
    }
    const pad = Math.min(2 * Math.sqrt(u2max) * dt, 0.05);
    // One grid sized for a typical r_c (the median of a sample). A body scans the rings its own
    // reach needs (1 for typical bodies, more for oligarchs), and each pair is reported once, by
    // the member with the larger r_c (ties: lower index), whose reach covers the pair's.
    const samp = [];
    const stride = Math.max(1, Math.floor(n / 63));
    for (let i = 0; i < n; i += stride) samp.push(rc[i]);
    samp.sort((a, b) => a - b);
    const h = 1.1 * samp[samp.length >> 1] + pad, inv = 1 / h;
    let size = 1024;
    while (size < 2 * n) size <<= 1;
    if (!this.hStart || this.hStart.length !== size + 1) {
      this.hStart = new Int32Array(size + 1); this.hCur = new Int32Array(size);
    }
    if (!this.hKey || this.hKey.length < n) {
      const c = Math.max(n, 16);
      this.hKey = new Int32Array(c); this.hCX = new Int32Array(c); this.hCY = new Int32Array(c);
      this.hSorted = new Int32Array(c);
      // the bodies again in bucket order, so the pair loop reads contiguous memory
      this.sX = new Float64Array(c); this.sY = new Float64Array(c); this.sRC = new Float64Array(c);
      this.sCX = new Int32Array(c); this.sCY = new Int32Array(c);
    }
    const mask = size - 1, start = this.hStart, cur = this.hCur, key = this.hKey, cx = this.hCX, cy = this.hCY, sorted = this.hSorted;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(x[i] * inv), gy = Math.floor(y[i] * inv);
      cx[i] = gx; cy[i] = gy;
      const k = (Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) & mask;
      key[i] = k; start[k + 1]++;
    }
    for (let k = 0; k < size; k++) start[k + 1] += start[k];
    cur.set(start.subarray(0, size));
    for (let i = 0; i < n; i++) sorted[cur[key[i]]++] = i;
    const sX = this.sX, sY = this.sY, sRC = this.sRC, sCX = this.sCX, sCY = this.sCY;
    for (let s = 0; s < n; s++) {
      const j = sorted[s];
      sX[s] = x[j]; sY[s] = y[j]; sRC[s] = rc[j]; sCX[s] = cx[j]; sCY[s] = cy[j];
    }

    let np = 0, pi = this.pi, pj = this.pj;
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i], rci = rc[i], reachI = 1.1 * rci + pad;
      const ring = Math.max(1, Math.ceil(reachI * inv));
      const gx = cx[i], gy = cy[i];
      for (let ox = -ring; ox <= ring; ox++) {
        for (let oy = -ring; oy <= ring; oy++) {
          const k = (Math.imul(gx + ox, 73856093) ^ Math.imul(gy + oy, 19349663)) & mask;
          const tx = gx + ox, ty = gy + oy;
          for (let s = start[k], s1 = start[k + 1]; s < s1; s++) {
            const rcj = sRC[s];
            if (rcj > rci) continue;                                        // j reports it
            if (sCX[s] !== tx || sCY[s] !== ty) continue;                   // hash collision
            const dx = sX[s] - xi, dy = sY[s] - yi;
            if (dx * dx + dy * dy < reachI * reachI) {
              const j = sorted[s];
              if (j === i || (rcj === rci && j < i)) continue;              // self; ties once
              if (np >= pi.length) {
                const a = new Int32Array(pi.length * 2), b = new Int32Array(pi.length * 2);
                a.set(pi); b.set(pj); this.pi = pi = a; this.pj = pj = b;
              }
              pi[np] = i; pj[np] = j; np++;
            }
          }
        }
      }
    }
    this.np = np;
    this.stats.pairs = np;
  }

  // ─── kick acceleration = full body-body (already in ax/ay) − near part of close pairs ────
  // Called after the self-gravity pass; finds the candidate pairs for the next drift too.
  subtractNear() {
    const w = this.w;
    this.findCandidates();
    const x = w.x, y = w.y, m = w.m, ax = w.ax, ay = w.ay, rc = w.rc;
    const eps2 = w.P.softening * w.P.softening;
    const pi = this.pi, pj = this.pj;
    let near = 0;
    for (let q = 0; q < this.np; q++) {
      const i = pi[q], j = pj[q];
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const r2 = dx * dx + dy * dy;
      const rcp = rc[i] > rc[j] ? rc[i] : rc[j];
      if (r2 >= rcp * rcp) continue;
      near++;
      const r = Math.sqrt(r2);
      changeover(r, rcp);
      const s2 = r2 + eps2, invs = 1 / Math.sqrt(s2);
      const f = invs * invs * invs;              // F_ij / (m_i m_j) along d
      const phi = -invs;                          // Φ / (m_i m_j)
      // near part of the force on i (per m_i m_j): (1 − K) f d − Φ K′ d / r
      const g = (1 - CHG.K) * f - (r > 0 ? phi * CHG.dK / r : 0);
      ax[i] -= m[j] * g * dx; ay[i] -= m[j] * g * dy;
      ax[j] += m[i] * g * dx; ay[j] += m[i] * g * dy;
    }
    this.stats.near = near;
  }

  // ─── the drift: Kepler for everyone, then encounter groups re-integrated ─────────────────
  drift(dt) {
    const w = this.w, n = w.n;
    this.ensure(n);
    const x = w.x, y = w.y, vx = w.vx, vy = w.vy;
    const x1 = this.x1, y1 = this.y1, vx1 = this.vx1, vy1 = this.vy1;
    for (let i = 0; i < n; i++) {
      keplerDrift(x[i], y[i], vx[i], vy[i], dt);
      x1[i] = KEP.x; y1[i] = KEP.y; vx1[i] = KEP.vx; vy1[i] = KEP.vy;
    }

    // encounter prediction: cubic Hermite of the relative motion between the two Kepler ends
    const parent = this.parent;
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const rc = w.rc, pi = this.pi, pj = this.pj;
    let any = false;
    for (let q = 0; q < this.np; q++) {
      const i = pi[q], j = pj[q];
      if (i >= n || j >= n) continue;
      const rcp = rc[i] > rc[j] ? rc[i] : rc[j], rc2 = rcp * rcp;
      const d0x = x[j] - x[i], d0y = y[j] - y[i], d1x = x1[j] - x1[i], d1y = y1[j] - y1[i];
      const u0x = (vx[j] - vx[i]) * dt, u0y = (vy[j] - vy[i]) * dt;
      const u1x = (vx1[j] - vx1[i]) * dt, u1y = (vy1[j] - vy1[i]) * dt;
      let hit = d0x * d0x + d0y * d0y < rc2 || d1x * d1x + d1y * d1y < rc2;
      for (let k = 1; k < 8 && !hit; k++) {
        const t = k / 8, t2 = t * t, t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        const dx = h00 * d0x + h10 * u0x + h01 * d1x + h11 * u1x;
        const dy = h00 * d0y + h10 * u0y + h01 * d1y + h11 * u1y;
        if (dx * dx + dy * dy < rc2) hit = true;
      }
      if (hit) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; any = true; }
    }

    // a body is in an encounter group if its component has more than one member
    const inGroup = this.inGroup, csize = this.grpStart;
    let nIn = 0;
    inGroup.fill(0, 0, n);
    if (any) {
      csize.fill(0, 0, n);
      for (let i = 0; i < n; i++) csize[find(i)]++;
      for (let i = 0; i < n; i++) if (csize[find(i)] > 1) inGroup[i] = 1;
    }
    // bodies not in an encounter take their Kepler state; star grazing checked via pericentre
    const rs = w.P.rStar;
    for (let i = 0; i < n; i++) {
      if (inGroup[i]) { nIn++; continue; }
      const eta0 = x[i] * vx[i] + y[i] * vy[i], eta1 = x1[i] * vx1[i] + y1[i] * vy1[i];
      x[i] = x1[i]; y[i] = y1[i]; vx[i] = vx1[i]; vy[i] = vy1[i];
      if (eta0 < 0 && eta1 >= 0) {
        // passed pericentre this step: q = h² / (1 + e)
        const h = x[i] * vy[i] - y[i] * vx[i], E = 0.5 * (vx[i] * vx[i] + vy[i] * vy[i]) - 1 / Math.sqrt(x[i] * x[i] + y[i] * y[i]);
        const e = Math.sqrt(Math.max(0, 1 + 2 * E * h * h));
        if (h * h / (1 + e) < rs) w.removeBody(i, 'accrete');
      }
    }
    this.stats.inGroups = nIn;
    this.stats.groups = 0; this.stats.substeps = 0; this.stats.contacts = 0; this.stats.maxGroup = 0;
    if (!nIn) return;

    // gather the groups (counting sort by root) and integrate each over the drift
    const member = this.member, off = this.grpOff, cnt = csize;
    let o = 0;
    for (let i = 0; i < n; i++) { off[i] = o; if (find(i) === i && cnt[i] > 1) o += cnt[i]; }
    const fillc = this.grpFill;
    fillc.fill(0, 0, n);
    for (let i = 0; i < n; i++) if (inGroup[i]) { const r = find(i); member[off[r] + fillc[r]++] = i; }
    for (let r = 0; r < n; r++) {
      if (find(r) !== r || cnt[r] < 2) continue;
      this.integrateGroup(member, off[r], cnt[r], dt);
      this.stats.groups++;
      if (cnt[r] > this.stats.maxGroup) this.stats.maxGroup = cnt[r];
    }
    const T = this.total;
    T.groups += this.stats.groups; T.bodySteps += nIn; T.substeps += this.stats.substeps;
    T.contacts += this.stats.contacts; if (this.stats.maxGroup > T.maxGroup) T.maxGroup = this.stats.maxGroup;
  }

  // work arrays for a group of up to g bodies (grown on demand, never per step)
  groupWork(g) {
    if (this.gCap >= g) return;
    const c = Math.max(8, g * 2), L = 4 * c;
    this.gCap = c;
    this.gIdx = new Int32Array(c); this.gM = new Float64Array(c); this.gR = new Float64Array(c); this.gRC = new Float64Array(c);
    this.gY = new Float64Array(L); this.gYt = new Float64Array(L); this.gYn = new Float64Array(L);
    this.gK = []; for (let s = 0; s < 7; s++) this.gK.push(new Float64Array(L));
  }

  // derivative of the group state: star + near-part pair forces
  groupDeriv(S, D, g, eps2) {
    const M = this.gM, RC = this.gRC;
    for (let a = 0; a < g; a++) {
      const a4 = 4 * a, px = S[a4], py = S[a4 + 1];
      const r2 = px * px + py * py, ir = 1 / Math.sqrt(r2), f = ir * ir * ir;
      D[a4] = S[a4 + 2]; D[a4 + 1] = S[a4 + 3];
      D[a4 + 2] = -f * px; D[a4 + 3] = -f * py;
    }
    for (let a = 0; a < g; a++) {
      const a4 = 4 * a;
      for (let b = a + 1; b < g; b++) {
        const b4 = 4 * b;
        const dx = S[b4] - S[a4], dy = S[b4 + 1] - S[a4 + 1];
        const r2 = dx * dx + dy * dy, rcp = RC[a] > RC[b] ? RC[a] : RC[b];
        if (r2 >= rcp * rcp) continue;
        const r = Math.sqrt(r2);
        changeover(r, rcp);
        const invs = 1 / Math.sqrt(r2 + eps2), f = invs * invs * invs;
        const gg = (1 - CHG.K) * f + (r > 0 ? invs * CHG.dK / r : 0);   // −Φ/(m m) = +invs
        D[a4 + 2] += M[b] * gg * dx; D[a4 + 3] += M[b] * gg * dy;
        D[b4 + 2] -= M[a] * gg * dx; D[b4 + 3] -= M[a] * gg * dy;
      }
    }
  }

  // Adaptive DP5(4) on star + near-part pair forces for one encounter group, over [0, dt].
  // Members are members[o .. o+g). Contacts merge and star-grazers are removed at the end of
  // the substep where they happen; the survivors carry on to the end of the drift.
  integrateGroup(members, o, g, dt) {
    const w = this.w, eps2 = w.P.softening * w.P.softening, rs2 = w.P.rStar * w.P.rStar;
    const collide = w.P.collisions;   // with collisions off, bodies pass through each other
    this.groupWork(g);
    const idx = this.gIdx, M = this.gM, R = this.gR, RC = this.gRC;
    let Y = this.gY, Yt = this.gYt, Yn = this.gYn;
    const Kst = this.gK;
    for (let a = 0; a < g; a++) idx[a] = members[o + a];
    const load = () => {
      for (let a = 0; a < g; a++) {
        const i = idx[a], a4 = 4 * a;
        Y[a4] = w.x[i]; Y[a4 + 1] = w.y[i]; Y[a4 + 2] = w.vx[i]; Y[a4 + 3] = w.vy[i];
        M[a] = w.m[i]; R[a] = w.r[i]; RC[a] = w.rc[i];
      }
    };
    const store = () => {
      for (let a = 0; a < g; a++) {
        const i = idx[a], a4 = 4 * a;
        w.x[i] = Y[a4]; w.y[i] = Y[a4 + 1]; w.vx[i] = Y[a4 + 2]; w.vy[i] = Y[a4 + 3];
      }
    };
    const drop = (a) => { for (let b = a; b < g - 1; b++) idx[b] = idx[b + 1]; g--; };
    load();
    let t = 0, h = this.lastH > 0 && this.lastH < dt ? this.lastH : dt / 4;
    let guard = 0;
    const bq = DP.b, eq = DP.e, A = DP.a;
    while (t < dt * (1 - 1e-14) && guard++ < 200000) {
      if (t + h > dt) h = dt - t;
      const L = 4 * g;
      this.groupDeriv(Y, Kst[0], g, eps2);
      for (let s = 1; s < 7; s++) {
        const as = A[s];
        for (let k = 0; k < L; k++) {
          let acc = Y[k];
          for (let q = 0; q < s; q++) acc += h * as[q] * Kst[q][k];
          Yt[k] = acc;
        }
        this.groupDeriv(Yt, Kst[s], g, eps2);
      }
      let err = 0;
      for (let k = 0; k < L; k++) {
        let y5 = Y[k], e = 0;
        for (let q = 0; q < 7; q++) { const kk = Kst[q][k]; y5 += h * bq[q] * kk; e += h * eq[q] * kk; }
        Yn[k] = y5;
        const z = e / (this.rtol * (1 + Math.max(Math.abs(Y[k]), Math.abs(y5))));
        err += z * z;
      }
      err = Math.sqrt(err / L);
      this.stats.substeps++;
      if (err > 1) { h *= Math.max(0.2, 0.9 * Math.pow(err, -0.2)); continue; }
      t += h;
      const hUsed = h;
      const tmp = Y; Y = Yn; Yn = tmp;   // Y = substep end, Yn = substep start
      this.lastH = h;
      h *= Math.min(5, 0.9 * Math.pow(Math.max(err, 1e-10), -0.2));

      // star grazing and contact, at the substep end
      let changed = false;
      for (let a = 0; a < g && !changed; a++) {
        const px = Y[4 * a], py = Y[4 * a + 1];
        if (px * px + py * py < rs2) { store(); w.removeBody(idx[a], 'accrete'); drop(a); changed = true; }
      }
      for (let a = 0; a < g && !changed && collide; a++) {
        for (let b = a + 1; b < g; b++) {
          const rr = R[a] + R[b];
          if (!sweptContact(Yn, Y, a, b, hUsed, rr * rr)) continue;
          {
            store();
            const ia = idx[a], ib = idx[b];
            const keep = w.merge(ia, ib);
            w.rc[keep] = Math.max(RC[a], RC[b], this.rcOf(keep));
            drop(keep === ia ? b : a);
            this.stats.contacts++;
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        // keep the work arrays the class owns (Y may be the swapped buffer)
        this.gY = Y; this.gYn = Yn;
        if (g === 0) return;
        load();
        if (g === 1) {
          // a lone survivor finishes the drift on its Kepler orbit
          const i = idx[0];
          keplerDrift(w.x[i], w.y[i], w.vx[i], w.vy[i], dt - t);
          w.x[i] = KEP.x; w.y[i] = KEP.y; w.vx[i] = KEP.vx; w.vy[i] = KEP.vy;
          return;
        }
      }
    }
    store();
    this.gY = Y; this.gYn = Yn;
  }
};
