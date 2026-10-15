'use strict';
// Pure helpers — no DOM, no globals beyond these. Safe to load in the browser AND in the
// headless vm context (declared as `var`/`function` so they attach to either global).
var TAU = Math.PI * 2;

function randomInt(n) { return Math.floor(Math.random() * n); }
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Box–Muller normal sample
function normalSample(mean, sd) {
  mean = mean || 0; sd = (sd == null) ? 1 : sd;
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
function hsl(h, s, l) { return 'hsl(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%)'; }

// Seeded RNG (mulberry32) so a disk is reproducible from PARAMETERS.seed. Math.random is
// fine for cosmetic noise; anything that shapes a run goes through this.
var RNG = class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal() {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
};

// performance.now() exists in browsers and in Node ≥ 16; Date.now() is the fallback.
var nowMs = (typeof performance !== 'undefined' && performance.now)
  ? function () { return performance.now(); }
  : function () { return Date.now(); };
