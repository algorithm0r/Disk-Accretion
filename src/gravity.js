'use strict';
// Body-body gravity: the exact O(N²) reference and the Barnes-Hut quadtree. Both write the
// softened particle-particle acceleration into ax/ay (overwriting); the star term is added
// by the World. G = 1. Plummer softening: a_i = Σ m_j d / (d² + ε²)^{3/2}.
//
// Everything is flat typed arrays (no node objects), reused across steps, so a step
// allocates nothing once the arrays have grown to fit.

// ─── brute force (the accuracy reference) ──────────────────────────────────────────
// Symmetric pair loop, N(N-1)/2 interactions. Because every pair force is equal and
// opposite and central, it conserves momentum and L_z to round-off, which is what the
// smoketest leans on.
function bruteForceAccel(x, y, m, n, eps2, ax, ay) {
  for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i], mi = m[i];
    let axi = ax[i], ayi = ay[i];
    for (let j = i + 1; j < n; j++) {
      const dx = x[j] - xi, dy = y[j] - yi;
      const d2 = dx * dx + dy * dy + eps2;
      const inv = 1 / Math.sqrt(d2);
      const inv3 = inv * inv * inv;
      const fj = m[j] * inv3, fi = mi * inv3;
      axi += fj * dx; ayi += fj * dy;
      ax[j] -= fi * dx; ay[j] -= fi * dy;
    }
    ax[i] = axi; ay[i] = ayi;
  }
}

// ─── Barnes-Hut quadtree ──────────────────────────────────────────────────────────
// Node k is a square (cx, cy, half). Internal nodes own four children stored contiguously
// at child[k] .. child[k]+3 (quadrant q = east bit | north bit << 1); leaves hold a linked
// list of up to LEAF_CAP bodies (head[k] → next[b] → ...). Children are always allocated
// after their parent, so one reverse sweep over the node array computes the moments.
//
// Opening rule: a node is used as a point mass when d > s/θ + δ, where s is the node width,
// d the distance to its centre of mass and δ the offset of the centre of mass from the
// geometric centre (the Barnes 1994 / Salmon-Warren guard against lopsided cells). The
// squared threshold is precomputed per node as crit2, so the walk does one compare per node.
var BH_LEAF_CAP = 8;

