const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const telemetry = require('../src/services/telemetryObserver');
const bridge = require('../src/services/communication/missionCheckpointBridge');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const originalEmit = telemetry.emitEvent;
  const events = [];
  telemetry.emitEvent = (event) => { events.push(event); return event; };
  try {
    await db.exec(`CREATE TABLE agents (
      id TEXT PRIMARY KEY, metadata_json TEXT DEFAULT '{}', model_tier TEXT DEFAULT 'Flash');
      INSERT INTO agents (id) VALUES ('orchestrator-1');`);
    const result = await bridge.evaluateMissionCompletion({ db,
      agentId: 'orchestrator-1', missionId: 'mission-1', gateAllowed: true });
    assert.equal(result.evaluated, true);
    assert.equal(result.receipt.checkpoint, 'MISSION_COMPLETED');
    assert.equal(result.receipt.decision.action, 'SILENCE');
    assert.equal(result.receipt.executed.executed, false);
    assert.equal(events[0].eventType, 'COMMUNICATION_CHECKPOINT_EVALUATED');
  } finally {
    telemetry.emitEvent = originalEmit;
    await db.close();
  }
  console.log('Mission completion reaches the real communication policy.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
