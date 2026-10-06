'use strict';

const { withTransaction } = require('../../db');
const artifacts = require('../morphogenesis/capabilities/runtimeArtifacts');
const cambium = require('../morphogenesis/capabilities/cambiumService');
const lifecycle = require('../morphogenesis/capabilities/cambiumLifecycle');
const policy = require('./consolidationPolicyService');

async function consolidate(db, input) {
  const resolver = artifacts.resolver(db, input.scopeId);
  const assessment = policy.classifyForConsolidation({ ...input.episode, cambiumRequired: true,
    applicability: input.contract.conditions, evidenceRefs: input.contract.witnesses.map((item) => item.artifactRef) }, input.history);
  if (assessment.action !== 'procedural') return { promoted: false, assessment };
  return withTransaction(db, async (tx) => {
  await cambium.registerProcedure(tx, { ...input.contract, scopeId: input.scopeId,
    claimId: input.memoryId, resolveArtifact: resolver });
  for (const parentId of input.parentClaimIds || []) await lifecycle.link(tx, { scopeId: input.scopeId, parentId, childId: input.memoryId });
  return { promoted: true, assessment, claimId: input.memoryId };
  });
}
async function recall(db, input) {
  const context = await cambium.loadClaimContext(db, { ...input, resolveArtifact: artifacts.resolver(db, input.scopeId) });
  return context?.usable ? context : null;
}
async function compress(db, input) {
  return cambium.commitCompression(db, { ...input, resolveArtifact: artifacts.resolver(db, input.scopeId) });
}
module.exports = { consolidate, recall, compress };
