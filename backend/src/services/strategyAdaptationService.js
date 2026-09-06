const strategyContracts = require('./strategyContractService');
const strategyExecution = require('./strategyExecutionService');
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const { withTransaction } = require('../db');

function strategySignature(contract = {}) {
  return JSON.stringify({
    selected: contract.selected_strategy || {},
    portfolio: (contract.strategy_portfolio || []).map((strategy) => ({ id: strategy.id, primitives: strategy.primitives || [] })),
    profile: {
      type: contract.problem_profile?.type,
      risk: contract.problem_profile?.risk,
      evaluability: contract.problem_profile?.evaluability,
      reversibility: contract.problem_profile?.reversibility,
      requires_reproducibility: contract.problem_profile?.requires_reproducibility,
      objectives_conflict: contract.problem_profile?.objectives_conflict,
      temporal_dependency: contract.problem_profile?.temporal_dependency
    },
    pipeline: contract.execution_pipeline || [],
    branches: contract.branches || [],
    stopConditions: contract.stop_conditions || [],
    promotion: contract.promotion || {},
    selectionPolicy: contract.selection_policy || {}
  });
}

function remainingBudget(run, now = Date.now()) {
  if (!run) return null;
  const remaining = {};
  for (const key of ['tokens', 'costUsd', 'latencyMs', 'events']) {
    const consumed = key === 'latencyMs' && run.startedAt
      ? Math.max(Number(run.metrics?.latencyMs || 0), now - new Date(run.startedAt).getTime())
      : Number(run.metrics?.[key] || 0);
    remaining[key] = Math.max(0, Number(run.budget?.[key] || 0) - consumed);
  }
  return remaining;
}

async function useFallbackStrategyIfPrimaryFailed(db, orchestratorId) {
  // Detect if the primary strategy has failed and switch to fallback if available.
  const currentContract = await strategyContracts.getLatestContract(db, orchestratorId);
  if (!currentContract) return null;
  const fallback = currentContract.contract.selected_strategy?.fallback;
  if (!fallback) return null;
  const activeRun = await strategyExecution.getLatestRun(db, orchestratorId);
  const hasFailed = activeRun && activeRun.status === 'cancelled'
    && activeRun.guardrailReason
    && activeRun.guardrailReason.includes('Primary strategy failed or produced insufficient evidence');
  if (!hasFailed) return null;
  return changeStrategy(db, {
    orchestratorId,
    need: fallback.requested,
    reason: `Primary strategy '${currentContract.primaryStrategy}' failed: ${fallback.reason}. Switching to fallback '${fallback.selected}'.`,
    problemProfile: currentContract.contract.problem_profile,
    executionBudget: remainingBudget(activeRun)
  });
}

function planAdaptation(currentContract, input = {}) {
  const need = String(input.need || '').trim();
  const reason = String(input.reason || '').trim();
  if (!need) throw Object.assign(new Error('A changed strategy need is required.'), { code: 'STRATEGY_NEED_REQUIRED' });
  if (!reason) throw Object.assign(new Error('An evidence-backed strategy change reason is required.'), { code: 'STRATEGY_REASON_REQUIRED' });
  const allowedTypes = new Set(['incident', 'unknown_cause_bug', 'critical_refactor', 'security', 'scientific_research', 'architecture_decision', 'implementation']);
  if (input.problemProfile?.type && !allowedTypes.has(input.problemProfile.type)) {
    throw Object.assign(new Error(`Unknown strategy problem type '${input.problemProfile.type}'.`), { code: 'STRATEGY_PROFILE_INVALID' });
  }
  if (input.maxCostLevel != null && (!Number.isInteger(Number(input.maxCostLevel)) || Number(input.maxCostLevel) < 1 || Number(input.maxCostLevel) > 5)) {
    throw Object.assign(new Error('maxCostLevel must be an integer from 1 to 5.'), { code: 'STRATEGY_POLICY_INVALID' });
  }
  const candidate = strategyContracts.buildStrategyContract({
    problem: need,
    problemProfile: input.problemProfile,
    maxCostLevel: input.maxCostLevel,
    allowExperimental: input.allowExperimental === true,
    allowPrototype: input.allowPrototype === true,
    allowExperimentalAtHighRisk: input.allowExperimentalAtHighRisk === true
  });
  return {
    need,
    reason,
    candidate,
    changed: strategySignature(currentContract) !== strategySignature(candidate),
    registryEvaluated: candidate.strategy_decisions.length
  };
}

