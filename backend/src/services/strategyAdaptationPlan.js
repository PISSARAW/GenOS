/**
 * Strategy adaptation planning: contract signatures, adaptation plans, and
 * the transactional strategy change (normal spend vs approved fallback).
 */
const strategyContracts = require('./strategyContractService');
const strategyExecution = require('./strategyExecutionService');
const { buildAutonomyPlan } = require('./autonomousOrchestrationService');
const { withTransaction } = require('../db');
const { validateStrategyTransitionContinuity } = require('./strategyCoherenceValidator');
const { remainingBudget, isBudgetExhausted } = require('./strategyAdaptationBudget');

const ALLOWED_PROBLEM_TYPES = ['incident', 'unknown_cause_bug', 'critical_refactor', 'security', 'scientific_research', 'architecture_decision', 'implementation'];

function signatureProfile(contract) {
  const profile = contract.problem_profile || {};
  return {
    type: profile.type,
    risk: profile.risk,
    evaluability: profile.evaluability,
    reversibility: profile.reversibility,
    requires_reproducibility: profile.requires_reproducibility,
    objectives_conflict: profile.objectives_conflict,
    temporal_dependency: profile.temporal_dependency
  };
}

function signaturePortfolio(contract) {
  const portfolio = contract.strategy_portfolio || [];
  return portfolio.map((strategy) => ({ id: strategy.id, primitives: strategy.primitives || [] }));
}

function strategySignature(contract = {}) {
  return JSON.stringify({
    selected: contract.selected_strategy || {},
    portfolio: signaturePortfolio(contract),
    profile: signatureProfile(contract),
    pipeline: contract.execution_pipeline || [],
    branches: contract.branches || [],
    stopConditions: contract.stop_conditions || [],
    promotion: contract.promotion || {},
    selectionPolicy: contract.selection_policy || {}
  });
}

function requireNeedReason(input) {
  const need = String(input.need || '').trim();
  const reason = String(input.reason || '').trim();
  if (!need) throw Object.assign(new Error('A changed strategy need is required.'), { code: 'STRATEGY_NEED_REQUIRED' });
  if (!reason) throw Object.assign(new Error('An evidence-backed strategy change reason is required.'), { code: 'STRATEGY_REASON_REQUIRED' });
  return { need, reason };
}

function checkProblemType(input) {
  if (input.problemProfile?.type && !ALLOWED_PROBLEM_TYPES.includes(input.problemProfile.type)) {
    throw Object.assign(new Error(`Unknown strategy problem type '${input.problemProfile.type}'.`), { code: 'STRATEGY_PROFILE_INVALID' });
  }
}

function checkCostLevel(input) {
  if (input.maxCostLevel != null && (!Number.isInteger(Number(input.maxCostLevel)) || Number(input.maxCostLevel) < 1 || Number(input.maxCostLevel) > 5)) {
    throw Object.assign(new Error('maxCostLevel must be an integer from 1 to 5.'), { code: 'STRATEGY_POLICY_INVALID' });
  }
}

