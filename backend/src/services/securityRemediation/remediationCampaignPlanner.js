'use strict';

const { fingerprint } = require('../stateFingerprint');
const immuneMemory = require('../immuneMemoryService');
const { GRAPH_SCHEMA } = require('./antigenGraphService');

const CAMPAIGN_SCHEMA = 'genos.security-remediation-campaign/v1';
const FAMILIES = Object.freeze([
  { id: 'control', intervention: 'no_change', purpose: 'Measure the untreated baseline.' },
  { id: 'minimal_patch', intervention: 'smallest_local_change',
    purpose: 'Remove the unsafe path with the smallest bounded diff.' },
  { id: 'structural_fix', intervention: 'repair_shared_boundary',
    purpose: 'Repair the shared trust boundary behind the antigen cluster.' },
  { id: 'compensating_control', intervention: 'add_defense_in_depth',
    purpose: 'Add a reversible guard when direct repair is not sufficient.' }
]);

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function memoryDecision(cluster, family, memories) {
  if (family.id === 'control') return { prohibited: false, signature: null };
  const signature = immuneMemory.extractFailureSignature({
    failureCategory: 'security-remediation', strategy: family.id,
    contextFingerprint: cluster.causeHash
  });
  return { signature: signature.signature,
    prohibited: immuneMemory.isExactRetryProhibited(memories, { failureSignature: signature }) };
}

function candidateRecord(cluster, family, options) {
  const memory = memoryDecision(cluster, family, options.immuneMemories || []);
  const identity = { campaignSeed: options.campaignSeed, causeHash: cluster.causeHash,
    family: family.id, sourceDigest: options.sourceDigest };
  const candidateId = `security-candidate-${fingerprint(identity).slice(0, 20)}`;
  return { id: candidateId, clusterId: cluster.id, causeHash: cluster.causeHash,
    producerId: options.producerId, family: family.id, intervention: family.intervention,
    purpose: family.purpose, status: memory.prohibited ? 'blocked_by_negative_memory' : 'planned',
    negativeMemorySignature: memory.signature,
    isolation: { mode: 'copy_on_write', workspaceId: `capsule-${candidateId}`,
      sourceDigest: options.sourceDigest, network: 'disabled' },
    safety: { liveTargetAccess: false, exploitPayloadExecution: false,
      allowedOperations: ['edit_workspace_copy', 'run_local_tests', 'run_static_analysis',
        'run_safe_reproduction_fixture'] },
    requiredEvidence: ['scanner_outcome', 'safe_path_reproduction', 'functional_invariants',
      'new_hazard_scan'], promotionEligible: false };
}

function normalizedOptions(options) {
  if (typeof options?.sourceDigest !== 'string' || !options.sourceDigest.trim()) {
    throw failure('SECURITY_CAMPAIGN_SOURCE_DIGEST_REQUIRED');
  }
  if (typeof options.producerId !== 'string' || !options.producerId.trim()) {
    throw failure('SECURITY_CAMPAIGN_PRODUCER_REQUIRED');
  }
  return { ...options, campaignSeed: options.campaignSeed || 'default-security-campaign' };
}

function planRemediationCampaign(graph, options) {
  if (graph?.schema !== GRAPH_SCHEMA || !Array.isArray(graph.clusters)
      || !graph.clusters.length) throw failure('SECURITY_ANTIGEN_GRAPH_REQUIRED');
  const normalized = normalizedOptions(options);
  const candidates = graph.clusters.flatMap((cluster) => FAMILIES.map((family) =>
    candidateRecord(cluster, family, normalized)));
  const body = { schema: CAMPAIGN_SCHEMA, antigenGraphHash: graph.graphHash,
    sourceDigest: normalized.sourceDigest, producerId: normalized.producerId,
    candidates, executionPolicy: { isolatedWorkspaceRequired: true,
      independentVerificationRequired: true, realExploitExecutionAllowed: false },
    promotionEligible: false };
  return { ...body, campaignHash: fingerprint(body) };
}

module.exports = { CAMPAIGN_SCHEMA, FAMILIES, planRemediationCampaign };
