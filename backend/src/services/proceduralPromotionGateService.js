'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function num(value, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function checkEvidence(before, after, policy) {
  const beforeEvidence = before.fitness?.components?.evidence || 0;
  const afterEvidence = after.fitness?.components?.evidence || 0;
  const minEvidence = clamp01(num(policy.minEvidence, 0.5));
  return { name: 'evidence', passed: afterEvidence >= minEvidence, reason: afterEvidence >= minEvidence ? null : `evidence ${afterEvidence} < ${minEvidence}`, before: beforeEvidence, after: afterEvidence };
}

function checkRobustness(before, after, policy) {
  const beforeRobustness = before.fitness?.components?.robustness || 0;
  const afterRobustness = after.fitness?.components?.robustness || 0;
  const minRobustness = clamp01(num(policy.minRobustness, 0.3));
  return { name: 'robustness', passed: afterRobustness >= minRobustness, reason: afterRobustness >= minRobustness ? null : `robustness ${afterRobustness} < ${minRobustness}`, before: beforeRobustness, after: afterRobustness };
}

function checkImmune(after) {
  const passed = !after.immune?.rejected;
  return { name: 'immune', passed, reason: passed ? null : `immune rejection: ${after.immune?.findings?.length || 0} findings`, findings: after.immune?.findings || [] };
}

function checkLineage(before, after) {
  if (!before.metadata?.id) return { name: 'lineage', passed: true, reason: null };
  const passed = after.metadata?.parentId === before.metadata?.id;
  return { name: 'lineage', passed, reason: passed ? null : `parent mismatch: expected ${before.metadata?.id}, got ${after.metadata?.parentId}` };
}

function checkComplexity(before, after, policy) {
  const beforeNodes = before.structure?.nodes?.length || 0;
  const afterNodes = after.structure?.nodes?.length || 0;
  const maxNodes = num(policy.maxNodes, 100);
  return { name: 'complexity', passed: afterNodes <= maxNodes, reason: afterNodes <= maxNodes ? null : `nodes ${afterNodes} > ${maxNodes}`, before: beforeNodes, after: afterNodes };
}

function checkFitnessDelta(before, after, policy) {
  const epsilon = clamp01(num(policy.epsilon, 0.01));
  const beforeScore = before.fitness?.score || 0;
  const afterScore = after.fitness?.score || 0;
  const delta = afterScore - beforeScore;
  const passed = delta >= -epsilon;
  return { name: 'fitness_delta', passed, reason: passed ? null : `fitness regressed by ${(-delta).toFixed(3)} (epsilon=${epsilon})`, before: beforeScore, after: afterScore, delta };
}

function checkSuccessRegression(before, after, policy) {
  const maxRegression = clamp01(num(policy.maxSuccessRegression, 0.1));
  const beforeSuccess = before.fitness?.components?.success || 0;
  const afterSuccess = after.fitness?.components?.success || 0;
  const passed = (beforeSuccess - afterSuccess) <= maxRegression;
  return { name: 'success_regression', passed, reason: passed ? null : `success regressed from ${beforeSuccess} to ${afterSuccess} (max ${maxRegression})`, before: beforeSuccess, after: afterSuccess };
}

function checkRiskRegression(before, after, policy) {
  const maxRiskIncrease = clamp01(num(policy.maxRiskIncrease, 0.1));
  const beforeRisk = before.fitness?.components?.risk || 0;
  const afterRisk = after.fitness?.components?.risk || 0;
  const passed = (afterRisk - beforeRisk) <= maxRiskIncrease;
  return { name: 'risk_regression', passed, reason: passed ? null : `risk increased from ${beforeRisk} to ${afterRisk} (max ${maxRiskIncrease})`, before: beforeRisk, after: afterRisk };
}

function checkGeneralization(before, after, policy) {
  const minGeneralization = clamp01(num(policy.minGeneralization, 0.0));
  const beforeGen = before.fitness?.components?.generalization || 0;
  const afterGen = after.fitness?.components?.generalization || 0;
  const passed = afterGen >= minGeneralization;
  return { name: 'generalization', passed, reason: passed ? null : `generalization ${afterGen} < ${minGeneralization}`, before: beforeGen, after: afterGen };
}

function evaluatePromotionGate({ organism, candidate, policy = {} }) {
  const before = organism || {};
  const after = candidate || {};

  const gates = [
    checkEvidence(before, after, policy),
    checkRobustness(before, after, policy),
    checkImmune(after),
    checkLineage(before, after),
    checkComplexity(before, after, policy),
    checkFitnessDelta(before, after, policy),
    checkSuccessRegression(before, after, policy),
    checkRiskRegression(before, after, policy),
    checkGeneralization(before, after, policy),
  ];

  const promoted = gates.every((g) => g.passed);
  const blocking = gates.filter((g) => !g.passed);

  return {
    promoted,
    gates,
    blocking,
    gateNames: gates.map((g) => g.name),
    timestamp: new Date().toISOString(),
  };
}

function createPromotionReceipt({ organism, candidate, result }) {
  return {
    id: `prom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    parentId: organism?.metadata?.id || null,
    promotedId: result.promoted ? candidate?.metadata?.id : null,
    result: result.promoted ? 'PROMOTED' : 'REJECTED',
    gates: result.gates,
    blocking: result.blocking,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  evaluatePromotionGate,
  createPromotionReceipt,
  checkEvidence,
  checkRobustness,
  checkImmune,
  checkLineage,
  checkComplexity,
  checkFitnessDelta,
  checkSuccessRegression,
  checkRiskRegression,
  checkGeneralization,
};
