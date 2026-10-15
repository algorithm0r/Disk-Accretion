'use strict';
// Minimal in-canvas line graph (an entity). Browser-only in practice — headless runs
// record the same data into packets without drawing. Replace/extend as needed.
var LineGraph = class LineGraph {
  constructor(x, y, w, h, label) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.label = label;
    this.data = []; this.min = 0; this.max = 1;
  }

  push(v) {
    this.data.push(v);
    if (v > this.max) this.max = v;
    if (v < this.min) this.min = v;
  }

  update() {}

  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = '#333'; ctx.strokeRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#8a8f98'; ctx.font = '11px sans-serif';
    ctx.fillText(this.label, this.x + 4, this.y + 12);
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
