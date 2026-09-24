'use strict';

function decisionFor(requirements, selected, uncovered) {
  return {
    status: uncovered.length ? 'PARTIAL' : 'COVERED',
    selectedCandidateIds: selected.map((item) => item.candidate.agentId || item.candidate.id),
    uncoveredCapabilities: uncovered.map((item) => item.capability),
    reasons: selected.map((item) => ({
      candidateId: item.candidate.agentId || item.candidate.id,
      capability: item.capability,
      fit: item.fit,
      score: item.score
    })),
    requiredCount: requirements.length,
    staffedCount: requirements.length - uncovered.length
  };
}

module.exports = { decisionFor };
