'use strict';
// Minimal in-canvas line graph (an entity). Browser-only in practice — headless runs
// record the same data into packets without drawing. Replace/extend as needed.
var LineGraph = class LineGraph {
  constructor(x, y, w, h, label) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.label = label;
    this.data = []; this.min = Infinity; this.max = -Infinity;
  }

  push(v) {
    // halve the history when it gets long, so a run left open for hours stays cheap to draw
    if (this.data.length >= 600) this.data = this.data.filter((_, i) => i % 2 === 0);
    this.data.push(v);
    if (v > this.max) this.max = v;
    if (v < this.min) this.min = v;
  }

  format(v) { return v.toFixed(2); }

  update() {}

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(11,14,19,0.75)'; ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = '#333'; ctx.strokeRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#8a8f98'; ctx.font = '11px sans-serif';
    ctx.fillText(this.label, this.x + 4, this.y + 12);
    if (this.data.length) ctx.fillText(this.format(this.data[this.data.length - 1]), this.x + this.w - 50, this.y + 12);
    if (this.data.length > 1) {
      const range = (this.max - this.min) || 1;
      ctx.strokeStyle = '#7fd1ff'; ctx.beginPath();
      for (let i = 0; i < this.data.length; i++) {
        const px = this.x + (i / (this.data.length - 1)) * this.w;
        const py = this.y + this.h - ((this.data[i] - this.min) / range) * this.h;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
};
