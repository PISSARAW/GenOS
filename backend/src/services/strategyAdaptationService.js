/**
 * Strategy adaptation facade: budget-aware strategy changes with a
 * cooldown-guarded post-failure fallback path.
 */
const strategyContracts = require('./strategyContractService');
const strategyExecution = require('./strategyExecutionService');
const { remainingBudget, checkFallbackCooldown } = require('./strategyAdaptationBudget');
const { strategySignature, planAdaptation, changeStrategy } = require('./strategyAdaptationPlan');

function hasFailedRun(activeRun) {
  if (!activeRun || !['cancelled', 'failed', 'blocked'].includes(activeRun.status)) return false;
  if (activeRun.status !== 'cancelled') return true;
  return Boolean(activeRun.guardrailReason && activeRun.guardrailReason.includes('Primary strategy failed or produced insufficient evidence'));
}

async function useFallbackStrategyIfPrimaryFailed(db, orchestratorId) {
  // Detect if the primary strategy has failed and switch to fallback if available.
  const currentContract = await strategyContracts.getLatestContract(db, orchestratorId);
  if (!currentContract) return null;
  const fallback = currentContract.contract.selected_strategy?.fallback;
  if (!fallback) return null;
  const activeRun = await strategyExecution.getLatestRun(db, orchestratorId);
  if (!hasFailedRun(activeRun)) return null;
  const cooldown = checkFallbackCooldown(orchestratorId);
  if (!cooldown.allowed) {
    throw Object.assign(new Error(`Fallback strategy change cooling down for orchestrator '${orchestratorId}' (retry in ${cooldown.retryAfterMs}ms).`), { code: 'STRATEGY_FALLBACK_COOLDOWN' });
  }
  return changeStrategy(db, {
    orchestratorId,
    need: fallback.requested,
    reason: `Primary strategy '${currentContract.primaryStrategy}' failed: ${fallback.reason}. Switching to fallback '${fallback.selected}'.`,
    problemProfile: currentContract.contract.problem_profile,
    executionBudget: remainingBudget(activeRun),
    fallbackApproved: true
  });
}

module.exports = { strategySignature, remainingBudget, planAdaptation, changeStrategy, useFallbackStrategyIfPrimaryFailed };
