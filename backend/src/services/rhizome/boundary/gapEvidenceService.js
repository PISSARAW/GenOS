'use strict';

function buildEvidence(session, need, diagnosis) {
  return {
    evidenceId: `gap-evidence:${need.needId}:${session.graphVersion}`,
    needId: need.needId,
    graphVersion: session.graphVersion,
    observedAt: new Date().toISOString(),
    diagnosis,
    providerNodeIds: diagnosis.providers.map((node) => node.nodeId),
    reachableNodeIds: diagnosis.reachableNodeIds
  };
}

function hasGapEvidence(gap) {
  return Boolean(gap?.evidence?.evidenceId && gap?.evidence?.needId === gap.needId
    && Number.isInteger(gap.evidence.graphVersion) && gap.evidence.diagnosis);
}

module.exports = { buildEvidence, hasGapEvidence };