function planAdaptation(currentContract, input = {}) {
  const { need, reason } = requireNeedReason(input);
  checkProblemType(input);
  checkCostLevel(input);
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

async function loadChangeAgent(db, orchestratorId) {
  let agent = await db.get("SELECT id, workspace_id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", orchestratorId);
  if (!agent) {
    const existing = await db.get('SELECT id, workspace_id FROM agents WHERE id = ?', orchestratorId);
    if (existing) {
      await db.run("UPDATE agents SET execution_mode = 'orchestrator' WHERE id = ?", orchestratorId);
      agent = await db.get("SELECT id, workspace_id FROM agents WHERE id = ?", orchestratorId);
    } else {
      const defaultWs = await db.get('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1');
      await db.run(
        `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, isolation_mode, current_task)
         VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', ?, 'frontier', 'Branch', 'System Mission')`,
        orchestratorId, defaultWs?.id || 'ws-genos-core'
      );
      agent = await db.get("SELECT id, workspace_id FROM agents WHERE id = ?", orchestratorId);
    }
  }
  if (!agent) throw Object.assign(new Error(`Orchestrator '${orchestratorId}' was not found.`), { code: 'ORCHESTRATOR_REQUIRED' });
  return agent;
}

async function loadChangeContract(db, orchestratorId) {
  let current = await strategyContracts.getLatestContract(db, orchestratorId);
  if (!current) {
    current = await strategyContracts.saveContract(db, { agentId: orchestratorId, problem: 'System Mission', createdBy: 'adaptation_auto_provision' });
  }
  return current;
}

function unchangedResult(planned) {
  return {
    changed: false,
    reason: `The current strategy portfolio remains the best fit after evaluating all ${planned.registryEvaluated} strategies.`,
    registryEvaluated: planned.registryEvaluated
  };
}

async function assertTransitionContinuity(change, input) {
  if (change.activeRun && ['planned', 'running'].includes(change.activeRun.status) && input.allowEvidenceReset !== true) {
    const continuity = validateStrategyTransitionContinuity(change.current.contract, change.planned.candidate);
    if (!continuity.coherent) {
      throw Object.assign(new Error(`${continuity.reason} Set allowEvidenceReset=true to start a fresh evidence lineage.`), { code: 'STRATEGY_TRANSITION_INCOHERENT', continuity });
    }
  }
}

function resolveChangeBudget(activeRun, input) {
  if (activeRun && ['planned', 'running'].includes(activeRun.status)) return remainingBudget(activeRun);
  return input.executionBudget;
}

function assertBudgetSpendable(budget, input) {
  if (isBudgetExhausted(budget) && input.fallbackApproved !== true) {
    throw Object.assign(new Error('The strategy cannot change because at least one mission budget is exhausted.'), { code: 'STRATEGY_BUDGET_EXHAUSTED' });
  }
}

async function commitStrategyChange(db, context, budget) {
  const autonomyPlan = buildAutonomyPlan(context.planned.candidate, budget);
  const outcome = await withTransaction(db, async (tx) => {
    const lockedCurrent = await strategyContracts.getLatestContract(tx, context.orchestratorId);
    if (!lockedCurrent || lockedCurrent.id !== context.current.id || lockedCurrent.version !== context.current.version) {
      throw Object.assign(new Error('The strategy contract changed while adaptation was being planned.'), { code: 'STRATEGY_CONCURRENT_CHANGE' });
    }
    let previousRuntimeStopped = false;
    if (context.activeRun && ['planned', 'running'].includes(context.activeRun.status)) {
      const { stopMission } = require('./agentRuntimeAdapter');
      previousRuntimeStopped = stopMission(context.orchestratorId);
    }
    const nextContract = await strategyContracts.saveContract(tx, {
      agentId: context.orchestratorId,
      workspaceId: context.agent.workspace_id,
      contract: context.planned.candidate,
      decisionReason: context.planned.reason,
      createdBy: 'runtime_orchestrator_adaptation',
      _inTransaction: true
    });
    const run = await strategyExecution.createExecutionRun(tx, {
      agentId: context.orchestratorId,
      contractRecord: nextContract,
      budget
    });
    if (context.activeRun && ['planned', 'running'].includes(context.activeRun.status)) {
      await tx.run(
        "UPDATE strategy_execution_steps SET status = 'skipped', completed_at = CURRENT_TIMESTAMP WHERE run_id = ? AND status IN ('planned', 'running')",
        context.activeRun.id
      );
      await tx.run(
        "UPDATE strategy_execution_runs SET status = 'cancelled', guardrail_reason = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        `Superseded by strategy contract v${nextContract.version}: ${context.planned.reason}`, context.activeRun.id
      );
    }
    return { selected: nextContract, nextRun: run, previousRuntimeStopped };
  });
  const selected = outcome.selected;
  const nextRun = outcome.nextRun;
  return {
    changed: true,
    reason: context.planned.reason,
    registryEvaluated: context.planned.registryEvaluated,
    selectionComplete: selected.contract.strategy_registry.selection_complete,
    previous: { contractId: context.current.id, version: context.current.version, primary: context.current.primaryStrategy },
    current: {
      contractId: selected.id,
      version: selected.version,
      primary: selected.primaryStrategy,
      portfolio: selected.contract.strategy_portfolio.map((strategy) => strategy.id),
      problemProfile: selected.contract.problem_profile
    },
    executionRun: { previousRunId: context.activeRun?.id || null, runId: nextRun.id, remainingBudget: nextRun.budget, previousRuntimeStopped: outcome.previousRuntimeStopped },
    recommendedOrganization: autonomyPlan.organization,
    decisionGates: autonomyPlan.decisionGates
  };
}

async function changeStrategy(db, input = {}) {
  const orchestratorId = String(input.orchestratorId || '').trim();
  const agent = await loadChangeAgent(db, orchestratorId);
  const current = await loadChangeContract(db, orchestratorId);
  const planned = planAdaptation(current.contract, input);
  if (!planned.changed) return unchangedResult(planned);
  const activeRun = await strategyExecution.getLatestRun(db, orchestratorId);
  await assertTransitionContinuity({ current, planned, activeRun }, input);
  const budget = resolveChangeBudget(activeRun, input);
  assertBudgetSpendable(budget, input);
  return commitStrategyChange(db, { orchestratorId, agent, current, planned, activeRun }, budget);
}

module.exports = {
  strategySignature,
  planAdaptation,
  changeStrategy
};
