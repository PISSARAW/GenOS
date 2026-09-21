'use strict';

function workerLaunchPayload(args) {
  const { context, member, workerId, parent } = args;
  return {
    action: 'dispatch_worker',
    background: false,
    orchestratorId: context.orchestratorId,
    workerId,
    mission: member.mission || '',
    role: member.role,
    model_tier: member.modelTier,
    ...(member.name ? { name: member.name } : {}),
    execution_budget: context.request?.execution_budget || context.request?.executionBudget,
    timeoutMs: context.request?.timeoutMs,
    workspace_root: context.request?.workspace_root || parent?.workspace_root || process.env.GENOS_WORKSPACE_ROOT,
    reuseChecked: true,
  };
}

module.exports = { workerLaunchPayload };
