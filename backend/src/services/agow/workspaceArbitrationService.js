'use strict';

const { competeWinners } = require('../ignitionService');

const CONSTRAINT_ORDER = ['safety', 'integrity', 'viability', 'userPolicy'];
function priority(candidate) {
  const constraints = candidate.constraints || {};
  if (CONSTRAINT_ORDER.some((key) => constraints[key] === 'blocked')) return Number.POSITIVE_INFINITY;
  if (CONSTRAINT_ORDER.some((key) => constraints[key] === 'review')) return 2;
  if ((candidate.contradictions || []).length || candidate.measures.uncertainty >= 0.8 || candidate.content.semanticType === 'active_query_response') return 3;
  if (candidate.measures.goalRelevance >= 0.5) return 4;
  return 5;
}

function drives(candidate) {
  const measures = candidate.measures;
  return {
    information: measures.expectedInformationGain,
    relevance: measures.goalRelevance,
    urgency: measures.urgency,
    error: measures.predictionError,
    evidenceDebt: measures.evidenceDebt,
    actionability: measures.actionability,
    confidence: measures.causalConfidence,
    novelty: measures.novelty,
    cost: 1 / (1 + measures.estimatedCost)
  };
}

function dominated(candidate, peers) {
  const keys = ['information', 'relevance', 'urgency', 'error', 'evidenceDebt', 'actionability', 'confidence', 'novelty', 'cost'];
  const candidateDrives = drives(candidate);
  return peers.some((peer) => {
    const peerDrives = drives(peer);
    const noWorse = keys.every((key) => peerDrives[key] >= candidateDrives[key]);
    const better = keys.some((key) => peerDrives[key] > candidateDrives[key]);
    return noWorse && better;
  });
}

function arbitrate(options) {
  const input = Array.isArray(options?.candidates) ? options.candidates : [];
  if (!input.length) return { candidates: [], competition: { winners: [], activations: {}, rounds: 0 }, selected: [] };
  const safe = input.filter((candidate) => Number.isFinite(priority(candidate)));
  if (!safe.length) return { candidates: [], competition: { winners: [], activations: {}, rounds: 0 }, selected: [], rejected: input.map((candidate) => candidate.candidateId) };
  const rankedPriority = Math.min(...safe.map(priority));
  const eligible = safe.filter((candidate) => priority(candidate) === rankedPriority);
  const pareto = eligible.filter((candidate) => !dominated(candidate, eligible.filter((peer) => peer !== candidate)));
  const competition = competeWinners(pareto.map((candidate) => ({ id: candidate.candidateId, drives: drives(candidate) })), options?.competition);
  const capacity = Math.max(1, Math.floor(Number(options?.capacity) || 3));
  const winners = new Set(competition.winners);
  const selected = pareto.filter((candidate) => winners.has(candidate.candidateId)).slice(0, capacity);
  return { priority: rankedPriority, candidates: pareto, competition, selected };
}

module.exports = { arbitrate, priority, drives };
