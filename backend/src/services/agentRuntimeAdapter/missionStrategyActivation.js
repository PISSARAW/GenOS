'use strict';

const workerKinds = require('../agents/workerKindService');
const workerLimits = require('../agents/workerRuntimeLimitsService');

function strategyInput(ctx) {
  const mission = ctx.normalizedMission || {};
  const plan = ctx.autonomyPlan || {};
  const capabilityPlan = mission.missionCapabilityPlan || {};
  return {
    mission: missionText(mission),
    profile: missionProfile(ctx),
    selectedTopology: selectedTopology(plan),
    selectedVariant: selectedVariant(plan),
    currentRecipe: currentRecipe(plan, mission),
    availableCapabilities: capabilities(capabilityPlan, plan),
    availableTopologyCapabilities: topologyCapabilities(mission, plan),
    operationalConstraints: operationalConstraints(plan),
    runtimeSnapshot: runtimeSnapshot(ctx),
    freeWorkerPool: freePool(ctx),
    daemonInventory: daemonInventory(ctx),
    budget: missionBudget(mission, plan),
    workerAssignments: assignments(plan)
  };
}

function selectedVariant(plan) {
  if (plan.morphogenesisPlan) return plan.morphogenesisPlan.selectedVariant || 'default';
  return 'default';
}

function currentRecipe(plan, mission) {
  if (plan.morphogenesisPlan) return plan.morphogenesisPlan.morphologyExpression || null;
  return mission.morphologyExpression || null;
}

function operationalConstraints(plan) {
  if (plan.operationalConstraints) return plan.operationalConstraints;
  return {};
}

function runtimeSnapshot(ctx) {
  if (ctx.workerRuntimeSnapshot) return ctx.workerRuntimeSnapshot;
  return { status: 'unknown', workers: [], reason: 'runtime_snapshot_not_loaded' };
}

function freePool(ctx) {
  if (ctx.freeWorkerPool) return ctx.freeWorkerPool;
  return null;
}

function daemonInventory(ctx) {
  if (ctx.daemonInventory) return ctx.daemonInventory;
  return null;
}

function topologyCapabilities(mission, plan) {
  const capabilityPlan = mission.missionCapabilityPlan || {};
  const inventory = mission.topologyCapabilityInventory || plan.topologyCapabilityInventory || {};
  const declared = inventory.available || capabilityPlan.availableTopologyCapabilities;
  return Array.isArray(declared) ? [...declared] : null;
}

function missionText(mission) { return mission.prompt || mission.currentTask || ''; }
function missionProfile(ctx) {
  return { ...(ctx.contractRecord?.contract?.problem_profile || {}), ...(ctx.autonomyPlan?.profile || {}) };
}
function selectedTopology(plan) { return plan.morphogenesisPlan?.selectedTopology || plan.selectedTopology || null; }
function declaredCapabilities(capabilityPlan, plan) {
  if (Array.isArray(capabilityPlan.availableCapabilities)) return capabilityPlan.availableCapabilities;
  return Array.isArray(plan.capabilityInventory?.available) ? plan.capabilityInventory.available : [];
}
function capabilities(capabilityPlan, plan) {
  const declared = declaredCapabilities(capabilityPlan, plan);
  const workers = Array.isArray(plan.dispatchWorkers) ? plan.dispatchWorkers : [];
  const available = workers.flatMap((worker) => workerKinds.KIND_CAPABILITIES[worker.workerKind] || []);
  return [...new Set([...declared, ...available])];
}
function missionBudget(mission, plan) {
  return { tokens: plan.tokenPolicy?.total || mission.executionBudget?.tokens || 0 };
}
function assignments(plan) {
  return Array.isArray(plan.dispatchWorkers) ? plan.dispatchWorkers.map((worker) => ({ ...worker })) : [];
}

function compatibleBinding(phase, worker) {
  if (!phase || !worker || !phase.methodContract || !phase.workerKind) return false;
  if (worker.workerKind !== phase.workerKind || worker.methodContract || worker.workerAssignment?.methodContract) return false;
  try {
    workerKinds.assertMethodCompatibility(worker.workerKind, phase.methodContract);
    workerLimits.assertWorkerExecutorAvailable({ workerKind: worker.workerKind, methodContract: phase.methodContract });
    return true;
  } catch (_) {
    return false;
  }
}

function findBinding(strategy, workers) {
  for (const phase of Array.isArray(strategy?.phases) ? strategy.phases : []) {
    const workerIndex = workers.findIndex((worker) => compatibleBinding(phase, worker));
    if (workerIndex >= 0) return { phase, workerIndex };
  }
  return null;
}

function hasExplicitMethod(mission) {
  const assignments = mission.workerAssignments || mission.worker_assignments;
  return Boolean(mission.methodContract || mission.workerContract?.mission?.methodContract
    || (Array.isArray(assignments) && assignments.some((worker) => worker?.methodContract)));
}

function applyMissionStrategyToContext(ctx, strategy) {
  const plan = ctx.autonomyPlan;
  const mission = ctx.normalizedMission;
  if (!plan || !mission) return { attached: false, reason: 'mission_context_unavailable' };
  const workers = Array.isArray(plan.dispatchWorkers) ? plan.dispatchWorkers : [];
  const explicit = hasExplicitMethod(mission);
  const binding = !explicit && strategy?.status === 'proposed' ? findBinding(strategy, workers) : null;
  const activation = binding
    ? { status: 'method_contract_attached', phaseId: binding.phase.id, workerIndex: binding.workerIndex }
    : { status: 'advisory', reason: advisoryReason(strategy, explicit) };
  const attached = { ...strategy, activation };
  if (binding) workers[binding.workerIndex].methodContract = { ...binding.phase.methodContract };
  plan.morphogenesisStrategy = attached;
  mission.morphogenesisStrategy = attached;
  return { attached: Boolean(binding), strategy: attached, activation };
}

function advisoryReason(strategy, explicit) {
  if (strategy?.status === 'blocked') return 'strategy_blocked';
  return explicit ? 'explicit_method_contract_present' : 'compatible_dispatch_worker_unavailable';
}

function compileAndAttachMissionStrategy(ctx, dependencies = {}) {
  if (!ctx?.autonomyPlan || !ctx.normalizedMission) return { attached: false, reason: 'mission_context_unavailable' };
  const compiler = dependencies.compileMissionStrategy
    || require('../morphogenesis/missionStrategyCompiler').compileMissionStrategy;
  try {
    const strategy = compiler(strategyInput(ctx));
    if (!strategy || !['proposed', 'blocked'].includes(strategy.status) || !Array.isArray(strategy.phases)) {
      return { attached: false, reason: 'strategy_proposal_invalid' };
    }
    return applyMissionStrategyToContext(ctx, strategy);
  } catch (error) {
    return { attached: false, reason: 'strategy_compilation_failed', error: error.message };
  }
}

module.exports = { compileAndAttachMissionStrategy, applyMissionStrategyToContext, strategyInput };
