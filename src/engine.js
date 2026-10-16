'use strict';
// The GameEngine loop (engine v2, descended from the long-running "Bad Aliens" shell but
// cleaned: no dead AssetManager, no DOM, browser/headless split made explicit).
//
// An "entity" is anything with optional update(engine) and draw(ctx) methods, plus an
// optional `removeFromWorld` flag. The world, observer, datamanager and charts are all
// entities. Browser drives the loop via start(); headless drives update() in a plain loop.
//
// Declared `var Foo = class Foo` so the class is a global in the browser AND attaches to
// the headless main realm (a bare `class Foo {}` would be block-scoped and invisible there).
var GameEngine = class GameEngine {
  constructor() {
    this.entities = [];
    this.ctx = null;
    this.running = false;
    this.paused = false;
    this.tick = 0;
    // frame timing: fps over the last second, and the EMA of a frame's own work (ms)
    this.fps = 0;
    this.frameMs = 0;
    this._frames = 0;
    this._fpsT0 = 0;
  }

  init(ctx) { this.ctx = ctx; }
  add(entity) { this.entities.push(entity); }
  clear() { this.entities = []; this.tick = 0; }

  // browser entry — render-locked loop with fast-forward (stepsPerFrame updates per draw)
  start() {
    this.running = true;
    this._fpsT0 = nowMs();
    // async so an entity can await an off-thread force provider (worker pool / GPU)
    const loop = async () => {
      if (!this.running) return;
      const t0 = nowMs();
      if (!this.paused) for (let i = 0; i < PARAMETERS.stepsPerFrame; i++) await this.updateAsync();
      this.draw();
      const t1 = nowMs();
      this.frameMs += 0.1 * ((t1 - t0) - this.frameMs);
      this._frames++;
      if (t1 - this._fpsT0 >= 1000) {
        this.fps = this._frames * 1000 / (t1 - this._fpsT0);
        this._frames = 0; this._fpsT0 = t1;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  // one simulation step (the headless entry point too)
  update() {
    this.tick++;
    for (const e of this.entities) if (e.update) e.update(this);
    this.entities = this.entities.filter((e) => !e.removeFromWorld);
  }

  // browser step: entities with updateAsync are awaited (the world, when a provider is set)
  async updateAsync() {
    this.tick++;
    for (const e of this.entities) {
      if (e.updateAsync) await e.updateAsync(this);
      else if (e.update) e.update(this);
    }
    this.entities = this.entities.filter((e) => !e.removeFromWorld);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const e of this.entities) if (e.draw) e.draw(ctx);
  }
};
