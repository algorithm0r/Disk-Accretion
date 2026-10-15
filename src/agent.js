'use strict';
// Domain stub: one agent. Replace this with your model's actor. Holds state only;
// it does NOT draw itself — the Observer renders the world (model/view separation).
var Agent = class Agent {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  // advance one tick within `world`
  step(world) {
    this.x = clamp(this.x + PARAMETERS.drift + normalSample(0, PARAMETERS.jitter), 0, world.width);
    this.y = clamp(this.y + normalSample(0, PARAMETERS.jitter), 0, world.height);
  }
};