async function changeStrategy(db, input = {}) {
  const orchestratorId = String(input.orchestratorId || '').trim();
  const agent = await db.get("SELECT id, workspace_id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
  if (!agent) throw Object.assign(new Error(`Orchestrator '${orchestratorId}' was not found.`), { code: 'ORCHESTRATOR_REQUIRED' });
  const current = await strategyContracts.getLatestContract(db, orchestratorId);
  if (!current) throw Object.assign(new Error(`No strategy contract is available for orchestrator '${orchestratorId}'.`), { code: 'STRATEGY_CONTRACT_REQUIRED' });
  const planned = planAdaptation(current.contract, input);
  if (!planned.changed) {
    return {
      changed: false,
      reason: `The current strategy portfolio remains the best fit after evaluating all ${planned.registryEvaluated} strategies.`,
      registryEvaluated: planned.registryEvaluated,
      previous: { contractId: current.id, version: current.version, primary: current.primaryStrategy },
      current: { contractId: current.id, version: current.version, primary: current.primaryStrategy, portfolio: current.contract.strategy_portfolio.map((strategy) => strategy.id) }
    };
  }

  const activeRun = await strategyExecution.getLatestRun(db, orchestratorId);
  const budget = activeRun && ['planned', 'running'].includes(activeRun.status)
    ? remainingBudget(activeRun)
    : input.executionBudget;
  if (budget && Object.values(budget).some((value) => value <= 0)) {
    throw Object.assign(new Error('The strategy cannot change because at least one mission budget is exhausted.'), { code: 'STRATEGY_BUDGET_EXHAUSTED' });
  }

  const autonomyPlan = buildAutonomyPlan(planned.candidate, budget);

  const { selected, nextRun, previousRuntimeStopped } = await withTransaction(db, async (tx) => {
    const lockedCurrent = await strategyContracts.getLatestContract(tx, orchestratorId);
    if (!lockedCurrent || lockedCurrent.id !== current.id || lockedCurrent.version !== current.version) {
      throw Object.assign(new Error('The strategy contract changed while adaptation was being planned.'), { code: 'STRATEGY_CONCURRENT_CHANGE' });
    }
    let previousRuntimeStopped = false;
    if (activeRun && ['planned', 'running'].includes(activeRun.status)) {
      const { stopMission } = require('./agentRuntimeAdapter');
      previousRuntimeStopped = stopMission(orchestratorId);
    }
    const nextContract = await strategyContracts.saveContract(tx, {
      agentId: orchestratorId,
      workspaceId: agent.workspace_id,
      contract: planned.candidate,
      decisionReason: planned.reason,
      createdBy: 'runtime_orchestrator_adaptation',
      _inTransaction: true
    });
    const run = await strategyExecution.createExecutionRun(tx, {
      agentId: orchestratorId,
      contractRecord: nextContract,
      budget
    });
    if (activeRun && ['planned', 'running'].includes(activeRun.status)) {
      await tx.run(
        "UPDATE strategy_execution_steps SET status = 'skipped', completed_at = CURRENT_TIMESTAMP WHERE run_id = ? AND status IN ('planned', 'running')",
        activeRun.id
      );
      await tx.run(
        "UPDATE strategy_execution_runs SET status = 'cancelled', guardrail_reason = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        `Superseded by strategy contract v${nextContract.version}: ${planned.reason}`, activeRun.id
      );
    }
    return { selected: nextContract, nextRun: run, previousRuntimeStopped };
  });
  return {
    changed: true,
    reason: planned.reason,
    registryEvaluated: planned.registryEvaluated,
    selectionComplete: selected.contract.strategy_registry.selection_complete,
    previous: { contractId: current.id, version: current.version, primary: current.primaryStrategy },
    current: {
      contractId: selected.id,
      version: selected.version,
      primary: selected.primaryStrategy,
      portfolio: selected.contract.strategy_portfolio.map((strategy) => strategy.id),
      problemProfile: selected.contract.problem_profile
    },
    executionRun: { previousRunId: activeRun?.id || null, runId: nextRun.id, remainingBudget: nextRun.budget, previousRuntimeStopped },
    recommendedOrganization: autonomyPlan.organization,
    decisionGates: autonomyPlan.decisionGates
  };
}

module.exports = { strategySignature, remainingBudget, planAdaptation, changeStrategy, useFallbackStrategyIfPrimaryFailed };
