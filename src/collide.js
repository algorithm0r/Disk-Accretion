'use strict';
// Collision search: a spatial hash rebuilt every step, run right after the drift.
//
// Cell size h ≥ 2·r_max + (how far a pair can close in one step), so any two touching bodies
// sit in the same or adjacent cells and a 3×3 neighbourhood scan finds them. The disk is
// sparse (≪ 1 body per cell), so this stays O(N) even when one big body sets r_max.
//
// Contact test: overlap now, OR overlap at the pair's closest approach during the step just
// drifted. The drift is a straight line at the half-kicked velocity, so the backwards
// trajectory d(-t) = d − u·t is exact for t ∈ [0, dt]; that catches fast pairs that would
// otherwise tunnel through each other between two snapshots.
var CollisionGrid = class CollisionGrid {
  constructor(nBodies) { this.resize(nBodies); }

  resize(n) {
    let size = 1024;
    while (size < 2 * n) size <<= 1;
    this.size = size; this.mask = size - 1;
    this.start = new Int32Array(size + 1);
    this.key = new Int32Array(Math.max(1, n));
    this.cellX = new Int32Array(Math.max(1, n));
    this.cellY = new Int32Array(Math.max(1, n));
    this.sorted = new Int32Array(Math.max(1, n));
    this.n = n;
  }

  // Finds touching pairs and hands each to world.merge(i, j). Returns the merge count.
  collide(world, dt) {
    const n = world.n;
    if (n < 2) return 0;
    if (n > this.n) this.resize(n);
    const x = world.x, y = world.y, vx = world.vx, vy = world.vy, r = world.r, dead = world.dead;

    // cell size: largest radius plus the biggest non-circular drift in a step
    let rMax = 0, uMax2 = 0;
    for (let i = 0; i < n; i++) {
      if (r[i] > rMax) rMax = r[i];
      const xi = x[i], yi = y[i];
      const rr = Math.sqrt(xi * xi + yi * yi);
      const vk = 1 / Math.sqrt(rr * rr * rr);   // circular speed / r  (= Ω)
      const ux = vx[i] + yi * vk, uy = vy[i] - xi * vk;
      const u2 = ux * ux + uy * uy;
      if (u2 > uMax2) uMax2 = u2;
    }
    // cap the drift term so one wild outlier can't blow the cells up to the whole disk
    const pad = Math.min(2 * Math.sqrt(uMax2) * dt, 4 * rMax);
    const h = 2 * rMax + pad;
    const inv = 1 / h;

    // counting sort of bodies into hash buckets
    const mask = this.mask, start = this.start, key = this.key, cellX = this.cellX, cellY = this.cellY, sorted = this.sorted;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(x[i] * inv), gy = Math.floor(y[i] * inv);
      cellX[i] = gx; cellY[i] = gy;
      const k = (Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) & mask;
      key[i] = k;
      start[k + 1]++;
    }
    for (let k = 0; k < this.size; k++) start[k + 1] += start[k];
    // fill using a cursor per bucket (reuse key order: write position = start[k] + running)
    const cursor = this._cursor && this._cursor.length === this.size ? this._cursor : (this._cursor = new Int32Array(this.size));
    cursor.set(start.subarray(0, this.size));
    for (let i = 0; i < n; i++) sorted[cursor[key[i]]++] = i;

    // Each body scans its own cell (pairs with j > i) plus the 4 "forward" neighbours (any j):
    // every adjacent cell pair is then covered from exactly one side, 5 lookups instead of 9.
    // A hash collision can only add candidates (re-tested harmlessly), never hide one.
    const OX = CollisionGrid.OX, OY = CollisionGrid.OY;
    let merges = 0;
    const dt2 = dt;
    outer:
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const gx = cellX[i], gy = cellY[i];
      for (let c = 0; c < 5; c++) {
        {
          const k = (Math.imul(gx + OX[c], 73856093) ^ Math.imul(gy + OY[c], 19349663)) & mask;
          const own = c === 0;
          const s1 = start[k + 1];
          for (let s = start[k]; s < s1; s++) {
            const j = sorted[s];
            if (j === i || (own && j < i) || dead[j]) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const rs = r[i] + r[j];
            const d2 = dx * dx + dy * dy;
            let hit = d2 < rs * rs;
            if (!hit) {
              // separating now? then they may have passed through contact during the step
              const ux = vx[j] - vx[i], uy = vy[j] - vy[i];
              const dot = dx * ux + dy * uy;
              if (dot > 0) {
                const u2 = ux * ux + uy * uy;
                let t = dot / u2;
                if (t > dt2) t = dt2;
                const cx = dx - ux * t, cy = dy - uy * t;
                hit = cx * cx + cy * cy < rs * rs;
              }
            }
            if (hit) {
              merges++;
              const keep = world.merge(i, j);
              if (keep !== i) continue outer;   // i was absorbed into j
            }
          }
        }
      }
    }
    return merges;
  }
};
// With only a few massive bodies among massless test particles (world.gravityMode 'direct'),
// contact can only involve a massive body, so test every body against the massive ones only
// (the same swept test as the grid) instead of hashing thousands of particles each step.
CollisionGrid.prototype.collideMassive = function (world, dt, idx, nm) {
  const n = world.n, x = world.x, y = world.y, vx = world.vx, vy = world.vy, r = world.r, dead = world.dead, m = world.m;
  let merges = 0;
  for (let q = 0; q < nm; q++) {
    const j = idx[q];
    if (j >= n || dead[j] || !(m[j] > 0)) continue;
    for (let i = 0; i < n; i++) {
      if (i === j || dead[i] || dead[j]) continue;
      if (m[i] > 0 && i < j) continue;               // massive pairs once
      const dx = x[j] - x[i], dy = y[j] - y[i], rs = r[i] + r[j];
      const d2 = dx * dx + dy * dy;
      let hit = d2 < rs * rs;
      if (!hit && d2 < (rs + 0.05) * (rs + 0.05)) {
        const ux = vx[j] - vx[i], uy = vy[j] - vy[i], dot = dx * ux + dy * uy;
        if (dot > 0) {
          let t = dot / (ux * ux + uy * uy);
          if (t > dt) t = dt;
          const cx = dx - ux * t, cy = dy - uy * t;
          hit = cx * cx + cy * cy < rs * rs;
        }
      }
      if (hit) { merges++; world.merge(i, j); }
    }
  }
  return merges;
};

// cell offsets scanned per body: own cell first, then the forward half of the 3×3 ring
CollisionGrid.OX = [0, 1, -1, 0, 1];
CollisionGrid.OY = [0, 0, 1, 1, 1];
