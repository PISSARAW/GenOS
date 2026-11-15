'use strict';

const { executeVersionedTransition } = require('../morphogenesisGitService');

function assertPlanBinding(morphology, plan) {
  const targets = [plan.targetTopology, plan.targetOrganization].filter(Boolean);
  if (morphology.topology && targets.some((target) => target !== morphology.topology)) {
    throw Object.assign(new Error('Transition plan target differs from the evaluated morphology.'), {
      code: 'MORPHOGENESIS_PLAN_TARGET_MISMATCH'
    });
  }
}

function valueOr(candidate, fallback) {
  return candidate ?? fallback;
}

function planTarget(morphology, supplied) {
  return morphology.topology || supplied.targetTopology || supplied.targetOrganization;
}

function planReason(input) {
  return input.supplied.reason || input.options.reason
    || `morphogenesis strategy=${input.morphology.strategy}`;
}

function generatedActions(input) {
  const context = input.options.runtimeContext || {};
  const parentAgentId = context.agentId || input.options.orchestratorId;
  return (input.morphology.agents || []).map((agent, index) => ({
    type: 'spawn', agentId: agent.agentId || `${input.planId}-agent-${index}`,
    parentAgentId, role: agent.role || `agent_${index}`,
    phenotype: agent.phenotype || {}, workspace: agent.workspace
  }));
}

function transitionPlan(input) {
  const { morphology, options } = input;
  const supplied = options.transitionPlan || {};
  const context = options.runtimeContext || {};
  const target = planTarget(morphology, supplied);
  return {
    ...supplied, id: valueOr(supplied.id, input.planId),
    missionId: valueOr(supplied.missionId, context.missionId),
    targetTopology: valueOr(supplied.targetTopology, target),
    targetOrganization: valueOr(supplied.targetOrganization, target),
    expectedGain: valueOr(supplied.expectedGain, options.expectedGain),
    expectedRisk: valueOr(supplied.expectedRisk, options.expectedRisk),
    reason: planReason({ supplied, options, morphology }),
    actions: valueOr(supplied.actions, generatedActions(input))
  };
}

function bridgeContext(input) {
  const runtime = input.options.runtimeContext || {};
  return {
    ...runtime, db: input.db, plan: input.plan,
    agentId: runtime.agentId || input.options.orchestratorId,
    missionId: runtime.missionId || input.plan.missionId,
    collectiveState: runtime.collectiveState
  };
}

function normalizedResult(input) {
  const receipt = input.versioned.receipt || {};
  const committed = receipt.committed === true;
  return {
    ...receipt, applied: committed, proposed: !committed, committed,
    decision: committed ? 'APPLIED' : (receipt.decision || 'REJECTED'),
    agents: input.morphology.agents, topology: input.morphology.topology,
    commitId: input.versioned.commit?.id || null,
    transitionId: receipt.transitionId || null, receipt,
    variantId: input.morphology.variantId || null
  };
}

async function execute(input) {
  const planId = `morpho_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const plan = transitionPlan({ ...input, planId });
  assertPlanBinding(input.morphology, plan);
  const versioned = await executeVersionedTransition(bridgeContext({ ...input, plan }));
  return normalizedResult({ ...input, versioned });
}

module.exports = { execute, transitionPlan };
