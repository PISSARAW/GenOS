'use strict';

const assert = require('node:assert/strict');
const provenance = require('../../src/services/gvxMissionProvenance');
const protocols = require('../../src/services/missionProtocols/context');
const { publisher } = require('../../src/services/missionProtocols/synapsePublisher');

async function assertPublishers(db, input) {
  const { ctx, workers } = input;
  const missionId = ctx.autonomyPlan.trinity.missionId;
  const scope = await provenance.requireAgentScope(db, ctx.agentId);
  const parent = await provenance.readRun(db, { runId: ctx.executionRun.id, scope });
  assert.equal(parent.mission.id, ctx.normalizedMission.missionId);
  assert.notEqual(missionId, parent.mission.id, 'Trinity must exercise the child mission boundary');
  for (const worker of workers) {
    await assertWorkerPublisher(db, { worker, missionId, parent });
  }
}

async function assertWorkerPublisher(db, input) {
  const { worker, missionId, parent } = input;
  const run = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', worker.agentId);
  assert.ok(run, 'Trinity worker must have a native execution incarnation');
  const binding = await protocols.load(db, run.id);
  assert.ok(binding, 'Trinity worker must persist its actual protocol binding');
  assert.equal(binding.agentId, worker.agentId);
  assert.equal(binding.missionId, missionId);
  const child = await provenance.readRun(db, { runId: run.id,
    scope: { ...binding.scope, entityId: worker.agentId } });
  assert.equal(child.mission.id, missionId);
  const expected = { agentId: parent.scope.entityId, incarnationId: parent.runId,
    trustDomain: parent.scope.organizationId };
  assert.deepEqual(await publisher(binding), expected,
    'A native Trinity child must accept its exact parent incarnation from the root mission');
  assert.deepEqual(binding.mission.synapseContext.publisher, expected,
    'The context actually dispatched must retain that same publisher');
}

module.exports = { assertPublishers };
