'use strict';

const receipts = require('./bodyActionReceiptService');
const efference = require('./efferenceCopyService');

async function predict(input) {
  const actionId = receipts.actionId();
  await receipts.predict({ db: input.db, agentId: input.agentId, runId: input.runId,
    actionId, effectorId: 'mission_runtime_process',
    prediction: { executable: input.executable, expected: 'runtime_exit' } });
  await efference.predict(input.db, input.agentId, { actionId, action: 'runtime_process',
    expectedTypes: ['AGENT_RUNTIME_EXIT_OBSERVED'] })
    .catch((error) => console.error('[AgentSupervisor] Efference copy unavailable:', error.message));
  return actionId;
}

async function observe(input) {
  const receipt = await receipts.observe({ db: input.db, agentId: input.agentId,
    runId: input.runId, actionId: input.actionId, effectorId: 'mission_runtime_process',
    outcome: input.outcome });
  if (!receipt.matched) return receipt;
  const consequence = { agentId: input.agentId, eventType: 'AGENT_RUNTIME_EXIT_OBSERVED',
    payload: { sourceActionId: input.actionId } };
  await efference.discharge(input.db, input.agentId, consequence)
    .catch((error) => console.error('[AgentSupervisor] Efference discharge unavailable:', error.message));
  const emit = input.emit || require('./agentOrchestrationState').emit;
  emit(input.agentId, consequence.eventType, 'SENSE_CONSEQUENCES', 'Supervisor observed runtime exit.',
    { ...consequence.payload, executionRunId: input.runId, status: input.outcome.status }, 'info');
  return receipt;
}

async function spawnFailed(input) {
  return receipts.observe({ db: input.db, agentId: input.agentId, runId: input.runId,
    actionId: input.actionId, effectorId: 'mission_runtime_process',
    outcome: { status: 'spawn_failed', code: input.code || null } });
}

module.exports = { predict, observe, spawnFailed };
