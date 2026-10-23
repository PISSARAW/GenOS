'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `genos_deferred_outcome_${Date.now()}.db`);
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_ADMIN_PASSWORD = 'test-only';

async function run() {
  const { getDatabase, closeDatabase } = require('../src/db');
  const missionIdentity = require('../src/services/missionIdentityService');
  const continuity = require('../src/services/missionContinuityService');
  const db = await getDatabase(dbPath);
  const missionId = 'deferred-local-success';
  const agentId = 'deferred-local-orchestrator';
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode)
    VALUES (?, 'orchestrator', 'orchestrator', 'running', 'orchestrator')`, agentId);
  await missionIdentity.create(db, { missionId, objective: 'deferred local completion', orchestratorAgentId: agentId });
  await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, payload_json)
    VALUES (?, 'LOCAL_WORKER_COMPLETED', 'LOCAL_CODE_PROPOSAL', ?)` , agentId,
  JSON.stringify({ deferredTerminalEventType: 'AGENT_COMPLETED' }));
  const result = await continuity.effectiveMissionOutcome(db, missionId);
  assert.equal(result.members[0].status, 'running', 'orchestrator remains active for homeostasis');
  assert.equal(result.outcome.success, true, 'verified deferred worker completion counts for the gate');
  await closeDatabase();
  fs.unlinkSync(dbPath);
}

run().then(() => console.log('deferred local worker outcome: PASS')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
