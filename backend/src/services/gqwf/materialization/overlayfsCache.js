'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createRuntime } = require('./overlayfsRuntime');

const HASH = /^[a-f0-9]{64}$/;

function cacheRoot(workspacePath) {
  return path.join(workspacePath, '.genos', 'gqwf', 'overlay-lower');
}

function cachePath(workspacePath, rootHash) {
  if (!HASH.test(rootHash || '')) throw new Error('Invalid GQWF OverlayFS cache hash.');
  return path.join(cacheRoot(workspacePath), rootHash);
}

function cacheAnomaly(message) {
  return Object.assign(new Error(message), { code: 'GQWF_OVERLAY_CACHE_ANOMALY' });
}

async function assertDirectory(location) {
  const stat = await fs.lstat(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw cacheAnomaly('GQWF OverlayFS cache contains an unsafe directory.');
  }
}

async function assertReady(target, rootHash) {
  const ready = path.join(target, '.ready');
  const stat = await fs.lstat(ready);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || await fs.readFile(ready, 'utf8') !== rootHash) {
    throw cacheAnomaly('GQWF OverlayFS cache ownership proof is invalid.');
  }
}

async function measureTree(state, location) {
  const entries = await fs.readdir(location, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(location, entry.name);
    const stat = await fs.lstat(child);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      await measureTree(state, child);
    } else if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1) {
      state.size += stat.size;
    } else {
      throw cacheAnomaly('GQWF OverlayFS cache contains an unsafe entry.');
    }
  }
}

async function inspectCache(engine, input) {
  if (!HASH.test(input.rootHash)) throw cacheAnomaly('GQWF OverlayFS cache name is invalid.');
  const target = path.join(input.parent, input.rootHash);
  const lower = path.join(target, 'root');
  await assertDirectory(target);
  await assertDirectory(lower);
  await assertReady(target, input.rootHash);
  const state = { size: 0 };
  await measureTree(state, target);
  return { rootHash: input.rootHash, path: target, lowerPath: lower,
    size: state.size, mounted: await engine.usesLower(lower) };
}

async function scanLowerCaches(engine, workspacePath) {
  const parent = cacheRoot(workspacePath);
  try {
    await assertDirectory(parent);
  } catch (error) {
    if (error.code === 'ENOENT') return { caches: [], anomalies: [] };
    throw error;
  }
  const caches = [];
  const anomalies = [];
  const entries = await fs.readdir(parent, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    try {
      caches.push(await inspectCache(engine, { parent, rootHash: entry.name }));
    } catch (error) {
      if (error.code !== 'GQWF_OVERLAY_CACHE_ANOMALY' && error.code !== 'ENOENT') throw error;
      anomalies.push(`overlay-lower/${entry.name}`);
    }
  }
  return { caches, anomalies };
}

async function removeLowerCache(engine, input) {
  const parent = cacheRoot(input.workspacePath);
  const current = await inspectCache(engine, { parent, rootHash: input.rootHash });
  if (current.size !== input.size) throw new Error('GQWF OverlayFS cache changed before deletion.');
  if (current.mounted || await engine.usesLower(current.lowerPath)) {
    throw new Error('GQWF OverlayFS cache is still mounted.');
  }
  await fs.rm(current.path, { recursive: true, force: false });
}

function createOverlayfsCacheManager(overrides = {}) {
  const engine = createRuntime(overrides);
  return {
    scan: (workspacePath) => scanLowerCaches(engine, workspacePath),
    remove: (input) => removeLowerCache(engine, input)
  };
}

module.exports = { cachePath, createOverlayfsCacheManager };
