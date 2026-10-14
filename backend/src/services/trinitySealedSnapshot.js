'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { copyTree, createExclusionFilter } = require('./agentWorkspaceLifecycle/copy');
const { maxCopyBytes } = require('./agentWorkspaceLifecycle/constants');
const { directory: missionSnapshotDirectory } = require('./trinityMissionSnapshotPath');
const { hashWorkspace } = require('./trinitySnapshotService');
async function seal(input) {
  const root = missionSnapshotDirectory(input.repoRoot, input.missionId);
  const staging = `${root}.partial.${crypto.randomUUID()}`;
  const sourceHash = await hashWorkspace(input.source);
  try {
    await fs.mkdir(staging, { recursive: true });
    await copyTree({ state: { bytes: 0, limit: maxCopyBytes(), entries: 0 }, isExcluded: createExclusionFilter() },
      { source: input.source, destination: staging, relative: '' });
    const hash = await hashWorkspace(staging);
    if (hash !== sourceHash || hash !== await hashWorkspace(input.source)) throw Object.assign(new Error('Trinity source changed while sealing.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
    await install({ staging, root, hash });
    return { root, hash };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
async function install(input) {
  try { await fs.rename(input.staging, input.root); }
  catch (error) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
    if (await snapshotExists(input.root)) {
      if (await hashWorkspace(input.root) !== input.hash) throw snapshotConflict();
      return;
    }
    if (error.code !== 'EPERM') throw error;
    await fs.cp(input.staging, input.root, { recursive: true, errorOnExist: true, force: false });
    if (await hashWorkspace(input.root) !== input.hash) throw snapshotConflict();
  }
}
async function snapshotExists(root) {
  try { await fs.access(root); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function snapshotConflict() {
  return Object.assign(new Error('Trinity sealed snapshot identity conflicts.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
}
module.exports = { seal };
