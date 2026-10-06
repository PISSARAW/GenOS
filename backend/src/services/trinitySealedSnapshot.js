'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { copyTree, createExclusionFilter } = require('./agentWorkspaceLifecycle/copy');
const { maxCopyBytes } = require('./agentWorkspaceLifecycle/constants');
const { normalizeRelativePath, resolveContainedPath } = require('./pathSafety');
const { hashWorkspace } = require('./trinitySnapshotService');
async function seal(input) {
  const segment = normalizeRelativePath(input.missionId, 'Trinity mission');
  if (segment.includes('/') || segment.includes('\\')) throw new Error('Trinity mission ID must be a path segment.');
  const root = resolveContainedPath(input.repoRoot, '.genos-agent-worlds/trinity-snapshots/' + segment, 'Trinity snapshot');
  const staging = resolveContainedPath(input.repoRoot, '.genos-agent-worlds/trinity-snapshots/' + segment + '.partial.' + crypto.randomUUID(), 'Trinity staging');
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
    if (await hashWorkspace(input.root) !== input.hash) throw Object.assign(new Error('Trinity sealed snapshot identity conflicts.'), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
  }
}
module.exports = { seal };
