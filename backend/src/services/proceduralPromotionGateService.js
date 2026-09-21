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

function evaluatePromotionGate({ organism, candidate, policy = {} }) {
  const before = organism || {};
  const after = candidate || {};

  const gates = [
    checkEvidence(before, after, policy),
    checkRobustness(before, after, policy),
    checkImmune(after),
    checkLineage(before, after),
    checkComplexity(before, after, policy),
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
    promotedId: result.promo ? candidate?.metadata?.id : null,
    result: result.promo ? 'PROMOTED' : 'REJECTED',
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
};
