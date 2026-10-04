const assert = require('assert');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const telemetry = require('../src/services/telemetryObserver');
const bridge = require('../src/services/communication/missionCheckpointBridge');

async function main() {
  const originalEvaluate = checkpoint.evaluateCheckpoint;
  const originalEmit = telemetry.emitEvent;
  const events = [];
  let calls = 0;
  telemetry.emitEvent = (event) => { events.push(event); return event; };
  try {
    checkpoint.evaluateCheckpoint = async (ctx) => {
      calls++;
      assert.equal(ctx.agentId, 'orchestrator-1');
      assert.equal(ctx.checkpoint, 'MISSION_COMPLETED');
      assert.equal(ctx.db, database);
      assert.deepEqual(ctx.evidence.semanticRefs, ['mission:mission-1:completed']);
      return { decision: { action: 'SILENCE' }, executed: { executed: false } };
    };
    const database = {};
    const denied = await bridge.evaluateMissionCompletion({ db: database,
      agentId: 'orchestrator-1', gateAllowed: false });
    assert.equal(denied.reason, 'COMPLETION_NOT_AUTHORIZED');
    assert.equal(calls, 0);
    assert.equal(events.length, 0);

    const allowed = await bridge.evaluateMissionCompletion({ db: database,
      agentId: 'orchestrator-1', missionId: 'mission-1', gateAllowed: true });
    assert.equal(allowed.evaluated, true);
    assert.equal(calls, 1);
    assert.equal(events[0].eventType, 'COMMUNICATION_CHECKPOINT_EVALUATED');
    assert.equal(events[0].payload.executed.executed, false);

    checkpoint.evaluateCheckpoint = async () => { throw new Error('policy unavailable'); };
    const failed = await bridge.evaluateMissionCompletion({ db: database,
      agentId: 'orchestrator-1', gateAllowed: true });
    assert.equal(failed.evaluated, false);
    assert.equal(failed.reason, 'CHECKPOINT_FAILED');
    assert.equal(events[1].eventType, 'COMMUNICATION_CHECKPOINT_FAILED');

    checkpoint.evaluateCheckpoint = async () => ({ decision: { action: 'SILENCE' } });
    telemetry.emitEvent = () => { throw new Error('telemetry unavailable'); };
    const unrecorded = await bridge.evaluateMissionCompletion({ db: database,
      agentId: 'orchestrator-1', gateAllowed: true });
    assert.equal(unrecorded.evaluated, true);
    assert.equal(unrecorded.telemetryRecorded, false);
  } finally {
    checkpoint.evaluateCheckpoint = originalEvaluate;
    telemetry.emitEvent = originalEmit;
  }
  console.log('Mission communication checkpoint gate and failure isolation passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
