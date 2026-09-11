const crypto = require('crypto');

async function recursiveRefinement(context = {}) {
  const steps = Array.isArray(context.steps) ? context.steps : (context.turns || []);
  if (steps.length <= 1) return { success: true, refinedSteps: steps, reductionPercent: 0 };

  const essential = steps.filter(s => s.error || s.classification === 'Breakthrough' || s.isIntervention || s.action === 'execute');
  const finalSteps = essential.length > 0 ? essential : steps.slice(-2);
  const reductionPercent = Number((((steps.length - finalSteps.length) / steps.length) * 100).toFixed(1));

  return {
    success: true,
    originalCount: steps.length,
    refinedCount: finalSteps.length,
    reductionPercent,
    refinedSteps: finalSteps
  };
}

async function futureWorlds(context = {}) {
  const branchCount = Math.min(context.branchCount || 3, 10);
  const horizon = context.horizonSteps || 3;

  const worlds = [];
  for (let i = 0; i < branchCount; i++) {
    const probability = Number((1 / branchCount).toFixed(2));
    worlds.push({
      worldId: `future_${crypto.randomBytes(4).toString('hex')}`,
      hypothesis: `Trajectory branch ${i + 1}`,
      horizon,
      expectedOutcome: i === 0 ? 'OPTIMAL' : (i === 1 ? 'CONSERVATIVE' : 'RISK_TOLERANT'),
      probability
    });
  }

  return { success: true, worldCount: worlds.length, worlds };
}

async function pairedExecution(context = {}) {
  const baselineResult = context.baseline || { status: 'SUCCESS', verified: true };
  const candidateResult = context.candidate || { status: 'SUCCESS', verified: true };

  return {
    success: true,
    pairedExecutionId: `pair_${crypto.randomBytes(4).toString('hex')}`,
    baselineOutcome: baselineResult.status || 'SUCCESS',
    candidateOutcome: candidateResult.status || 'SUCCESS',
    timestamp: new Date().toISOString()
  };
}

async function similarity(context = {}) {
  const left = context.left || context.a || {};
  const right = context.right || context.b || {};

  const leftStr = typeof left === 'string' ? left : JSON.stringify(left);
  const rightStr = typeof right === 'string' ? right : JSON.stringify(right);

  if (leftStr === rightStr) return { success: true, similarityScore: 1.0, metric: 'exact_match' };
  const overlap = [...new Set(leftStr.split(/\s+/))].filter(w => rightStr.includes(w)).length;
  const score = Math.min(1.0, Number((overlap / Math.max(1, leftStr.split(/\s+/).length)).toFixed(4)));

  return { success: true, similarityScore: score, metric: 'jaccard_token_overlap' };
}

async function equivalenceVerdict(context = {}) {
  const sim = context.similarityScore ?? context.score ?? (context.left && context.right ? (await similarity(context)).similarityScore : 1.0);
  const threshold = Number(context.threshold ?? 0.85);
  const isEquivalent = sim >= threshold;

  return {
    success: true,
    isEquivalent,
    similarityScore: sim,
    threshold,
    verdict: isEquivalent ? 'EQUIVALENT' : 'DIVERGENT'
  };
}

module.exports = {
  recursiveRefinement,
  futureWorlds,
  pairedExecution,
  similarity,
  equivalenceVerdict
};
