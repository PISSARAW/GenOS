'use strict';

const { randomUUID } = require('node:crypto');

function average(candidates, key) {
  if (!candidates.length) return 0;
  return candidates.reduce((sum, candidate) => sum + candidate.measures[key], 0) / candidates.length;
}

function create(options) {
  const { agentId, cycle, selected, previousFrame, now = Date.now(), settings = {} } = options;
  const primary = selected[0] || null;
  const secondary = selected.slice(1, 1 + (settings.secondaryCapacity ?? 2));
  const frame = {
    frameId: randomUUID(), agentId, cycle,
    primaryContent: primary?.candidateId || null,
    secondaryContents: secondary.map((candidate) => candidate.candidateId),
    activeGoal: settings.activeGoal || null,
    unresolvedQuestions: Array.isArray(settings.unresolvedQuestions) ? settings.unresolvedQuestions.slice(0, 16) : [],
    attentionTarget: settings.attentionTarget || null,
    epistemicState: {
      confidence: average(selected, 'causalConfidence'),
      uncertainty: average(selected, 'uncertainty'),
      contradiction: selected.some((candidate) => candidate.contradictions?.length) ? 1 : 0
    },
    causalContext: {
      previousFrameId: previousFrame?.frameId || null,
      triggeredBy: selected.map((candidate) => candidate.candidateId),
      predictionError: average(selected, 'predictionError')
    },
    createdAt: now,
    decayAt: now + Math.max(1000, Number(settings.frameTtlMs) || 60000)
  };
  return frame;
}

module.exports = { create };
