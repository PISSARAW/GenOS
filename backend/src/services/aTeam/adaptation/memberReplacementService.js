'use strict';

const { optimizeTeam } = require('../teamFormation/teamFormationOptimizer');

function responsibilitiesFor(failed) {
  if (Array.isArray(failed?.ownedResponsibilities)) return failed.ownedResponsibilities;
  return failed?.capabilities || [];
}

function affordableCandidates(input) {
  const budget = Number(input.budget) || 0;
  return (Array.isArray(input.candidates) ? input.candidates : [])
    .filter((candidate) => (Number(candidate.estimatedCost) || 0) <= budget);
}

function replacementRequirements(responsibilities) {
  return responsibilities.map((capability) => ({ capability, weight: 1, criticality: 'high' }));
}

function blocked(reason) {
  return { status: 'BLOCKED', reason };
}

function planReplacement(input = {}) {
  const failed = input.failedMember;
  const responsibilities = responsibilitiesFor(failed);
  if (!failed || !responsibilities.length) return blocked('FAILED_MEMBER_HAS_NO_RECOVERABLE_RESPONSIBILITY');
  const requirements = replacementRequirements(responsibilities);
  const candidates = affordableCandidates(input);
  const selection = optimizeTeam({ requirements, candidates, capacity: 1 });
  if (selection.gaps.length) return blocked('REPLACEMENT_CANNOT_COVER_ALL_RESPONSIBILITIES');
  const winner = selection.selected[0];
  if (!winner) return blocked('REPLACEMENT_CANDIDATE_UNAVAILABLE');
  return {
    status: 'REPLACE', failedMemberId: failed.agentId || failed.memberId,
    replacement: winner.candidate, estimatedCost: Number(winner.candidate.estimatedCost) || 0
  };
}

module.exports = { planReplacement };
