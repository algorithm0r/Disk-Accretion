'use strict';
// Browser-only async force providers (the headless runners never load this file). Each has
// selfAccel(world) → Promise<interactions>, writing the softened body-body acceleration into
// world.ax/ay; World.updateAsync adds the star term and finishes the step.
//
// ─── GravityPool: the grouped Barnes-Hut walk split across Web Workers ─────────────────
// No SharedArrayBuffer here (it needs cross-origin isolation, i.e. COOP/COEP headers, which
// file:// and the Static Server don't send), so each step posts one packed copy of
// (x, y, m) to every worker. Each worker builds its own tree (the build is ~15% of the
// serial cost, so replicating it is cheaper than shipping tree arrays) and sums the groups
// whose first body falls in its slice of the sorted order; it returns the covered run of
// body indices and their accelerations. Workers are blob URLs built from the SAME
// BarnesHut source the main thread uses, so there is one gravity implementation and the
// pool works from file:// too.
var GravityPool = class GravityPool {
  constructor(nWorkers) {
    this.name = 'workers×' + nWorkers;
    const src = [
      'var BH_LEAF_CAP = ' + BH_LEAF_CAP + ';',
      'var BarnesHut = ' + BarnesHut.toString() + ';',
      '(function ' + GravityPool.workerMain.toString() + ')();',   // a static method stringifies as 'name() {…}'
    ].join('\n');
    this.url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    this.workers = [];
    for (let k = 0; k < nWorkers; k++) this.workers.push(new Worker(this.url));
  }

  // runs inside each worker
  static workerMain() {
    let tree = null;
    onmessage = function (e) {
      const d = e.data, n = d.n, buf = d.buf;
      const x = buf.subarray(0, n), y = buf.subarray(n, 2 * n), m = buf.subarray(2 * n, 3 * n);
      if (!tree || tree.next.length < n) tree = new BarnesHut(n);
      if (!tree.ax || tree.ax.length < n) { tree.ax = new Float64Array(n); tree.ay = new Float64Array(n); }
      tree.build(x, y, m, n, d.theta);
      const lo = Math.floor(n * d.k / d.W), hi = Math.floor(n * (d.k + 1) / d.W);
      const inter = tree.accelGrouped(x, y, m, n, d.eps2, tree.ax, tree.ay, d.group, lo, hi);
      const c0 = tree.covLo, c1 = Math.max(tree.covLo, tree.covHi), len = c1 - c0;
      const idx = new Int32Array(len), out = new Float64Array(2 * len);
      for (let s = 0; s < len; s++) {
        const b = tree.order[c0 + s];
        idx[s] = b; out[2 * s] = tree.ax[b]; out[2 * s + 1] = tree.ay[b];
      }
      postMessage({ idx: idx, out: out, inter: inter }, [idx.buffer, out.buffer]);
    };
  }

  selfAccel(world) {
    const P = world.P, n = world.n, W = this.workers.length;
    const buf = new Float64Array(3 * n);
    buf.set(world.x.subarray(0, n), 0); buf.set(world.y.subarray(0, n), n); buf.set(world.m.subarray(0, n), 2 * n);
    const ax = world.ax, ay = world.ay;
    return Promise.all(this.workers.map((w, k) => new Promise((resolve) => {
      w.onmessage = (e) => {
        const idx = e.data.idx, out = e.data.out;
        for (let s = 0; s < idx.length; s++) { const b = idx[s]; ax[b] = out[2 * s]; ay[b] = out[2 * s + 1]; }
        resolve(e.data.inter);
      };
      w.postMessage({ buf: buf, n: n, k: k, W: W, theta: P.theta, eps2: P.softening * P.softening, group: P.bhGroup || 32 });
    }))).then((parts) => parts.reduce((a, b) => a + b, 0));
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    URL.revokeObjectURL(this.url);
  }
};

