'use strict';

const receipts = require('../../src/services/epistemicVerifierReceiptService');
const routeReceipts = require('../../src/services/rhizome/learning/routeReceiptService');
const admission = require('../../src/services/rhizome/security/capabilityAdmissionService');
const { normalizeCapabilityEdge } = require('../../src/services/rhizome/contracts/capabilityEdge');

const executionResults = require('../../src/services/rhizome/runtime/executionResultService');

const DIGEST = 'rhizome-completion-verifier-v1';

function makeReceipt(context) {
  const { route, need, outcome = 'SUCCESS' } = context;
  const receipt = { routeId: route.routeId, needId: need.needId, capability: need.capability,
    nodeIds: route.nodeIds, edgeIds: route.edgeIds, outcome, executionDigest: context.executionDigest || executionResults.capture(context.result ?? null).executionDigest,
    verification: { verificationId: 'verify:' + need.needId, verifierId: 'independent-review',
      status: 'VERIFIED', result: outcome, evidenceRefs: ['execution:' + need.needId, ...(need.evidenceRequirements || [])] } };
  receipt.verification.signedReceipt = receipts.issueReceipt({ resultId: receipt.routeId,
    evidenceDigest: routeReceipts.outcomeDigest(receipt), verifierDigest: DIGEST, independent: true });
  return receipt;
}

function makeProof(context) {
  const { node, candidate, need } = context;
  const proof = { kind: 'CAPABILITY_VERIFIED', evidenceId: 'admission:' + candidate.candidateId,
    verifierDigest: DIGEST, independent: true, evidenceRefs: node.provenance || [],
    candidateId: candidate.candidateId, nodeId: node.nodeId, capability: need.capability,
    edgeContracts: (context.edges || []).map(normalizeCapabilityEdge) };
  proof.signedReceipt = receipts.issueReceipt({ resultId: proof.evidenceId,
    evidenceDigest: admission.evidenceDigest(node, proof), verifierDigest: DIGEST, independent: true });
  return proof;
}

function node(nodeId, capabilities = []) {
  return { nodeId, kind: 'TOOL', capabilities, state: 'ACTIVE', reliability: 0.95, cost: 0, latency: 0, evidenceRequirements: [] };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE',
    compatibility: 1, conductivity: 0.8, successRate: 1, evidenceQuality: 1, reliability: 0.95,
    cost: 0, latency: 1, trailState: { positive: 0, negative: 0, verifiedFlow: 0 } };
}

function candidate(context) {
  return { candidateId: 'grow:' + context.need.needId, action: 'ATTACH_SERVICE', targetNodeIds: [],
    expectedUtility: 1, creationCost: 0.1, coordinationCost: 0.1, duplicationRisk: 0,
    sufficient: true, evidenceRefs: [context.gap.evidence.evidenceId] };
}

module.exports = { DIGEST, makeReceipt, makeProof, node, edge, candidate };
