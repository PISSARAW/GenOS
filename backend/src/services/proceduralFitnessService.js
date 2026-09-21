"use strict";

const genomePolicy = require("./proceduralGenomePolicyService");

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function complexityCost(graph = {}) {
  const nodes = Number(graph.nodes || 0);
  const edges = Number(graph.edges || 0);
  const tokenCost = clamp01(Number(graph.tokenCost) || 0);
  const executionCost = clamp01(Number(graph.executionCost) || 0);
  const alpha = 0.25, beta = 0.25, gamma = 0.25, delta = 0.25;
  return clamp01(alpha * nodes / 100 + beta * edges / 200 + gamma * tokenCost + delta * executionCost);
}

function fitness(policy, metrics = {}) {
  const p = genomePolicy.policyFrom(policy);
  const w = p.fitnessWeights || {};
  const v = (key, def) => clamp01(metrics[key] == null ? def : Number(metrics[key]));
  const pos = ['success', 'robustness', 'evidence', 'generalization']
    .reduce((s, k) => s + (w[k] || 0.1) * v(k, 0), 0);
  const neg = ['cost', 'risk', 'complexity']
    .reduce((s, k) => s + (w[k] || 0.1) * v(k, 0), 0);
  return {
    score: clamp01(pos - neg),
    components: {
      success: v('success', 0), robustness: v('robustness', 0),
      evidence: v('evidence', 0), generalization: v('generalization', 0),
      cost: v('cost', 0), risk: v('risk', 0), complexity: v('complexity', 0),
    },
  };
}

function budgetEnergy(graph) {
  const c = complexityCost(graph);
  return { cost: c, graph };
}

function withinBudget(graph, maxCost) {
  const c = complexityCost(graph);
  return { ok: c <= (maxCost == null ? 1 : Number(maxCost)), cost: c };
}

function fitnessHistoryCompare(history = []) {
  if (history.length < 2) return { trend: "insufficient", first: null, last: null };
  return {
    trend: history[history.length - 1] > history[0] ? "improving" : "declining",
    first: history[0],
    last: history[history.length - 1],
  };
}

module.exports = {
  complexityCost,
  fitness,
  budgetEnergy,
  withinBudget,
  fitnessHistoryCompare,
};
