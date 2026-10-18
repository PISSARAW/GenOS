'use strict';

/**
 * @file dynamicReevaluationExecutorService.js
 * @description Connects adaptiveReevaluationService → MorphogenesisPlanner →
 * MorphogenesisValidator → VersionedTransition. Production transitions
 * currently refuse until authority and restoration can be proven; rejected
 * attempts retain provenance without claiming a commit or rollback.
 */

const adaptiveReevaluationService = require('../adaptiveReevaluationService');
const morphogenesisPlannerService = require('./morphogenesisPlannerService');
const { executeVersionedTransition } = require('./morphogenesisGitService');
const counterfactualPlannerService = require('./counterfactualPlannerService');

const PROVENANCE_SOURCE = 'dynamicReevaluationExecutorService';
const reevaluationHistory = [];
const MAX_HISTORY = 1000;
const COMMIT_CANARY_ENV = 'GENOS_MORPHOGENESIS_COMMIT_CANARY';

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
  return {
    id: `plan_${Date.now()}`,
    actions,
    targetTopology: plannerOutput.selectedTopology || targetOf(plannerOutput, 'topology'),
    targetOrganization: plannerOutput.selectedOrganization || targetOf(plannerOutput, 'organization'),
    conflictCheck: true,
  };
}

function targetOf(plan, field) {
  const changes = Array.isArray(plan.topologyChanges) ? plan.topologyChanges : [];
  return changes.find((change) => change.field === field)?.to || null;
}

function canaryCommitAuthorized(ctx) {
  const enabled = /^(1|true|on)$/i.test(String(process.env[COMMIT_CANARY_ENV] || ''));
  const identity = ctx?.req?.user?.keyId || ctx?.req?.user?.username;
  const tenant = ctx?.req?.tenant;
  return enabled && ctx?.canary === true && Boolean(identity
    && tenant?.organizationId && tenant?.projectId);
}

async function executeReevaluation(ctx) {
  const { agentId, evidence, collectiveState, db, req } = ctx || {};
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
    return { executed: false, reason: 'validation_failed', errors: validation.errors, plan, validation, proposal, counterfactualReceipt };
  }

  // 4. Auto-approve gate
  if (!policy.autoApprove || !canaryCommitAuthorized(ctx)) {
    logProvenance({ agentId, stage: 'approval', status: 'pending', plan });
    const reason = policy.autoApprove ? 'commit_canary_not_authorized' : 'pending_approval';
    return { executed: false, reason, plan, validation, proposal, counterfactualReceipt };
  }

  // 5. Execute versioned transition (ADR 0040 §10) : l'application passe
  // par executeVersionedTransition pour produire un commit AgentGit parenté.
  const transitionPlan = buildTransitionPlan(plan);
  const versioned = await executeVersionedTransition({
    plan: transitionPlan,
    collectiveState,
    db,
    agentId,
    req,
    counterfactual: counterfactualReceipt,
  });
  const receipt = versioned.receipt;
  const transition = transitionOutcome(receipt);

  // 6. Log receipt to provenance
  const provenanceRecord = logProvenance({
    agentId,
    stage: 'transition',
    status: transition.status,
    receipt,
    plan,
  });

  return {
    executed: receipt.committed,
    reason: transition.reason,
    proposal,
    plan,
    receipt,
    provenanceRecord,
    counterfactualReceipt,
  };
}

function transitionOutcome(receipt) {
  if (receipt.committed) return { status: 'committed', reason: 'transition_committed' };
  if (receipt.code === 'MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE') {
    return { status: 'rejected', reason: 'production_authority_unavailable' };
  }
  return { status: 'rolled_back', reason: 'transition_rolled_back' };
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
  buildTransitionPlan,
  executeReevaluation,
  counterfactualPlannerService,
  getReevaluationHistory,
  setReevaluationPolicy,
  canaryCommitAuthorized,
  COMMIT_CANARY_ENV,
};
