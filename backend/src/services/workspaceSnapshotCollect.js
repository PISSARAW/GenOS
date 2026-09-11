/**
 * Snapshot capture-side collection (split of workspaceSnapshotStore.js).
 */
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { isSafeRelative, shouldIgnore } = require('./workspaceSnapshotPaths');

const DEFAULT_MAX_SNAPSHOT_FILES = 100000;
const DEFAULT_MAX_SNAPSHOT_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_SNAPSHOT_FILE_BYTES = 128 * 1024 * 1024;

function configuredPositiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function snapshotLimits() {
  return {
    maxFiles: configuredPositiveInteger('GENOS_MAX_SNAPSHOT_FILES', DEFAULT_MAX_SNAPSHOT_FILES),
    maxBytes: configuredPositiveInteger('GENOS_MAX_SNAPSHOT_BYTES', DEFAULT_MAX_SNAPSHOT_BYTES),
    maxFileBytes: configuredPositiveInteger('GENOS_MAX_SNAPSHOT_FILE_BYTES', DEFAULT_MAX_SNAPSHOT_FILE_BYTES)
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function manifestHash(files) {
  return sha256(JSON.stringify(files));
}

async function statIfPresent(absolute) {
  try {
    return await fsp.stat(absolute);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function readIfPresent(absolute) {
  try {
    return await fsp.readFile(absolute);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function assertFileLimits(state, stat, childRelative) {
  if (stat.size > state.limits.maxFileBytes) throw new Error(`Snapshot file exceeds the ${state.limits.maxFileBytes}-byte limit: ${childRelative}`);
  if (state.files.length >= state.limits.maxFiles) throw new Error(`Snapshot exceeds the ${state.limits.maxFiles}-file limit.`);
  state.totalBytes += stat.size;
  if (state.totalBytes > state.limits.maxBytes) throw new Error(`Snapshot exceeds the ${state.limits.maxBytes}-byte limit.`);
}

async function collectFileEntry(state, absolute, childRelative) {
  const stat = await statIfPresent(absolute);
  if (!stat) return;
  assertFileLimits(state, stat, childRelative);
  const bytes = await readIfPresent(absolute);
  if (!bytes) return;
  state.files.push({ path: childRelative.split(path.sep).join('/'), hash: sha256(bytes), size: stat.size, mode: stat.mode & 0o777 });
}

async function collectDirEntry(state, location) {
  const { directory, relative, entry } = location;
  const childRelative = relative ? path.join(relative, entry.name) : entry.name;
  if (shouldIgnore(childRelative, entry)) return;
  const absolute = path.join(directory, entry.name);
  if (entry.isSymbolicLink()) return;
  if (entry.isDirectory()) {
    await walkCollected(state, absolute, childRelative);
    return;
  }
  if (entry.isFile() && isSafeRelative(childRelative)) await collectFileEntry(state, absolute, childRelative);
}

async function walkCollected(state, directory, relative) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    await collectDirEntry(state, { directory, relative, entry });
  }
}

async function collectFiles(root, limits = snapshotLimits()) {
  const state = { limits, files: [], totalBytes: 0 };
  await walkCollected(state, root, '');
  return state.files.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = {
  configuredPositiveInteger,
  snapshotLimits,
  sha256,
  manifestHash,
  collectFiles
};
