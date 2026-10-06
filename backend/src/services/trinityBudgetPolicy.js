'use strict';
function reserveTokens(selection, totalTokens) {
  return replicaReserve(selection) + recursiveReserve(selection, totalTokens);
}
function replicaReserve(selection) {
  const policy = selection?.experimentalDesign?.replicationPolicy;
  if (policy === 'adaptive_budget_fixed_replicas') return positiveInteger(selection.adaptiveBudgetConfig?.poolTokens);
  if (policy === 'quality_diversity_replicas') return positiveInteger(selection.qdConfig?.replicaBudget) * positiveInteger(selection.qdConfig?.tokensPerReplica);
  if (policy === 'adaptive_replica_count') return positiveInteger(selection.sequentialConfig?.replicaBudget) * positiveInteger(selection.sequentialConfig?.tokensPerReplica);
  return 0;
}
function recursiveReserve(selection, totalTokens) {
  const design = selection?.experimentalDesign || {};
  if (design.worldTopology !== 'recursive_nesting' && design.hypothesisPolicy !== 'recursive_decomposition') return 0;
  if (Number(selection.recursiveState?.depth) >= 3) return 0;
  const maximum = Math.floor(positiveInteger(totalTokens) * 0.3);
  const tokens = selection.recursiveBudgetTokens ?? maximum;
  if (!Number.isSafeInteger(tokens) || tokens < 3 || tokens > maximum) throw Object.assign(new Error('Recursive Trinity requires a funded child budget within 30% of its parent.'), { code: 'TRINITY_RECURSIVE_BUDGET_REQUIRED' });
  return tokens;
}
function positiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw Object.assign(new Error('Trinity replication requires a positive integer budget.'), { code: 'TRINITY_BUDGET_REQUIRED' });
  return value;
}
function initialWorkerPool(policy, selection) {
  const total = positiveInteger(policy.total);
  const share = Number(policy.workerShare);
  if (!Number.isFinite(share) || share <= 0 || share > 1) throw Object.assign(new Error('Trinity worker share is invalid.'), { code: 'TRINITY_BUDGET_REQUIRED' });
  const available = Math.floor(total * share) - reserveTokens(selection, total);
  if (available <= 0) throw Object.assign(new Error('Reserved Trinity work exceeds its worker pool.'), { code: 'TRINITY_BUDGET_REQUIRED' });
  return available;
}
function allocate(request, count, selection) {
  const budget = request.execution_budget || request.executionBudget || {};
  const totalTokens = positiveInteger(budget.tokens);
  const reservedTokens = reserveTokens(selection, totalTokens);
  if (!Number.isSafeInteger(reservedTokens) || totalTokens - reservedTokens < count) throw Object.assign(new Error('Trinity total budget cannot fund initial worlds and reserved replicas.'), { code: 'TRINITY_BUDGET_REQUIRED' });
  const tokens = Math.floor((totalTokens - reservedTokens) / count);
  return { totalTokens, reservedTokens, perChamberTokens: Array(count).fill(tokens),
    maxLatencyMs: budget.latencyMs || null, overflowBehavior: 'escalate' };
}
module.exports = { allocate, reserveTokens, recursiveReserve, initialWorkerPool };
