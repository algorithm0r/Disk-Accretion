'use strict';
// Samples world.stats() every reportingPeriod steps, feeds the live graphs, and (when
// PARAMETERS.autoSave is on) ships a self-describing packet — full PARAMETERS + samples —
// to the DB at epoch. The packet() helper (db.js) embeds PARAMETERS verbatim so every run
// reconstructs from its own record.
//
// The headless runner (runner.mjs) drives steps and flushes explicitly so it can await the
// write; in the browser the flush is fire-and-forget and off by default.
var DataManager = class DataManager {
  constructor(world, db, graphs) {
    this.world = world;
    this.db = db;
    this.graphs = graphs || {};
    this.samples = [];
    this.run = (PARAMETERS.db && PARAMETERS.db.run) || 'run';
    this.flushed = false;
  }

  sample() {
    const s = this.world.stats();
    const row = {
      step: s.steps, t: s.t, n: s.n, maxMass: s.maxMass, nBig: s.nBig,
      massAccreted: s.massAccreted, massEjected: s.massEjected, LzDrift: s.LzDrift,
    };
    this.samples.push(row);
    if (this.graphs.n) this.graphs.n.push(Math.log10(s.n));
    if (this.graphs.maxMass) this.graphs.maxMass.push(Math.log10(s.maxMassRatio));
    return row;
  }

  update(engine) {
    if (this.world.steps % PARAMETERS.reportingPeriod === 0) this.sample();
    if (PARAMETERS.autoSave && !this.flushed && this.world.steps >= PARAMETERS.epoch) {
      this.flushed = true;
      this.flush();
    }
  }

  packet() {
    const s = this.world.stats();
    return this.db.packet(PARAMETERS, {
      project: 'Disk Accretion', run: this.run, samples: this.samples,
      final: { t: s.t, n: s.n, maxMass: s.maxMass, nBig: s.nBig, LzDrift: s.LzDrift, massError: s.massError },
    });
  }

  async flush() {
    if (!this.db) return { ok: false };
    try {
      const res = await this.db.insert(this.run, this.packet());
      if (typeof console !== 'undefined') console.log('[data] saved', JSON.stringify(res));
      return res;
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[data] save failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  draw() {}
};
