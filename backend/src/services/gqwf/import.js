'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { shouldIgnore, sanitizeFileMode } = require('../workspaceSnapshotPaths');
const { snapshotLimits } = require('../workspaceSnapshotCollect');
const { normalizePath, createManifest } = require('./manifest');
const { putBlob, sha256 } = require('./objects');

async function visitFile(state, location) {
  const stat = await fs.lstat(location.absolute);
  if (!stat.isFile() || stat.nlink > 1) throw new Error(`GQWF refuses non-regular or linked file: ${location.relative}`);
  if (stat.size > state.limits.maxFileBytes) throw new Error('GQWF source file exceeds the size limit.');
  const bytes = await fs.readFile(location.absolute);
  const after = await fs.lstat(location.absolute);
  if (!stableFile(stat, after, bytes.length)) {
    throw new Error(`GQWF source changed during import: ${location.relative}`);
  }
  state.total += bytes.length;
  if (state.total > state.limits.maxBytes || state.files.length >= state.limits.maxFiles) {
    throw new Error('GQWF source exceeds snapshot limits.');
  }
  const hash = state.persist ? await putBlob(state.blobRoot, bytes) : sha256(bytes);
  state.files.push({ path: normalizePath(location.relative.split(path.sep).join('/')),
    hash, size: bytes.length, mode: sanitizeFileMode(stat.mode & 0o777, location.relative, bytes) });
}

function stableFile(before, after, length) {
  return after.isFile() && after.nlink === 1 && after.size === length && before.mtimeMs === after.mtimeMs;
}

async function visitDirectory(state, location) {
  const directory = await fs.lstat(location.absolute);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error(`GQWF refuses linked directory: ${location.relative}`);
  }
  const entries = await fs.readdir(location.absolute, { withFileTypes: true });
  for (const entry of entries) {
    const relative = location.relative ? path.join(location.relative, entry.name) : entry.name;
    if (shouldIgnore(relative, entry)) continue;
    const absolute = path.join(location.absolute, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`GQWF refuses symbolic link: ${relative}`);
    if (entry.isDirectory()) await visitDirectory(state, { absolute, relative });
    else if (entry.isFile()) await visitFile(state, { absolute, relative });
    else throw new Error(`GQWF refuses special file: ${relative}`);
  }
}

async function scanWorkspace(workspacePath, persist, blobWorkspacePath = workspacePath) {
  const state = { blobRoot: blobWorkspacePath, limits: snapshotLimits(), files: [], total: 0, persist };
  await visitDirectory(state, { absolute: workspacePath, relative: '' });
  return createManifest(state.files);
}

async function importWorkspace(workspacePath, blobWorkspacePath = workspacePath) {
  const first = await scanWorkspace(workspacePath, true, blobWorkspacePath);
  const second = await scanWorkspace(workspacePath, false);
  if (first.hash !== second.hash) throw new Error('GQWF source changed during import.');
  return first;
}

module.exports = { importWorkspace, scanWorkspace };
