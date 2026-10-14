'use strict';

const crypto = require('node:crypto');
const { normalizeRelativePath, resolveContainedPath } = require('./pathSafety');

function directory(repoRoot, missionId) {
  const mission = normalizeRelativePath(missionId, 'Trinity mission');
  if (mission.includes('/') || mission.includes('\\')) {
    throw new Error('Trinity mission ID must be a path segment.');
  }
  const segment = crypto.createHash('sha256').update(mission).digest('hex').slice(0, 32);
  return resolveContainedPath(repoRoot,
    `.genos-agent-worlds/trinity-snapshots/${segment}`, 'Trinity snapshot');
}

module.exports = { directory };
