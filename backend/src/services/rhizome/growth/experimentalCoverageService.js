'use strict';

const evidenceStore = require('../../morphogenesis/capabilities/capabilityEvidenceStore');

async function optionsForGrowth(db, options = {}) {
  if (!options.experimentalScopeId) return options;
  if (!db) throw new Error('Experimental growth requires a database');
  const experimentalCoverageReceipts = await evidenceStore.loadVerifiedCoverage(db, {
    scopeId: options.experimentalScopeId, resolveArtifact: options.resolveArtifact
  });
  return { ...options, experimentalCoverageReceipts };
}

module.exports = { optionsForGrowth };
