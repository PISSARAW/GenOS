'use strict';

const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');
const { reachableNodes } = require('./frontierService');
const evidenceService = require('./gapEvidenceService');

function matchingProviders(session, capability) {
  return (session.nodes || []).filter((node) => node.capabilities.includes(capability));
}

function diagnosisFor(context) {
  const { need, providers, reachable } = context;
  const activeReachable = providers.filter((node) => reachable.has(node.nodeId)
    && ['ACTIVE', 'AVAILABLE'].includes(node.state) && node.availability?.status !== 'UNAVAILABLE');
  const evidenceReady = activeReachable.filter((node) => need.evidenceRequirements.every((item) => node.evidenceRequirements.includes(item)));
  if (evidenceReady.length) return null;
  const reason = !providers.length ? 'CAPABILITY_ABSENT'
    : !activeReachable.length ? 'ROUTE_UNREACHABLE' : 'EVIDENCE_UNSATISFIED';
  return { reason, providers, reachableNodeIds: [...reachable].sort() };
}

function buildGap(session, need, diagnosis) {
  const confidence = diagnosis.reason === 'CAPABILITY_ABSENT' ? 1 : 0.9;
  const evidence = evidenceService.buildEvidence(session, need, diagnosis);
  return {
    gapId: `gap:${need.needId}:v${session.graphVersion}`,
    needId: need.needId,
    missingCapability: need.capability,
    reason: diagnosis.reason,
    currentFrontier: diagnosis.reachableNodeIds,
    evidence,
    severity: need.criticality,
    confidence,
    duplicationRisk: diagnosis.providers.length > 0
  };
}

function detectGap(session, value) {
  const need = normalizeCapabilityNeed(value);
  const providers = matchingProviders(session, need.capability);
  const diagnosis = diagnosisFor({ need, providers, reachable: reachableNodes(session) });
  return diagnosis ? buildGap(session, need, diagnosis) : null;
}

module.exports = { detectGap };
