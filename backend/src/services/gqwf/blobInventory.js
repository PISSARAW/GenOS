'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveContainedPathNoSymlinkSync } = require('../pathSafety');
const { readBlob } = require('./objects');

const HASH = /^[a-f0-9]{64}$/;
const PREFIX = /^[a-f0-9]{2}$/;

async function scanBlob(state, entry) {
  const location = path.join(state.prefixPath, entry.name);
  if (!HASH.test(entry.name) || !entry.name.startsWith(state.prefix)) {
    state.anomalies.push(path.relative(state.root, location));
    return;
  }
  const stat = await fs.lstat(location);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    state.anomalies.push(path.relative(state.root, location));
    return;
  }
  try {
    await readBlob(state.workspacePath, entry.name);
    state.blobs.push({ hash: entry.name, size: stat.size });
  } catch (_) {
    state.anomalies.push(path.relative(state.root, location));
  }
}

async function scanPrefix(state, entry) {
  const prefixPath = path.join(state.root, entry.name);
  const stat = await fs.lstat(prefixPath);
  if (!PREFIX.test(entry.name) || !stat.isDirectory() || stat.isSymbolicLink()) {
    state.anomalies.push(path.relative(state.root, prefixPath));
    return;
  }
  const entries = await fs.readdir(prefixPath, { withFileTypes: true });
  const childState = { ...state, prefix: entry.name, prefixPath };
  for (const child of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    await scanBlob(childState, child);
  }
}

async function scanBlobStore(workspacePath) {
  const root = resolveContainedPathNoSymlinkSync(workspacePath,
    '.genos/gqwf/blobs', 'GQWF blob store');
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('GQWF blob store is not a private directory.');
    }
  } catch (error) {
    if (error.code === 'ENOENT') return { blobs: [], anomalies: [] };
    throw error;
  }
  const state = { workspacePath, root, blobs: [], anomalies: [] };
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    await scanPrefix(state, entry);
  }
  state.blobs.sort((left, right) => left.hash.localeCompare(right.hash));
  state.anomalies.sort();
  return { blobs: state.blobs, anomalies: state.anomalies };
}

module.exports = { scanBlobStore };
