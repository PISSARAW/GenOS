'use strict';

/**
 * CryptobiosisCoordinator : dormant != dead. Persiste mémoire/DNA/
 * épigénétique/procédures/relations, coupe le compute, réhydrate si niche.
 */

const legacy = require('../resilienceService');

function freeze(opts) {
  const o = opts || {};
  return legacy.freezeCryptobiosis(o.workspaceId || 'fleet', o.reason || 'pressure', o.state || {});
}

function thaw(opts) {
  const o = opts || {};
  return legacy.thawCryptobiosis(o.snapshotId);
}

module.exports = { freeze, thaw };
