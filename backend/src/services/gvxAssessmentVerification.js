'use strict';

const registry = require('./gvxVerifierRegistry');
const { error } = require('./gvxContracts');

async function verifyAssessment(options) {
  if (!options.verifierRegistry?.remote) throw error('GVX_REMOTE_VERIFIER_REQUIRED');
  const artifact = Buffer.from(JSON.stringify({ schema: 'genos.gvx.somatic-assessment/v1',
    assessmentInput: options.assessmentInput, assessment: options.assessment }));
  const evidence = { artifactRef: options.artifactRef, artifactHash: registry.digest(artifact),
    verifierId: 'gvx-somatic-assessment-v1', supportingReceipts: options.verificationReceipts };
  const result = await registry.verifyEvidence({ registry: options.verifierRegistry,
    artifactReader: async () => artifact, evidence, requirement: 'gvx-somatic-assessment' });
  return { verified: result.verified === true, evidenceRef: { artifactHash: evidence.artifactHash,
    verifierId: evidence.verifierId }, signedReceipt: result.signedReceipt };
}

async function verifyLongitudinal(options) {
  const windows = options.monitoring.results.map((item) => ({
    observationId: item.observationId, contextHash: item.contextHash,
    artifactHash: item.verification?.evidenceRef?.artifactHash }));
  const payload = { schema: 'genos.gvx.longitudinal-assessment/v1', binding: options.binding, windows,
    minimumStableWindows: options.minimumStableWindows || 3 };
  const artifact = Buffer.from(JSON.stringify(payload));
  const evidence = { artifactRef: `gvx-monitor:${options.binding.applicationId}`,
    artifactHash: registry.digest(artifact), verifierId: 'gvx-longitudinal-assessment-v1',
    supportingReceipts: options.monitoring.results.map((item) => item.verification?.signedReceipt).filter(Boolean) };
  const result = await registry.verifyEvidence({ registry: options.verifierRegistry,
    artifactReader: async () => artifact, evidence, requirement: 'gvx-longitudinal-assessment' });
  return { verified: result.verified === true, evidenceRef: { artifactHash: evidence.artifactHash,
    verifierId: evidence.verifierId }, signedReceipt: result.signedReceipt };
}

module.exports = { verifyAssessment, verifyLongitudinal };
