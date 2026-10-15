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
