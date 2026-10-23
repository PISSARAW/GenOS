'use strict';

const receipts = require('../bodyActionReceiptService');
const motor = require('../perception/embodied/motorOutcomeAdapter');
const { runToolExecution } = require('./efferenceBridge');
const { executeConfiguredTransport } = require('./dispatch');
const { applyDomainVerdict, actionSucceeded } = require('./domainVerdict');
const circuitBreaker = require('../circuitBreaker');
const telemetry = require('../telemetryObserver');

async function runBoundMotorTool(input) {
  const actionId = receipts.actionId();
  const context = { db: input.db, agentId: input.agentId, toolName: input.toolName,
    args: input.args, circuitScope: input.circuitScope, actionId,
    runId: input.binding.envelope.runId, authorityLease: input.binding.envelope.toolLease };
  const environment = { ownerAgentId: input.binding.envelope.scope.entityId,
    actuatorId: 'backend_mcp_tool', toolName: input.toolName,
    execute: async () => executeBoundTool(context) };
  const outcome = await motor.execute({ db: input.db, agentId: input.agentId,
    runId: input.binding.envelope.runId,
    environmentRef: `mcp:${input.toolName}`, environment,
    intent: { intentId: actionId, action: input.toolName } });
  if (outcome.status === 'blocked') return { success: false, status: 'blocked', error: outcome.reason };
  return outcome.result;
}

async function executeBoundTool(context) {
  await receipts.predict({ db: context.db, agentId: context.agentId, runId: context.runId,
    actionId: context.actionId, effectorId: 'backend_mcp_tool',
    prediction: { toolName: context.toolName, expected: 'tool_result' } });
  let result;
  try {
    result = await runToolExecution({ context, executeConfiguredTransport,
      applyDomainVerdict, circuitBreaker, telemetry });
  } catch (error) {
    await receipts.observe({ db: context.db, agentId: context.agentId, runId: context.runId,
      actionId: context.actionId, effectorId: 'backend_mcp_tool',
      outcome: { status: 'failed', code: error.code || 'MCP_EXECUTION_FAILED' } });
    throw error;
  }
  const succeeded = actionSucceeded(context.toolName, result);
  await receipts.observe({ db: context.db, agentId: context.agentId, runId: context.runId,
    actionId: context.actionId, effectorId: 'backend_mcp_tool',
    outcome: { status: succeeded ? 'completed' : 'failed', toolStatus: result.status,
      domainVerdict: result.domainVerdict || null } });
  const actionResult = { ...result, success: succeeded, transportSuccess: result.success,
    status: succeeded ? result.status : 'tool_error' };
  return { status: succeeded ? 'completed' : 'failed', evidenceRefs: [context.actionId], result: actionResult };
}

module.exports = { runBoundMotorTool };
