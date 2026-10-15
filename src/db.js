'use strict';
/**
 * Standard DB client — vendored into every project so nobody relearns the connection.
 * Canonical copy lives in ~/.claude/scaffold/db.js; `/new-project` copies it in, and
 * `/refresh-db` re-stamps it when the Server API evolves.
 *
 * One API, two transports:
 *   - 'socket' : via the mint research Server (socket.io over TLS). Use from browser sims
 *                and any remote/cross-machine client. Uses the Server's ack envelopes.
 *   - 'direct' : a direct MongoClient to mongodb://127.0.0.1:27017. Use from headless
 *                runners on the box / LAN. Supports management helpers the Server can't.
 *
 * Every method resolves to a normalised envelope: { ok: true, ... } or throws.
 *
 *   const db = createDB({ transport: 'socket', server: 'https://localhost:8888', db: 'myProjDB' });
 *   await db.insert('runs', docs);                          // -> { ok, inserted }
 *   await db.find('runs', { gen: 5 }, { projection: { fitness: 1 }, limit: 50 });  // { ok, results }
 *   await db.count('runs', {});                             // -> { ok, count }
 *
 *   // scratch: temp work auto-routes to <db>_scratch and is swept in one call
 *   const tmp = db.scratch();
 *   await tmp.insert('roundtrip', { probe: 1 });
 *   await db.dropScratch();                                 // (direct transport only)
 *
 *   // reproducibility + batch helpers
 *   const coll = await db.nextBatch();                      // 'batch_004' (direct only)
 *   await db.insert(coll, db.packet(PARAMETERS, sample));   // self-describing packet
 *
 * Config: { transport, server, mongoUrl, db, run, scratch }
 *   transport 'socket'|'direct' (default 'socket')
 *   server    socket-mode Server URL (default https://localhost:8888)
 *   mongoUrl  direct-mode Mongo URL (default mongodb://127.0.0.1:27017)
 *   db        database name (required in practice)
 *   run       optional run-name stamped into packet()
 *   scratch   if true, ALL ops target <db>_scratch
 *
 * NOTE: nextBatch() and dropScratch() need 'direct' transport — the Server's CRUD API
 * has no listCollections/drop verbs yet. Adding those verbs is the natural follow-up so
 * scratch cleanup works over socket too.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.createDB = factory().createDB;
})(typeof self !== 'undefined' ? self : this, function () {

  const isNode = typeof module !== 'undefined' && !!module.exports;
  const scratchName = (name) => name + '_scratch';
  const nowISO = () => new Date().toISOString();

  function createDB(config) {
    const cfg = Object.assign({
      transport: 'socket',
      server: 'https://localhost:8888',
      mongoUrl: 'mongodb://127.0.0.1:27017',
      db: 'test',
      run: null,
      scratch: false,
    }, config || {});

    const dbName = cfg.scratch ? scratchName(cfg.db) : cfg.db;

    // ---- socket transport (browser global `io`, or node socket.io-client) ----
    let socketPromise = null;
    function getSocket() {
      if (socketPromise) return socketPromise;
      socketPromise = new Promise((resolve, reject) => {
        let io;
        if (isNode) { const m = require('socket.io-client'); io = m.io || m.connect || m; }
        else io = root.io;
        if (!io) return reject(new Error('socket.io client not available'));
        const socket = io(cfg.server, { rejectUnauthorized: false, transports: ['websocket', 'polling'] });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (e) => reject(new Error('connect_error: ' + (e && e.message || e))));
      });
      return socketPromise;
    }
    function emitAck(event, payload) {
      return getSocket().then((socket) => new Promise((resolve, reject) => {
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; reject(new Error(event + ' ack timeout (Server without acks?)')); } }, 15000);
        socket.emit(event, payload, (res) => {
          if (done) return;
          done = true; clearTimeout(t);
          if (res && res.ok === false) reject(new Error(event + ': ' + res.error));
          else resolve(res);
        });
      }));
    }

    // ---- direct transport (node mongodb driver, lazy singleton) ----
    let clientPromise = null;
    function getMongo() {
      if (clientPromise) return clientPromise;
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(cfg.mongoUrl);
      clientPromise = client.connect().then(() => client);
      return clientPromise;
    }
    const coll = (name) => getMongo().then((c) => c.db(dbName).collection(name));

    // ---- verbs (dispatch on transport, normalise to { ok, ... }) ----
    async function insert(collection, data) {
      if (cfg.transport === 'socket') return emitAck('insert', { db: dbName, collection, data });
      const c = await coll(collection);
      const arr = Array.isArray(data) ? data : [data];
      let inserted = 0;
      for (let i = 0; i < arr.length; i += 500) {
        const r = await c.insertMany(arr.slice(i, i + 500));
        inserted += r.insertedCount;
      }
      return { ok: true, inserted };
    }
    async function find(collection, query, opts) {
      opts = opts || {};
      if (cfg.transport === 'socket')
        return emitAck('find', { db: dbName, collection, query, projection: opts.projection, limit: opts.limit, page: opts.page });
      const c = await coll(collection);
      const cur = c.find(query || {}, { projection: opts.projection });
      if (opts.limit != null || opts.page != null) {
        const limit = opts.limit != null ? opts.limit : 20, page = opts.page || 0;
        cur.skip(page * limit).limit(limit);
      }
      return { ok: true, results: await cur.toArray() };
    }
    async function count(collection, query) {
      if (cfg.transport === 'socket') return emitAck('count', { db: dbName, collection, query });
      const c = await coll(collection);
      const n = (query && Object.keys(query).length) ? await c.countDocuments(query) : await c.estimatedDocumentCount();
      return { ok: true, count: n };
    }
    async function distinct(collection, key, query) {
      if (cfg.transport === 'socket') return emitAck('distinct', { db: dbName, collection, key, query });
      const c = await coll(collection);
      return { ok: true, values: await c.distinct(key, query || {}) };
    }
    async function update(collection, query, change, options) {
      if (cfg.transport === 'socket') return emitAck('update', { db: dbName, collection, query, change, options });
      const c = await coll(collection);
      const r = await c.updateMany(query, change, options || {});
      return { ok: true, matched: r.matchedCount, modified: r.modifiedCount, upserted: r.upsertedCount || 0 };
    }

    // ---- conventions baked in as helpers ----
    function packet(parameters, data) {
      return Object.assign({}, data, { _parameters: parameters, _ts: nowISO(), _run: cfg.run });
    }
    async function nextBatch(prefix) {
      prefix = prefix || 'batch';
      let names;
      if (cfg.transport === 'socket') {
        names = (await emitAck('listCollections', { db: dbName })).collections || [];
      } else {
        const client = await getMongo();
        names = (await client.db(dbName).listCollections().toArray()).map((c) => c.name);
      }
      const nums = names.filter((n) => n.indexOf(prefix + '_') === 0)
        .map((n) => parseInt(n.slice(prefix.length + 1), 10)).filter((n) => !isNaN(n));
      const next = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      return prefix + '_' + String(next).padStart(3, '0');
    }
    function scratch() {
      return createDB(Object.assign({}, cfg, { scratch: true }));
    }
    async function dropScratch() {
      const target = scratchName(cfg.db);
      if (cfg.transport === 'socket') return emitAck('dropDatabase', { db: target });
      const client = await getMongo();
      await client.db(target).dropDatabase();
      return { ok: true, dropped: target };
    }
    async function close() {
      if (clientPromise) { try { (await clientPromise).close(); } catch (e) {} clientPromise = null; }
      if (socketPromise) { try { const s = await socketPromise; s.close && s.close(); } catch (e) {} socketPromise = null; }
    }

    return { insert, find, count, distinct, update, packet, nextBatch, scratch, dropScratch, close, dbName, config: cfg };
  }

  return { createDB };
});
