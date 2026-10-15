'use strict';
// The view. Reads world state and draws it; never mutates the model. Keeping all rendering
// here (instead of bodies drawing themselves) is what keeps the world headless-safe.
//
// Small bodies are single pixels written straight into an ImageData buffer (tens of
// thousands of them cost ~1 ms); bodies grown past a few initial masses are drawn as
// circles on top, coloured by mass, and the heaviest few get a faint Hill-radius ring so
// their feeding zones show. Pan/zoom state lives in `view` (ui.js wires the mouse to it).
var Observer = class Observer {
  constructor(world) {
    this.world = world;
    this.view = { zoom: 1, cx: 0, cy: 0 };   // world point at the canvas centre
    this.showHill = true;
    this.hillCount = 12;                     // how many of the heaviest bodies get a ring
    this.img = null; this.buf = null;
    this.big = new Int32Array(1024);
    this.drawMs = 0;
    this.palette = Observer.buildPalette();
  }

  update() {}

  // 40 colours from cold dust (1 initial mass) to hot protoplanet (2^20 initial masses),
  // indexed by 2·log2(m / m0). Stored both as packed ABGR (pixels) and CSS (circles).
  static buildPalette() {
    const stops = [
      [0, [110, 150, 220]], [4, [150, 205, 255]], [8, [235, 240, 255]],
      [14, [255, 225, 120]], [22, [255, 150, 60]], [30, [255, 80, 50]], [39, [255, 40, 120]],
    ];
    const u32 = new Uint32Array(40), css = [];
    for (let i = 0; i < 40; i++) {
      let a = stops[0], b = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) if (i >= stops[s][0] && i <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
      const f = b[0] === a[0] ? 0 : (i - a[0]) / (b[0] - a[0]);
      const c = [0, 1, 2].map((k) => Math.round(a[1][k] + f * (b[1][k] - a[1][k])));
      u32[i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
      css.push('rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')');
    }
    return { u32: u32, css: css };
  }

  // px per world unit, so the disk's outer edge fits the shorter canvas side
  scale(W, H) {
    return this.view.zoom * 0.5 * Math.min(W, H) / (this.world.P.rOut * 1.15);
  }

  draw(ctx) {
    const t0 = nowMs();
    const w = this.world, P = w.P, n = w.n;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this.img || this.img.width !== W || this.img.height !== H) {
      this.img = ctx.createImageData(W, H);
      this.buf = new Uint32Array(this.img.data.buffer);
    }
    const buf = this.buf, pal = this.palette.u32;
    buf.fill(0xff130e0b);   // background #0b0e13 (ABGR)

    const sc = this.scale(W, H);
    const ox = W * 0.5 - this.view.cx * sc, oy = H * 0.5 + this.view.cy * sc;   // y up
    const x = w.x, y = w.y, m = w.m, r = w.r;
    const invM0 = 1 / w.m0;
    if (this.big.length < n) this.big = new Int32Array(n);
    const big = this.big;
    let nBig = 0;
    for (let i = 0; i < n; i++) {
      const k = m[i] * invM0;
      if (k >= 4 || r[i] * sc >= 1) { big[nBig++] = i; continue; }
      const px = (ox + x[i] * sc) | 0, py = (oy - y[i] * sc) | 0;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      buf[py * W + px] = pal[k < 1.5 ? 0 : (k < 2.5 ? 2 : 3)];
    }
    ctx.putImageData(this.img, 0, 0);

    // the star
    const sx = ox, sy = oy;
    const rs = Math.max(4, P.rStar * sc * 0.6);
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rs * 3);
    glow.addColorStop(0, 'rgba(255,240,190,0.9)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, sy, rs * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath(); ctx.arc(sx, sy, rs, 0, TAU); ctx.fill();

    // big bodies, lightest first so the heaviest end up on top
    const list = Array.from(big.subarray(0, nBig)).sort((a, b) => m[a] - m[b]);
    const css = this.palette.css;
    for (const i of list) {
      const k = m[i] * invM0;
      const ci = Math.min(39, Math.max(0, Math.round(2 * Math.log2(k))));
      // drawn at the larger of the physical (inflated) radius and a mass-based floor
      const rad = Math.max(r[i] * sc, 0.6 * Math.cbrt(k));
      const px = ox + x[i] * sc, py = oy - y[i] * sc;
      if (px < -rad || py < -rad || px > W + rad || py > H + rad) continue;
      ctx.fillStyle = css[ci];
      ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.fill();
    }
    // Hill radius r_H = a (m / 3 M_star)^(1/3): the zone a protoplanet clears
    if (this.showHill) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let q = list.length - 1; q >= Math.max(0, list.length - this.hillCount); q--) {
        const i = list[q];
        if (m[i] * invM0 < 30) break;
        const a = Math.hypot(x[i], y[i]);
        const rh = a * Math.cbrt(m[i] / 3) * sc;
        ctx.beginPath(); ctx.arc(ox + x[i] * sc, oy - y[i] * sc, rh, 0, TAU); ctx.stroke();
      }
    }
    this.drawMs += 0.1 * ((nowMs() - t0) - this.drawMs);
  }
};
