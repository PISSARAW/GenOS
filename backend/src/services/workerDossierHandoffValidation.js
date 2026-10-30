'use strict';

const values = require('./trinityProvenanceValues');
const provenance = require('./gvxMissionProvenance');

function failure() { return values.failure('WORKER_DOSSIER_HANDOFF_INVALID'); }

async function source(db, input) {
  const run = await db.get('SELECT agent_id,status FROM strategy_execution_runs WHERE id=?', input.sourceRunId);
  if (!run || run.status !== 'completed' || run.agent_id === input.mission.agentId) throw failure();
  const binding = await require('./biologicalWorkerStore').binding(db, input.sourceRunId);
  if (binding?.missionId !== input.mission.missionId || binding.workerId !== run.agent_id) throw failure();
  const { producer, consumer, mission } = await actors(db, input, run.agent_id);
  const budgetScopeId = await sharedBudget(db, input);
  await require('./missionEnvelopeAuthority').assertCompletedRunEvidence(db, { runId: input.sourceRunId, agentId: producer.id });
  const observations = await require('./biologicalWorkerStore').observations(db, input.sourceRunId);
  const terminal = observations.filter(item => item.applied && item.event.eventType === 'AGENT_COMPLETED').at(-1);
  const report = terminal?.event.payload?.evidenceReport;
  if (report?.outcome !== 'success' || Buffer.byteLength(JSON.stringify(report)) > 128 * 1024) throw failure();
  return { producerId: producer.id, sourceRunId: input.sourceRunId, reportHash: values.digest(report),
    missionId: input.mission.missionId, recipientId: consumer.id, recipientRunId: input.executionRun?.id,
    parentId: mission.orchestrator_agent_id, budgetScopeId, report };
}

async function sharedBudget(db, input) {
  if (!input.mission.modelBudgetScope) return null;
  await require('./missionModelBudgetScope').routeBudget(input.mission, db);
  const scopeId = input.mission.modelBudgetScope.id;
  const calls = await db.all('SELECT budget_reservation_id FROM model_attempt_ledger WHERE mission_id=? AND provider_called=1', input.sourceRunId);
  if (!calls.length || calls.some(call => call.budget_reservation_id !== scopeId)) throw failure();
  return scopeId;
}

async function actors(db, input, sourceId) {
  const [producer, consumer, mission] = await Promise.all([
    db.get('SELECT id,parent_agent_id,execution_mode FROM agents WHERE id=?', sourceId),
    db.get('SELECT id,parent_agent_id,execution_mode FROM agents WHERE id=?', input.mission.agentId),
    db.get('SELECT orchestrator_agent_id FROM missions WHERE mission_id=?', input.mission.missionId)
  ]);
  if (producer?.execution_mode !== 'worker' || consumer?.execution_mode !== 'worker') throw failure();
  if (producer?.parent_agent_id !== mission?.orchestrator_agent_id || consumer?.parent_agent_id !== mission?.orchestrator_agent_id) throw failure();
  const [from, to] = await Promise.all([provenance.agentScope(db, producer.id), provenance.agentScope(db, consumer.id)]);
  if (!from?.organizationId || !from.projectId || !provenance.sameTenant(from, to)) throw failure();
  return { producer, consumer, mission };
}

function received(message, expected) {
  const actual = message?.payload?.dossierHandoff;
  if (message?.integrity?.status !== 'verified' || message.senderAgentId !== expected.parentId
    || message.recipientAgentId !== expected.recipientId || values.digest(actual) !== values.digest(expected)) throw failure();
  return actual;
}

module.exports = { source, received };
