'use strict';
const { emit } = require('./agentOrchestrationState');
const decisions = require('./orchestrationDecisionService');
const evidence = require('./agentEvidenceService');

function reportFailure({ ownerId, agentId, event, decision, error }) {
  const failure = { sourceAgentId: agentId, sourceEvent: event.eventType, eventId: event.id,
    tool: decision.tool, error: error?.message || String(error) };
  emit(ownerId, 'ORCHESTRATION_ACTION_FAILED', decision.action, `Orchestration action '${decision.action}' raised an exception.`, failure, 'error', 'error');
  return failure;
}

function workerFailure(ctx, eventType) {
  return ctx.dispatchedAgent.execution_mode === 'worker'
    && ['WORKER_TASK_FAILED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
}

async function handle(ctx, event, eventType) {
  if (!decisions.isDecisionEvent(event)) return;
  if (workerFailure(ctx, eventType)) return;
  const ownerId = ctx.normalizedMission.orchestratorAgentId || ctx.agentId;
  if (!evidence.hasDecisionEvidence(event)) {
    emit(ownerId, 'ORCHESTRATION_DECISION_BLOCKED', 'EVIDENCE_GATE', evidence.decisionEvidenceFailure(event),
      { sourceAgentId: ctx.agentId, sourceEvent: eventType }, 'warning', 'blocked');
    return;
  }
  const decision = decisions.decideFromEvent(event);
  if (!decision) return;
  try {
    const agent = await ctx.db.get('SELECT parent_agent_id FROM agents WHERE id = ?', ctx.agentId);
    const orchestratorId = agent?.parent_agent_id || ownerId;
    emit(orchestratorId, 'ORCHESTRATION_DECISION', decision.action, decision.reason,
      { sourceAgentId: ctx.agentId, sourceEvent: eventType, ...decision }, 'info');
    return await require('./orchestrationActionExecutor').execute({
      orchestratorId, sourceAgentId: ctx.agentId, decision, event, workspaceRoot: ctx.workspaceRoot
    });
  } catch (error) {
    ctx.state.orchestrationActionFailure = reportFailure({ ownerId, agentId: ctx.agentId, event, decision, error });
  }
}

module.exports = { handle, reportFailure };
