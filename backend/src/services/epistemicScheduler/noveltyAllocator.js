'use strict';

const { taskFingerprint } = require('./taskFingerprint');

const DEFAULT_WEIGHTS = Object.freeze({
  semanticDistance: 0.25,
  obligationCoverage: 0.25,
  falsificationPotential: 0.15,
  capabilityFit: 0.15,
  agentNovelty: 0.1,
  evidenceIndependence: 0.1,
});

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function capabilityFit(task, agent) {
  const required = new Set(task.requiredCapabilities || []);
  if (!required.size) return 1;
  const available = new Set(agent.capabilities || []);
  return [...required].filter((item) => available.has(item)).length / required.size;
}

function familiarityPenalty(task, agent) {
  const prior = new Set(agent.priorTaskFingerprints || []);
  return prior.has(taskFingerprint(task)) ? 1 : 0;
}

function costEfficiency(task, agent) {
  const cost = Math.max(0, Number(task.estimatedTokens) || 0);
  const budget = Math.max(0, Number(agent.availableTokens) || 0);
  if (!cost) return 1;
  if (!budget) return 0;
  return bounded(1 - (cost / budget));
}

function assignmentSignals(pair) {
  const novelty = pair.task.novelty || {};
  return {
    semanticDistance: bounded(novelty.semanticDistance),
    obligationCoverage: bounded(novelty.obligationCoverage),
    falsificationPotential: bounded(novelty.falsificationPotential),
    capabilityFit: capabilityFit(pair.task, pair.agent),
    agentNovelty: 1 - familiarityPenalty(pair.task, pair.agent),
    evidenceIndependence: bounded(pair.agent.evidenceIndependence),
  };
}

function weightedScore(signals, weights) {
  return Object.keys(DEFAULT_WEIGHTS).reduce((sum, key) => sum + signals[key] * weights[key], 0);
}

function scoreAssignment(pair, weights = DEFAULT_WEIGHTS) {
  const signals = assignmentSignals(pair);
  const informationScore = weightedScore(signals, { ...DEFAULT_WEIGHTS, ...weights });
  const efficiency = costEfficiency(pair.task, pair.agent);
  return {
    taskId: pair.task.taskId,
    agentId: pair.agent.agentId,
    taskFingerprint: taskFingerprint(pair.task),
    score: Number((informationScore * (0.8 + (0.2 * efficiency))).toFixed(6)),
    signals: { ...signals, costEfficiency: efficiency },
  };
}

function candidatePairs(input) {
  const reserved = new Set(input.reservedAgentIds || []);
  const agents = (input.agents || []).filter((agent) => !reserved.has(agent.agentId));
  return (input.tasks || []).flatMap((task) => agents.map((agent) => ({ task, agent })));
}

function compareCandidates(left, right) {
  return right.score - left.score
    || String(left.taskId).localeCompare(String(right.taskId))
    || String(left.agentId).localeCompare(String(right.agentId));
}

function allocateByNovelty(input = {}) {
  const ranked = candidatePairs(input).map((pair) => scoreAssignment(pair, input.weights)).sort(compareCandidates);
  const assignedTasks = new Set();
  const assignedAgents = new Set();
  const limit = Math.max(0, Number(input.maxAssignments) || Number.MAX_SAFE_INTEGER);
  const assignments = [];
  for (const candidate of ranked) {
    if (assignments.length >= limit) break;
    if (assignedTasks.has(candidate.taskId) || assignedAgents.has(candidate.agentId)) continue;
    assignedTasks.add(candidate.taskId);
    assignedAgents.add(candidate.agentId);
    assignments.push(candidate);
  }
  return { assignments, unassignedTaskIds: (input.tasks || []).map((task) => task.taskId).filter((id) => !assignedTasks.has(id)) };
}

module.exports = { DEFAULT_WEIGHTS, capabilityFit, scoreAssignment, allocateByNovelty };
