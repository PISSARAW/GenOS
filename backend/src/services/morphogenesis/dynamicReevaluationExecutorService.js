'use strict';

/**
 * @file dynamicReevaluationExecutorService.js
 * @description Connects adaptiveReevaluationService → MorphogenesisPlanner →
 * MorphogenesisValidator → VersionedTransition (ADR 0040 §10 : toute
 * transition appliquée produit un commit AgentGit parenté).
 * Produces a MorphogenesisReceipt with full provenance for every transition.
 */

const adaptiveReevaluationService = require('../adaptiveReevaluationService');
const morphogenesisPlannerService = require('./morphogenesisPlannerService');
const { executeVersionedTransition } = require('./morphogenesisGitService');
const counterfactualPlannerService = require('./counterfactualPlannerService');

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

  // 1.5 Counterfactual analysis: fork worlds, compare causal effects
  let counterfactualReceipt = null;
  try {
    counterfactualReceipt = await counterfactualPlannerService.runCounterfactualLifecycle({
      db,
      collectiveState,
      agentId,
      types: ['strategy', 'capability', 'dna', 'plasmid', 'communication_policy', 'relationship', 'worker_allocation'],
      protocol: { steps: ['evaluate', 'compare', 'promote'] },
    });
    logProvenance({ agentId, stage: 'counterfactual', status: 'completed', receipt: counterfactualReceipt });
  } catch (cfErr) {
    logProvenance({ agentId, stage: 'counterfactual', status: 'failed', error: cfErr.message });
  }

  // 2. Plan morphogenesis
  const plannerCtx = buildPlannerCtx(collectiveState, proposal);
  let plan;
  try {
    plan = morphogenesisPlannerService.planMorphogenesis(plannerCtx);
  } catch (err) {
    logProvenance({ agentId, stage: 'planning', status: 'failed', error: err.message });
    return { executed: false, reason: 'planning_failed', error: err.message, proposal, counterfactualReceipt };
  }

  // 3. Validate plan
  const validation = morphogenesisPlannerService.validatePlan({ plan, constraints: policy });
  if (!validation.valid) {
    logProvenance({ agentId, stage: 'validation', status: 'failed', errors: validation.errors });
    return { executed: false, reason: 'validation_failed', errors: validation.errors, plan, proposal, counterfactualReceipt };
  }

  // 4. Auto-approve gate
  if (!policy.autoApprove) {
    logProvenance({ agentId, stage: 'approval', status: 'pending', plan });
    return { executed: false, reason: 'pending_approval', plan, validation, proposal, counterfactualReceipt };
  }

  // 5. Execute versioned transition (ADR 0040 §10) : l'application passe
  // par executeVersionedTransition pour produire un commit AgentGit parenté.
  const transitionPlan = buildTransitionPlan(plan);
  const versioned = await executeVersionedTransition({
    plan: transitionPlan,
    collectiveState,
    db,
    agentId,
    counterfactual: counterfactualReceipt,
  });
  const receipt = versioned.receipt;

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
    counterfactualReceipt,
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
  counterfactualPlannerService,
  getReevaluationHistory,
  setReevaluationPolicy,
};
