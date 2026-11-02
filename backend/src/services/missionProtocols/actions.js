'use strict';

const { withTransaction } = require('../../db');
const context = require('./context');

async function latest(db, request) {
  const row = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', request.agentId);
  if (row?.id !== request.executionRunId) throw context.failure('MISSION_ACTION_STALE_INCARNATION');
}

async function fromSealed(db, request) {
  const authority = require('../missionEnvelopeAuthority');
  const saved = await authority.read(db, request.executionRunId);
  if (!saved) throw context.failure('MISSION_PROTOCOL_SEALED_AUTHORITY_REQUIRED');
  const envelope = saved.envelope;
  if (envelope.missionId !== request.missionId || envelope.identity.agentId !== request.agentId) {
    throw context.failure('MISSION_ACTION_SEALED_SCOPE_MISMATCH');
  }
  await authority.assertRun(db, { runId: request.executionRunId, agentId: request.agentId });
  const run = await require('../strategyExecutionService').getRun(db, request.executionRunId);
  const agent = await db.get('SELECT * FROM agents WHERE id=?', request.agentId);
  return { db, agentId: request.agentId, executionRun: run, runtimeBudget: run.budget,
    dispatchedAgent: agent, normalizedMission: { agentId: request.agentId, missionId: request.missionId,
      workspaceId: envelope.identity.workspaceId, workspaceRoot: envelope.workspaceRoot,
      toolLease: envelope.toolLease, capabilities: envelope.capabilities,
      protocolProfile: 'adopted-sealed-action', executionBudget: envelope.limits,
      executionAuthorityRef: { runId: envelope.runId, eventId: saved.eventId,
        hash: saved.hash, eventHash: saved.eventHash, signature: saved.signature } } };
}

async function adopt(db, request) {
  return withTransaction(db, async () => {
    await latest(db, request);
    let binding = await context.load(db, request.executionRunId);
    if (!binding) {
      const ctx = await fromSealed(db, request);
      binding = await require('./runtime').initialize(ctx);
    }
    if (binding.agentId !== request.agentId || binding.missionId !== request.missionId) {
      throw context.failure('MISSION_ACTION_SEALED_SCOPE_MISMATCH');
    }
    await context.assertCurrent(binding);
    await require('./continuity').beforeExecution(binding);
    await latest(db, request);
    return binding;
  });
}

module.exports = { adopt, fromSealed };
