'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sensorium = require('../src/services/perception/sensoriumService');
const { makeObservation } = require('../src/services/perception/observationService');

function run() {
  const directory = fs.mkdtempSync(path.join(process.cwd(), 'backend', 'scratch', 'genos-sensorium-'));
  const persistencePath = path.join(directory, 'sensorium.json');
  const agentId = 'sensorium-persistence-agent';
  try {
    sensorium.clearSensorium(agentId);
    sensorium.createSensorium({ agentId, persistencePath, attentionBudget: 4 });
    const observation = makeObservation({ sensorId: 'test', agentId, target: 'patch-a',
      uncertaintyBefore: 1, uncertaintyAfter: 0.25, evidenceState: 'observed',
      data: { value: 42 } });
    sensorium.recordObservation({ agentId, observation });
    const before = sensorium.snapshotSensorium(agentId);
    const replay = sensorium.replaySensorium(before);
    assert.equal(replay.revision, before.revision);
    assert.equal(replay.observationCount, 1);
    assert.ok(fs.existsSync(persistencePath));

    sensorium.clearSensorium(agentId);
    const restored = sensorium.restoreSensorium({ agentId, persistencePath });
    assert.deepEqual(restored.observations, before.observations);
    assert.equal(restored.environmentModel.uncertaintyMap['patch-a'], 0.25);

    const persisted = JSON.parse(fs.readFileSync(persistencePath, 'utf8'));
    persisted.state.observations[0].data.value = 99;
    fs.writeFileSync(persistencePath, JSON.stringify(persisted));
    assert.throws(() => sensorium.restoreSensorium({ agentId, persistencePath }), /digest mismatch/);
    console.log('[PASS] sensorium persistence, restore and tamper rejection');
  } finally {
    sensorium.clearSensorium(agentId);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

run();