var BarnesHut = class BarnesHut {
  constructor(nBodies) {
    this.next = new Int32Array(Math.max(1, nBodies));
    this.stack = new Int32Array(4096);
    this.gstack = new Int32Array(4096);   // the grouped walk's outer (group-finding) stack
    this.cap = 0;
    this.nNodes = 0;
    this.alloc(Math.max(64, nBodies));
  }

  alloc(cap) {
    const old = this.cap ? this : null;
    const I = (a) => { const b = new Int32Array(cap); if (old) b.set(a.subarray(0, Math.min(a.length, cap))); return b; };
    const F = (a) => { const b = new Float64Array(cap); if (old) b.set(a.subarray(0, Math.min(a.length, cap))); return b; };
    this.child = I(this.child); this.head = I(this.head); this.count = I(this.count);
    this.cx = F(this.cx); this.cy = F(this.cy); this.half = F(this.half);
    this.mass = F(this.mass); this.mx = F(this.mx); this.my = F(this.my); this.crit2 = F(this.crit2);
    this.qxx = F(this.qxx); this.qxy = F(this.qxy); this.qyy = F(this.qyy);
    this.cap = cap;
  }

  build(x, y, m, n, theta) {
    if (this.next.length < n) this.next = new Int32Array(n);
    const next = this.next;

    // root square around all bodies
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      if (xi < minx) minx = xi; if (xi > maxx) maxx = xi;
      if (yi < miny) miny = yi; if (yi > maxy) maxy = yi;
    }
    const half0 = 0.5 * Math.max(maxx - minx, maxy - miny, 1e-12) * 1.0001;
    const minHalf = half0 * 1e-12;   // depth guard (~40 levels): coincident bodies share a leaf

    let child = this.child, head = this.head, count = this.count;
    let cx = this.cx, cy = this.cy, half = this.half;
    child[0] = -1; head[0] = -1; count[0] = 0;
    cx[0] = 0.5 * (minx + maxx); cy[0] = 0.5 * (miny + maxy); half[0] = half0;
    let nNodes = 1;

    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      let node = 0;
      for (;;) {
        const c = child[node];
        if (c >= 0) {
          node = c + (xi >= cx[node] ? 1 : 0) + (yi >= cy[node] ? 2 : 0);
          continue;
        }
        if (count[node] < BH_LEAF_CAP || half[node] < minHalf) {
          next[i] = head[node]; head[node] = i; count[node]++;
          break;
        }
        // split a full leaf into four children, then keep descending
        if (nNodes + 4 > this.cap) {
          this.alloc(this.cap * 2);
          child = this.child; head = this.head; count = this.count;
          cx = this.cx; cy = this.cy; half = this.half;
        }
        const first = nNodes; nNodes += 4;
        const hh = 0.5 * half[node], ncx = cx[node], ncy = cy[node];
        for (let q = 0; q < 4; q++) {
          const k = first + q;
          child[k] = -1; head[k] = -1; count[k] = 0; half[k] = hh;
          cx[k] = ncx + ((q & 1) ? hh : -hh);
          cy[k] = ncy + ((q & 2) ? hh : -hh);
        }
        let b = head[node];
        while (b >= 0) {
          const nb = next[b];
          const k = first + (x[b] >= ncx ? 1 : 0) + (y[b] >= ncy ? 2 : 0);
          next[b] = head[k]; head[k] = b; count[k]++;
          b = nb;
        }
        head[node] = -1; count[node] = 0; child[node] = first;
      }
    }
    this.nNodes = nNodes;
    this.sortBodies(x, y, m, n);

    // moments, leaves-up (children always have larger indices than their parent)
    const mass = this.mass, mx = this.mx, my = this.my, crit2 = this.crit2;
    const qxx = this.qxx, qxy = this.qxy, qyy = this.qyy;
    const invTheta = theta > 0 ? 1 / theta : Infinity;
    for (let k = nNodes - 1; k >= 0; k--) {
      let M = 0, MX = 0, MY = 0;
      const c = child[k];
      if (c < 0) {
        for (let b = head[k]; b >= 0; b = next[b]) { const mb = m[b]; M += mb; MX += mb * x[b]; MY += mb * y[b]; }
      } else {
        for (let q = c; q < c + 4; q++) { const mq = mass[q]; M += mq; MX += mq * mx[q]; MY += mq * my[q]; }
      }
      mass[k] = M;
      if (M > 0) {
        const gx = MX / M, gy = MY / M;
        mx[k] = gx; my[k] = gy;
        // planar quadrupole about the centre of mass, Q_ij = Σ m (3 d_i d_j − |d|² δ_ij);
        // a child's Q moves up by the parallel-axis term for its offset D
        let Qxx = 0, Qxy = 0, Qyy = 0;
        if (c < 0) {
          for (let b = head[k]; b >= 0; b = next[b]) {
            const dx = x[b] - gx, dy = y[b] - gy, mb = m[b], d2 = dx * dx + dy * dy;
            Qxx += mb * (3 * dx * dx - d2); Qxy += mb * 3 * dx * dy; Qyy += mb * (3 * dy * dy - d2);
          }
        } else {
          for (let q = c; q < c + 4; q++) {
            const mq = mass[q];
            if (mq === 0) continue;
            const dx = mx[q] - gx, dy = my[q] - gy, d2 = dx * dx + dy * dy;
            Qxx += qxx[q] + mq * (3 * dx * dx - d2);
            Qxy += qxy[q] + mq * 3 * dx * dy;
            Qyy += qyy[q] + mq * (3 * dy * dy - d2);
          }
        }
        qxx[k] = Qxx; qxy[k] = Qxy; qyy[k] = Qyy;
        const ox = gx - cx[k], oy = gy - cy[k];
        const crit = 2 * half[k] * invTheta + Math.sqrt(ox * ox + oy * oy);
        crit2[k] = crit * crit;
      } else {
        mx[k] = cx[k]; my[k] = cy[k]; crit2[k] = 0;
        qxx[k] = 0; qxy[k] = 0; qyy[k] = 0;
      }
    }
  }

  // Depth-first order of the bodies: every node's bodies become one contiguous run
  // order[start[k] .. start[k] + nb[k]), and sx/sy/sm hold copies in that order. That is
  // what the grouped walk below iterates over, and it keeps neighbours adjacent in memory.
  sortBodies(x, y, m, n) {
    if (!this.order || this.order.length < n) {
      const c = Math.max(n, 16);
      this.order = new Int32Array(c);
      this.sx = new Float64Array(c); this.sy = new Float64Array(c); this.sm = new Float64Array(c);
    }
    if (!this.start || this.start.length < this.cap) {
      this.start = new Int32Array(this.cap); this.nb = new Int32Array(this.cap);
    }
    const child = this.child, head = this.head, next = this.next, start = this.start, nb = this.nb;
    const order = this.order, sx = this.sx, sy = this.sy, sm = this.sm;
    let stack = this.stack, sp = 0, w = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const k = stack[--sp];
      start[k] = w;
      const c = child[k];
      if (c < 0) {
        for (let b = head[k]; b >= 0; b = next[b]) {
          order[w] = b; sx[w] = x[b]; sy[w] = y[b]; sm[w] = m[b]; w++;
        }
      } else {
        // push in reverse so child c is visited first; its subtree finishes before c+1 starts
        stack[sp++] = c + 3; stack[sp++] = c + 2; stack[sp++] = c + 1; stack[sp++] = c;
      }
    }
    // subtree counts, leaves-up
    for (let k = this.nNodes - 1; k >= 0; k--) {
      const c = child[k];
      nb[k] = (c < 0) ? this.count[k] : nb[c] + nb[c + 1] + nb[c + 2] + nb[c + 3];
    }
  }

  // Grouped walk (Barnes 1990): bodies are taken in groups — the smallest subtrees holding
  // ≤ groupSize bodies — and the tree is walked ONCE per group, against the group's bounding
  // box: a node is accepted only if it passes the opening test from the nearest point of the
  // box, so every body in the group would also have accepted it. Accepted nodes go into a node
  // list (monopole + quadrupole) and opened leaves' bodies into a body list; each body in the
  // group then sums both lists in tight loops. The self-term needs no skip: d = 0 contributes
  // exactly zero force when ε > 0. Returns the number of interactions.
  //
  // The inner loops are bound by sqrt/div throughput (both run on the same divider unit;
  // unrolling over bodies measured no gain), so the quadrupole is nearly free — it adds only
  // multiplies — and it is what lets θ rise for the same accuracy. For a node at offset
  // X = (field point − centre of mass), with r² = |X|² + ε²:
  //   a = −M X / r³ + (Q·X) / r⁵ − (5/2) (Xᵀ Q X) X / r⁷
  accelGrouped(x, y, m, n, eps2, ax, ay, groupSize) {
    if (eps2 <= 0) eps2 = 1e-300;
    const child = this.child, start = this.start, nb = this.nb;
    const mass = this.mass, mx = this.mx, my = this.my, crit2 = this.crit2;
    const qxx = this.qxx, qxy = this.qxy, qyy = this.qyy;
    const order = this.order, sx = this.sx, sy = this.sy, sm = this.sm;
    if (!this.nlx) this.growLists(4096, 4096);
    const gstack = this.gstack, stack = this.stack;
    let inter = 0, gsp = 0;
    gstack[gsp++] = 0;
    while (gsp > 0) {
      const g = gstack[--gsp];
      if (nb[g] === 0) continue;
      const cg = child[g];
      if (cg >= 0 && nb[g] > groupSize) {
        gstack[gsp++] = cg; gstack[gsp++] = cg + 1; gstack[gsp++] = cg + 2; gstack[gsp++] = cg + 3;
        continue;
      }
      // group g: bodies s0 .. s1-1 in sorted order; bounding box of the actual bodies
      const s0 = start[g], s1 = s0 + nb[g];
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let s = s0; s < s1; s++) {
        const xs = sx[s], ys = sy[s];
        if (xs < bx0) bx0 = xs; if (xs > bx1) bx1 = xs;
        if (ys < by0) by0 = ys; if (ys > by1) by1 = ys;
      }
      // build the two interaction lists
      let nn = 0, nbl = 0, sp = 0;
      let nlx = this.nlx, nly = this.nly, nlm = this.nlm, nqa = this.nqa, nqb = this.nqb, nqc = this.nqc;
      let blx = this.blx, bly = this.bly, blm = this.blm;
      stack[sp++] = 0;
      while (sp > 0) {
        const k = stack[--sp];
        const gx = mx[k], gy = my[k];
        const dx = gx < bx0 ? bx0 - gx : (gx > bx1 ? gx - bx1 : 0);
        const dy = gy < by0 ? by0 - gy : (gy > by1 ? gy - by1 : 0);
        if (dx * dx + dy * dy > crit2[k]) {
          if (nn >= nlx.length) {
            this.growLists(nlx.length * 2, blx.length);
            nlx = this.nlx; nly = this.nly; nlm = this.nlm; nqa = this.nqa; nqb = this.nqb; nqc = this.nqc;
          }
          nlx[nn] = gx; nly[nn] = gy; nlm[nn] = mass[k];
          nqa[nn] = qxx[k]; nqb[nn] = qxy[k]; nqc[nn] = qyy[k];
          nn++;
        } else {
          const c = child[k];
          if (c < 0) {
            const t0 = start[k], t1 = t0 + nb[k];
            if (nbl + nb[k] > blx.length) {
              this.growLists(nlx.length, Math.max(blx.length * 2, nbl + nb[k]));
              blx = this.blx; bly = this.bly; blm = this.blm;
            }
            for (let t = t0; t < t1; t++) { blx[nbl] = sx[t]; bly[nbl] = sy[t]; blm[nbl] = sm[t]; nbl++; }
          } else {
            if (nb[c] > 0) stack[sp++] = c;
            if (nb[c + 1] > 0) stack[sp++] = c + 1;
            if (nb[c + 2] > 0) stack[sp++] = c + 2;
            if (nb[c + 3] > 0) stack[sp++] = c + 3;
          }
        }
      }
      // every body in the group sums the same two lists
      for (let s = s0; s < s1; s++) {
        const xi = sx[s], yi = sy[s];
        let axi = 0, ayi = 0;
        for (let l = 0; l < nbl; l++) {
          const dx = blx[l] - xi, dy = bly[l] - yi;
          const r2 = dx * dx + dy * dy + eps2;
          const f = blm[l] / (r2 * Math.sqrt(r2));
          axi += f * dx; ayi += f * dy;
        }
        for (let l = 0; l < nn; l++) {
          const X = xi - nlx[l], Y = yi - nly[l];   // centre of mass → field point
          const r2 = X * X + Y * Y + eps2;
          const inv2 = 1 / r2;
          const inv3 = inv2 * Math.sqrt(inv2);
          const inv5 = inv3 * inv2;
          const qa = nqa[l], qb = nqb[l], qc = nqc[l];
          const QX = qa * X + qb * Y, QY = qb * X + qc * Y;
          const f = -nlm[l] * inv3 - 2.5 * (X * QX + Y * QY) * inv5 * inv2;
          axi += f * X + QX * inv5; ayi += f * Y + QY * inv5;
        }
        const b = order[s];
        ax[b] = axi; ay[b] = ayi;
      }
      inter += (nn + nbl) * (s1 - s0);
    }
    return inter;
  }

  growLists(nNode, nBody) {
    const g = (a, L) => { const b = new Float64Array(L); if (a) b.set(a.subarray(0, Math.min(a.length, L))); return b; };
    this.nlx = g(this.nlx, nNode); this.nly = g(this.nly, nNode); this.nlm = g(this.nlm, nNode);
    this.nqa = g(this.nqa, nNode); this.nqb = g(this.nqb, nNode); this.nqc = g(this.nqc, nNode);
    this.blx = g(this.blx, nBody); this.bly = g(this.bly, nBody); this.blm = g(this.blm, nBody);
  }

  // Walk the tree once per body (the plain Barnes-Hut walk; kept as the simple reference
  // for the grouped walk). Returns the number of interactions.
  accel(x, y, m, n, eps2, ax, ay) {
    const child = this.child, head = this.head, next = this.next;
    const mass = this.mass, mx = this.mx, my = this.my, crit2 = this.crit2;
    const stack = this.stack;
    let inter = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i], yi = y[i];
      let axi = 0, ayi = 0;
      let sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const k = stack[--sp];
        const dx = mx[k] - xi, dy = my[k] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > crit2[k]) {
          // far enough: the whole node acts as a point mass
          const r2 = d2 + eps2;
          const inv = 1 / Math.sqrt(r2);
          const f = mass[k] * inv * inv * inv;
          axi += f * dx; ayi += f * dy;
          inter++;
        } else {
          const c = child[k];
          if (c < 0) {
            for (let b = head[k]; b >= 0; b = next[b]) {
              if (b === i) continue;
              const ex = x[b] - xi, ey = y[b] - yi;
              const r2 = ex * ex + ey * ey + eps2;
              const inv = 1 / Math.sqrt(r2);
              const f = m[b] * inv * inv * inv;
              axi += f * ex; ayi += f * ey;
              inter++;
            }
          } else {
            if (mass[c] > 0) stack[sp++] = c;
            if (mass[c + 1] > 0) stack[sp++] = c + 1;
            if (mass[c + 2] > 0) stack[sp++] = c + 2;
            if (mass[c + 3] > 0) stack[sp++] = c + 3;
          }
        }
      }
      ax[i] = axi; ay[i] = ayi;
    }
    return inter;
  }
};
