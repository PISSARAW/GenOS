'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const bench = require('./run.cjs');

function accumulate(state, metric, duration) {
  const entry = state[metric.category][metric.name] || { calls: 0, ms: 0 };
  entry.calls++;
  entry.ms += duration;
  state[metric.category][metric.name] = entry;
}

function wrapAsync(state, target, metric) {
  const original = target[metric.name];
  target[metric.name] = async function (...args) {
    const start = performance.now();
    try { return await original.apply(this, args); }
    finally { accumulate(state, metric, performance.now() - start); }
  };
  state.restore.push(() => { target[metric.name] = original; });
}

function wrapHash(state) {
  const original = crypto.createHash;
  crypto.createHash = function (...args) {
    const hash = original.apply(this, args);
    for (const name of ['update', 'digest']) {
      const method = hash[name];
      hash[name] = function (...values) {
        const start = performance.now();
        try { return method.apply(this, values); }
        finally { accumulate(state, { category: 'hash', name }, performance.now() - start); }
      };
    }
    return hash;
  };
  state.restore.push(() => { crypto.createHash = original; });
}

function wrapOpenHandles(state) {
  const original = fs.open;
  fs.open = async function (...args) {
    const start = performance.now();
    try {
      const handle = await original.apply(this, args);
      for (const name of ['writeFile', 'sync', 'close']) wrapAsync(state, handle, { name, category: 'filesystem' });
      return handle;
    } finally { accumulate(state, { category: 'filesystem', name: 'open' }, performance.now() - start); }
  };
  state.restore.push(() => { fs.open = original; });
}

function install(db) {
  const state = { sqlite: {}, filesystem: {}, hash: {}, restore: [] };
  for (const name of ['get', 'all', 'run', 'exec']) wrapAsync(state, db, { name, category: 'sqlite' });
  for (const name of ['mkdir', 'readFile', 'writeFile', 'rename', 'copyFile', 'rm', 'lstat', 'stat', 'readdir']) {
    wrapAsync(state, fs, { name, category: 'filesystem' });
  }
  wrapOpenHandles(state);
  wrapHash(state);
  return state;
}

function sum(category) {
  return Object.values(category).reduce((total, item) => total + item.ms, 0);
}

async function main() {
  const views = Number(process.argv[2] || 100);
  assert(Number.isSafeInteger(views) && views >= 1 && views <= 1000);
  const config = { views, files: 8, bytes: 1024, materializations: 1 };
  const resource = await bench.fixture(config);
  try {
    const base = await resource.fabric.importBase({ workspaceId: 'bench' });
    const forked = await bench.createViews(resource, config, base.rootHash);
    const state = install(resource.db);
    let overlay;
    const start = performance.now();
    try { overlay = await bench.writeSharedOverlay(resource, forked.views); }
    finally { for (const restore of state.restore.reverse()) restore(); }
    const wallMs = performance.now() - start;
    const measuredMs = sum(state.sqlite) + sum(state.filesystem) + sum(state.hash);
    const footprint = await bench.footprint(resource);
    assert.equal(footprint.blobCount, 9);
    process.stdout.write(`${JSON.stringify({ protocol: 'gqwf-overlays-profile-v1', views,
      wallMs, measuredMs, unattributedMs: wallMs - measuredMs,
      writeSharedOverlay: overlay, sqlite: state.sqlite, filesystem: state.filesystem,
      hash: state.hash, blobCount: footprint.blobCount }, null, 2)}\n`);
  } finally {
    await resource.db.close();
    await bench.removeFixture(resource.directory);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
