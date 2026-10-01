'use strict';

const { competeWinners } = require('../ignitionService');
const predictiveRegret = require('./predictiveRegretService');

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
  const regret = candidate._agowRegretActive === false ? {} : candidate.agowRegret?.regret || {};
  return {
    information: measures.expectedInformationGain,
    relevance: measures.goalRelevance,
    urgency: measures.urgency,
    error: measures.predictionError,
    evidenceDebt: measures.evidenceDebt,
    actionability: measures.actionability,
    confidence: measures.causalConfidence,
    novelty: measures.novelty,
    cost: 1 / (1 + measures.estimatedCost),
    goalRegret: regret.goal || 0, epistemicRegret: regret.epistemic || 0,
    viabilityRegret: regret.viability || 0, integrityRegret: regret.integrity || 0,
    opportunityRegret: regret.opportunity || 0,
    irreversibility: candidate.epistemicContext?.irreversibility || 0
  };
}

function attachRegret(candidates, context) {
  return candidates.map((candidate) => ({
    ...candidate, agowRegret: predictiveRegret.evaluate(candidate, context),
    _agowRegretActive: context.controlRegret !== false
  }));
}

function selectPreemptive(candidates) {
  const preemptive = candidates.filter((candidate) => candidate._agowRegretActive && candidate.agowRegret.preempt);
  return preemptive.length ? preemptive : candidates;
}

function selectPriority(candidates) {
  if (!candidates.length) return { rank: null, candidates: [] };
  const rank = Math.min(...candidates.map(priority));
  return { rank, candidates: candidates.filter((candidate) => priority(candidate) === rank) };
}

function paretoFront(candidates) {
  return candidates.filter((candidate) => !dominated(candidate, candidates.filter((peer) => peer !== candidate)));
}

function dominated(candidate, peers) {
  const keys = ['information', 'relevance', 'urgency', 'error', 'evidenceDebt', 'actionability', 'confidence', 'novelty', 'cost', 'goalRegret', 'epistemicRegret', 'viabilityRegret', 'integrityRegret', 'opportunityRegret', 'irreversibility'];
  const candidateDrives = drives(candidate);
  return peers.some((peer) => {
    const peerDrives = drives(peer);
    const noWorse = keys.every((key) => peerDrives[key] >= candidateDrives[key]);
    const better = keys.some((key) => peerDrives[key] > candidateDrives[key]);
    return noWorse && better;
  });
}

function arbitrate(options) {
  const input = attachRegret(Array.isArray(options?.candidates) ? options.candidates : [], options?.regretContext || {});
  if (!input.length) return { candidates: [], competition: { winners: [], activations: {}, rounds: 0 }, selected: [] };
  const safe = selectPreemptive(input.filter((candidate) => Number.isFinite(priority(candidate))));
  if (!safe.length) return { candidates: [], competition: { winners: [], activations: {}, rounds: 0 }, selected: [], rejected: input.map((candidate) => candidate.candidateId) };
  const { rank: rankedPriority, candidates: eligible } = selectPriority(safe);
  const pareto = paretoFront(eligible);
  const competition = competeWinners(pareto.map((candidate) => ({ id: candidate.candidateId, drives: drives(candidate) })), options?.competition);
  const capacity = Math.max(1, Math.floor(Number(options?.capacity) || 3));
  const winners = new Set(competition.winners);
  const selected = pareto.filter((candidate) => winners.has(candidate.candidateId)).slice(0, capacity);
  return { priority: rankedPriority, candidates: pareto, competition, selected,
    regretEstimates: input.map((candidate) => candidate.agowRegret) };
}

module.exports = { arbitrate, priority, drives };
