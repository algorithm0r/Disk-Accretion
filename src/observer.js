'use strict';
// The view. Reads world state and draws it; never mutates the model. Keeping all rendering
// here (instead of agents drawing themselves) is what makes the world headless-safe.
var Observer = class Observer {
  constructor(world) { this.world = world; }

  update() {}

  draw(ctx) {
    ctx.fillStyle = '#7fd1ff';
    for (const a of this.world.agents) ctx.fillRect(a.x - 1, a.y - 1, 2, 2);
  }
};
