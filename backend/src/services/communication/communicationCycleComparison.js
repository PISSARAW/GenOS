'use strict';

const crypto = require('node:crypto');

function comparisonKey(input) {
  const { intent, decision } = input;
  const comparable = {
    sender: intent.senderAgentId, purpose: intent.purpose || null,
    domain: intent.domain || null,
    semanticRefs: [...(intent.semanticRefs || [])].sort(),
    artifactRefs: [...(intent.artifactRefs || [])].sort(),
    recipients: [...(decision.recipients || [])].sort(),
    grounding: decision.grounding || 'none'
  };
  return crypto.createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
}

function completeParticipants(outcome) {
  return Array.isArray(outcome.participantUsage)
    && outcome.participantUsage.every((entry) => Number.isSafeInteger(entry.generationTokens)
      && Number.isSafeInteger(entry.controlTokens));
}

function comparable(baseline, candidate) {
  if (!baseline || baseline.comparisonKey !== candidate.comparisonKey) return false;
  return completeCycle(baseline) && completeCycle(candidate);
}

function completeCycle(outcome) {
  return outcome.simulated === false && outcome.published === true
    && outcome.grounding?.satisfied === true && outcome.tokenCoverage === 'complete'
    && completeParticipants(outcome);
}

function participantDelta(baseline, candidate) {
  const prior = new Map(baseline.participantUsage.map((entry) => [entry.agentId, entry]));
  if (prior.size !== candidate.participantUsage.length) return null;
  const deltas = [];
  for (const entry of candidate.participantUsage) {
    const before = prior.get(entry.agentId);
    if (!before) return null;
    deltas.push({ agentId: entry.agentId,
      generationTokens: entry.generationTokens - before.generationTokens,
      controlTokens: entry.controlTokens - before.controlTokens });
  }
  return deltas;
}

function compareCycles(baseline, candidate) {
  if (!comparable(baseline, candidate)) {
    return { status: 'incomparable', reason: 'TASK_GROUNDING_OR_USAGE_INCOMPLETE' };
  }
  const perAgent = participantDelta(baseline, candidate);
  if (!perAgent) return { status: 'incomparable', reason: 'PARTICIPANTS_DIFFER' };
  return { status: 'reported_delta',
    baselineCycleId: baseline.cycleId, candidateCycleId: candidate.cycleId,
    deltaTokens: candidate.tokensUsed - baseline.tokensUsed,
    perAgent, savingsVerified: false,
    provenance: [baseline.usageProvenance, candidate.usageProvenance] };
}

module.exports = { comparisonKey, compareCycles };
