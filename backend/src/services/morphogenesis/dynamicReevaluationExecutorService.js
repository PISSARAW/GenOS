'use strict';

/**
 * @file dynamicReevaluationExecutorService.js
 * @description Connects adaptiveReevaluationService → MorphogenesisPlanner →
 * MorphogenesisValidator → TransitionEngine, closing the re-evaluation loop.
 * Produces a MorphogenesisReceipt with full provenance for every transition.
 */

const adaptiveReevaluationService = require('../adaptiveReevaluationService');
const morphogenesisPlannerService = require('./morphogenesisPlannerService');
const transitionEngineService = require('./transitionEngineService');

const PROVENANCE_SOURCE = 'dynamicReevaluationExecutorService';
const reevaluationHistory = [];
const MAX_HISTORY = 1000;

let policy = {
  autoApprove: false,
  maxRetire: 5,
  maxSpawn: 5,
  minPreserve: 1,
  maxBudgetImpact: 10000,
};

function logProvenance(record) {
  const entry = {
    id: `dreeval_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    provenance: PROVENANCE_SOURCE,
    ...record,
  };
  reevaluationHistory.push(entry);
  if (reevaluationHistory.length > MAX_HISTORY) reevaluationHistory.shift();
  return entry;
}

function extractProposedTopology(events) {
  if (!events || !events.length) return {};
  const topoEvent = events.find((e) => e.type === 'TOPOLOGY_CHANGE_REQUESTED');
  if (topoEvent && topoEvent.detail && topoEvent.detail.proposedMode) {
    return { mode: topoEvent.detail.proposedMode };
  }
  return {};
}

function buildPlannerCtx(collectiveState, proposal) {
  const cs = collectiveState || {};
  const currentState = {
    topologyState: cs.topologyState || {},
    agents: cs.agents || new Map(),
    budgets: cs.budgets || {},
  };
  const proposedTopology = extractProposedTopology(proposal.events);
  return { currentState, proposedTopology, budget: cs.budgets || {} };
}

function buildTransitionPlan(plannerOutput) {
  const actions = [];
  for (const s of plannerOutput.spawnAgents || []) {
    actions.push({ type: 'spawn', role: s.role, phenotype: s.phenotype, capabilities: s.capabilities });
  }
  for (const r of plannerOutput.retireAgents || []) {
    actions.push({ type: 'retire', agentId: r.agentId });
  }
  for (const rb of plannerOutput.rebindAgents || []) {
    actions.push({ type: 'rebind', agentId: rb.agentId, targetRole: rb.phenotype });
  }
  const topoTo = (plannerOutput.topologyChanges && plannerOutput.topologyChanges.to) || {};
  return {
    id: `plan_${Date.now()}`,
    actions,
    targetOrganization: topoTo.organization,
    conflictCheck: true,
  };
}

async function executeReevaluation(ctx) {
  const { agentId, evidence, collectiveState, db } = ctx || {};
  if (!agentId) {
    return { executed: false, reason: 'invalid_context' };
  }

  // 1. Adaptive re-evaluation sensor
  const proposal = adaptiveReevaluationService.maybeReevaluate({ agentId, evidence });
  if (!proposal.reevaluated) {
    return { executed: false, reason: proposal.reason, regret: proposal.regret };
  }

  // 2. Plan morphogenesis
  const plannerCtx = buildPlannerCtx(collectiveState, proposal);
  let plan;
  try {
    plan = morphogenesisPlannerService.planMorphogenesis(plannerCtx);
  } catch (err) {
    logProvenance({ agentId, stage: 'planning', status: 'failed', error: err.message });
    return { executed: false, reason: 'planning_failed', error: err.message };
  }

  // 3. Validate plan
  const validation = morphogenesisPlannerService.validatePlan({ plan, constraints: policy });
  if (!validation.valid) {
    logProvenance({ agentId, stage: 'validation', status: 'failed', errors: validation.errors });
    return { executed: false, reason: 'validation_failed', errors: validation.errors, plan };
  }

  // 4. Auto-approve gate
  if (!policy.autoApprove) {
    logProvenance({ agentId, stage: 'approval', status: 'pending', plan });
    return { executed: false, reason: 'pending_approval', plan, validation };
  }

  // 5. Execute transition
  const transitionPlan = buildTransitionPlan(plan);
  const receipt = await transitionEngineService.executeTransition({
    plan: transitionPlan,
    collectiveState,
    db,
  });

  // 6. Log receipt to provenance
  const provenanceRecord = logProvenance({
    agentId,
    stage: 'transition',
    status: receipt.committed ? 'committed' : 'rolled_back',
    receipt,
    plan,
  });

  return {
    executed: receipt.committed,
    reason: receipt.committed ? 'transition_committed' : 'transition_rolled_back',
    proposal,
    plan,
    receipt,
    provenanceRecord,
  };
}

function getReevaluationHistory(agentId) {
  if (!agentId) return [...reevaluationHistory].reverse();
  return reevaluationHistory.filter((r) => r.agentId === agentId).reverse();
}

function setReevaluationPolicy(ctx) {
  const updates = ctx || {};
  if (updates.autoApprove != null) policy.autoApprove = Boolean(updates.autoApprove);
  if (updates.maxRetire != null) policy.maxRetire = Number(updates.maxRetire);
  if (updates.maxSpawn != null) policy.maxSpawn = Number(updates.maxSpawn);
  if (updates.minPreserve != null) policy.minPreserve = Number(updates.minPreserve);
  if (updates.maxBudgetImpact != null) policy.maxBudgetImpact = Number(updates.maxBudgetImpact);
  if (updates.rateLimitMs != null) adaptiveReevaluationService.configure({ rateLimitMs: Number(updates.rateLimitMs) });
  if (updates.regretThreshold != null) adaptiveReevaluationService.configure({ regretThreshold: Number(updates.regretThreshold) });
  return { ...policy };
}

module.exports = {
  executeReevaluation,
  getReevaluationHistory,
  setReevaluationPolicy,
};
