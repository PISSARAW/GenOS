'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { createExclusionFilter } = require('./agentWorkspaceLifecycle/copy');
const { isSensitivePath } = require('./agentWorkspaceLifecycle/constants');

async function visitWorkspace(state, directory, relative) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (state.excluded(entry.name) || isSensitivePath(child)) continue;
    const childPath = path.join(directory, entry.name);
    const stats = await fs.lstat(childPath);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) await visitWorkspace(state, childPath, child);
    else if (stats.isFile()) {
      state.hash.update(child.replace(/\\/g, '/'));
      state.hash.update('\0');
      state.hash.update(await fs.readFile(childPath));
      state.hash.update('\0');
    }
  }
}

async function hashWorkspace(root) {
  const hash = crypto.createHash('sha256');
  await visitWorkspace({ hash, excluded: createExclusionFilter() }, root, '');
  return hash.digest('hex');
}

module.exports = { hashWorkspace };
