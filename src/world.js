'use strict';
// Domain stub: the world holds all state and advances it. It is an engine entity (has
// update) but draws nothing — rendering is the Observer's job (model/view separation),
// which is exactly what lets the same world run headlessly with no canvas.
var World = class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.agents = [];
    for (let i = 0; i < PARAMETERS.nAgents; i++) {
      this.agents.push(new Agent(width / 2, height / 2));
    }
  }

  update(engine) {
    for (const a of this.agents) a.step(this);
  }

  // the metric of interest — mean x, normalised to 0..1
  meanX() {
    let s = 0;
    for (const a of this.agents) s += a.x;
    return s / this.agents.length / this.width;
  }
};