// ─── GpuGravity: exact all-pairs on the GPU (WebGPU compute, f32) ──────────────────────
// Brute force, not a tree: on a GPU the regular O(N²) tile loop beats an irregular tree
// walk up to ~10⁵ bodies. Positions are sent relative to the star in f32 (|x| ≲ 10, so the
// ulp is ~1e-6 and a 1e-3 separation keeps ~3e-4 relative precision, well inside the
// tree's 3e-3 force error); the star term and the integration stay f64 on the CPU.
// Each step: upload (x, y, m) → one dispatch of 256-thread workgroups that stage tiles of
// 256 bodies in workgroup memory → copy to a staging buffer → mapAsync read-back.
var GPU_WGSL = `
struct Params { n: u32, eps2: f32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> pos: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> acc: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> P: Params;
var<workgroup> tile: array<vec4<f32>, 256>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let i = gid.x;
  let n = P.n;
  var pi = vec4<f32>(0.0);
  if (i < n) { pi = pos[i]; }
  var a = vec2<f32>(0.0);
  let ntiles = (n + 255u) / 256u;
  for (var t = 0u; t < ntiles; t = t + 1u) {
    let j = t * 256u + lid.x;
    if (j < n) { tile[lid.x] = pos[j]; } else { tile[lid.x] = vec4<f32>(0.0); }
    workgroupBarrier();
    for (var k = 0u; k < 256u; k = k + 1u) {
      let q = tile[k];
      let d = q.xy - pi.xy;
      let r2 = dot(d, d) + P.eps2;
      let inv = inverseSqrt(r2);
      a = a + (q.z * inv * inv * inv) * d;   // d = 0 (self, padding) contributes exactly 0
    }
    workgroupBarrier();
  }
  if (i < n) { acc[i] = a; }
}`;

var GpuGravity = class GpuGravity {
  static async create() {
    if (!navigator.gpu) throw new Error('WebGPU not available');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter');
    const g = new GpuGravity();
    g.device = await adapter.requestDevice();
    g.adapterInfo = adapter.info ? (adapter.info.vendor + ' ' + adapter.info.architecture) : '';
    const module = g.device.createShaderModule({ code: GPU_WGSL });
    g.pipeline = g.device.createComputePipeline({ layout: 'auto', compute: { module: module, entryPoint: 'main' } });
    g.params = g.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    g.cap = 0;
    g.name = 'gpu (all-pairs f32)';
    return g;
  }

  ensure(n) {
    if (n <= this.cap) return;
    const cap = Math.max(1024, Math.ceil(n * 1.25));
    const d = this.device;
    if (this.posBuf) { this.posBuf.destroy(); this.accBuf.destroy(); this.readBuf.destroy(); }
    this.posBuf = d.createBuffer({ size: cap * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.accBuf = d.createBuffer({ size: cap * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.readBuf = d.createBuffer({ size: cap * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.host = new Float32Array(cap * 4);
    this.bind = d.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.posBuf } },
        { binding: 1, resource: { buffer: this.accBuf } },
        { binding: 2, resource: { buffer: this.params } },
      ],
    });
    this.cap = cap;
  }

  async selfAccel(world) {
    const n = world.n, d = this.device;
    this.ensure(n);
    const h = this.host, x = world.x, y = world.y, m = world.m;
    for (let i = 0; i < n; i++) { h[4 * i] = x[i]; h[4 * i + 1] = y[i]; h[4 * i + 2] = m[i]; h[4 * i + 3] = 0; }
    d.queue.writeBuffer(this.posBuf, 0, h.buffer, 0, n * 16);
    const eps2 = world.P.softening * world.P.softening;
    d.queue.writeBuffer(this.params, 0, new Uint32Array([n, 0, 0, 0]));
    d.queue.writeBuffer(this.params, 4, new Float32Array([eps2]));
    const enc = d.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bind);
    pass.dispatchWorkgroups(Math.ceil(n / 256));
    pass.end();
    enc.copyBufferToBuffer(this.accBuf, 0, this.readBuf, 0, n * 8);
    d.queue.submit([enc.finish()]);
    await this.readBuf.mapAsync(GPUMapMode.READ, 0, n * 8);
    const a = new Float32Array(this.readBuf.getMappedRange(0, n * 8));
    const ax = world.ax, ay = world.ay;
    for (let i = 0; i < n; i++) { ax[i] = a[2 * i]; ay[i] = a[2 * i + 1]; }
    this.readBuf.unmap();
    return n * n;
  }

  dispose() {
    if (this.posBuf) { this.posBuf.destroy(); this.accBuf.destroy(); this.readBuf.destroy(); }
    this.device.destroy();
  }
};
