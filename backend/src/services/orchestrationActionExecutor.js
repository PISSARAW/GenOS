const mcp = require('./mcpExecutor');
const telemetry = require('./telemetryObserver');
const { getDatabase } = require('../db');
const receipts = require('./orchestrationActionReceiptService');
const { actionArguments } = require('./orchestrationActionArguments');
const { normalizeActionResult, verifiedResult } = require('./orchestrationActionResult');

async function execute({ orchestratorId, sourceAgentId, decision, event, workspaceRoot }) {
  const sourceEventId = String(event.id || '').trim();
  if (!sourceEventId) return { executed: false, deferred: true, reason: 'missing_event_identity' };
  const context = { orchestratorId, sourceAgentId, decision, event, workspaceRoot, sourceEventId, db: await getDatabase() };
  if (await receipts.claim(context)) {
    emitDeduplicated(context);
    return { executed: false, duplicate: true };
  }
  const args = actionArguments(decision, event, workspaceRoot);
  if (!args) return deferAction(context);
  if (decision.tool === 'genos_record_experience') args.agentId = sourceAgentId;
  await recordEfference(context);
  return runAction(context, args);
}

async function recordEfference(context) {
  try {
    await require('./efferenceCopyService').predict(null, context.orchestratorId, {
      actionId: context.sourceEventId || context.decision.action,
      action: context.decision.action,
      tool: context.decision.tool,
      expectedTypes: ['ORCHESTRATION_ACTION_EXECUTED', 'ORCHESTRATION_ACTION_FAILED', 'AGENT_STEP', 'EVIDENCE_REPORT']
    });
    await require('./worldModelService').predictTransition(null, context.orchestratorId, {
      actionId: context.sourceEventId || context.decision.action,
      action: context.decision.action
    });
  } catch (_) {}
}

function emitDeduplicated(context) {
  telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEDUPLICATED', agentId: context.orchestratorId, action: context.decision.action, detail: 'Duplicate orchestration action suppressed.', severity: 'info', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, eventId: context.sourceEventId } });
}

async function deferAction(context) {
  telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEFERRED', agentId: context.orchestratorId, action: context.decision.action, detail: 'Decision retained until its required evidence is available.', severity: 'info', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, reason: context.decision.reason, eventId: context.event.id } });
  await receipts.finish(context, { status: 'failed', deferred: true, result: { reason: 'missing_required_evidence' } });
  return { executed: false, deferred: true, reason: 'missing_required_evidence' };
}

async function runAction(context, args) {
  let result;
  const stopHeartbeat = receipts.heartbeat(context);
  try {
    await require('./missionEnvelopeAuthority').assertTool(context.db, {
      agentId: context.orchestratorId, toolName: context.decision.tool });
    if (context.decision.organization) await require('./agentRecoveryService').applyOrganizationDecision(context.orchestratorId, context.decision.organization, context.decision.reason);
    result = await mcp.execute({ agentId: context.orchestratorId, toolName: context.decision.tool, args });
    result = verifiedResult(context, args, result);
  } catch (error) {
    result = { success: false, status: 'failed', error: error.message || String(error) };
    await stopHeartbeat();
    await receipts.finish(context, { status: 'failed', result });
    await emitExecution(context, args, result);
    throw error;
  }
  await stopHeartbeat();
  const owned = await receipts.finish(context, { status: result.success ? 'completed' : 'failed', result });
  if (!owned) result = { success: false, status: 'lease_lost', error: 'Action receipt ownership changed before completion.' };
  await emitExecution(context, args, result);
  await linkCausality(context, result);
  if (result.success && context.decision.tool === 'genos_record_experience') await compileMemorySafely(context, args);
  try {
    await require('./swarmTopologyRuntimeService').applyStepsForOrchestrator(context.orchestratorId, { db: context.db || undefined, steps: 3 });
  } catch (err) {
    console.error(`[OrchestrationActionExecutor] Error applying step for orchestrator ${context.orchestratorId}:`, err.message);
  }
  return { executed: result.success, result };
}

async function observeOutcome(context, result, detail) {
  try {
    const worldModel = require('./worldModelService');
    const observed = await worldModel.observeTransition(null, context.orchestratorId, {
      actionId: context.sourceEventId || context.decision.action,
      success: result.success === true,
      detail
    });
    const delta = { success: result.success === true, costUsd: result.costUsd, latencyMs: result.latencyMs };
    const keys = [...new Set([context.decision.tool, context.decision.action, result.servedModel || result.model].filter((key) => typeof key === 'string' && !!key))];
    for (const key of keys) {
      await worldModel.recordSample(null, context.orchestratorId, { action: key, delta });
    }
    return observed;
  } catch (_) {
    return { matched: false, surprise: 0 };
  }
}

async function linkCausality(context, result) {
  try {
    await require('./causalLedgerService').link(context.db, {
      agentId: context.orchestratorId,
      kind: result.success ? 'action_executed' : 'action_failed',
      causeIds: [context.sourceEventId, context.event.id].filter(Boolean),
      summary: `${context.decision.action}:${context.decision.tool}`
    });
  } catch (_) {}
}

async function emitExecution(context, args, result) {
  const success = result.success;
  const detail = success ? `Executed ${context.decision.tool}.` : `Could not execute ${context.decision.tool}: ${result.error || result.status}`;
  const outcome = await observeOutcome(context, result, detail);
  telemetry.emitEvent({ eventType: success ? 'ORCHESTRATION_ACTION_EXECUTED' : 'ORCHESTRATION_ACTION_FAILED', agentId: context.orchestratorId, action: context.decision.action, detail, severity: success ? 'info' : 'warning', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, args, result, eventId: context.event.id, surprise: outcome.surprise >= 0.5, worldSurprise: outcome.surprise } });
}


async function compileMemorySafely(context, args) {
  try { await require('./orchestrationMemoryCompilation').compile(context, args); } catch (error) {
    telemetry.emitEvent({ eventType: 'ORCHESTRATION_MEMORY_DEFERRED', agentId: context.orchestratorId, action: 'compile_memory', detail: error.message, severity: 'warning', payload: { eventId: context.sourceEventId } });
  }
}

module.exports = { actionArguments, execute, normalizeActionResult };
