'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'mission-replacement-test';
const dbApi = require('../src/db');
const identity = require('../src/services/missionIdentityService');
const regeneration = require('../src/services/regenerationService');
const garage = require('../src/services/workerGarageService');
const dispatch = require('../src/services/orchestratorDispatchService');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mission-replacement-'));
  const dbPath = path.join(root, 'state.sqlite');
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(path.join(workspaceRoot, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'checks', 'verify.js'), 'process.exit(0);\n');
  let db = await dbApi.getDatabase(dbPath);
  const originals = { reserveSlot: garage.reserveSlot, enterIdleState: garage.enterIdleState, dispatch: dispatch.dispatchWorkerMission };
  try {
    await db.run("INSERT INTO workspaces (id, name, path) VALUES ('replacement-workspace', 'Replacement workspace', ?)", workspaceRoot);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('replacement-orch', 'Orchestrator', 'orchestrator', 'idle', 'orchestrator', 'replacement-workspace')");
    await identity.create(db, { missionId: 'replacement-mission', objective: 'replace worker', orchestratorAgentId: 'replacement-orch' });
    await require('../src/services/missionRegenerationChecksService').configure(db, {
      missionId: 'replacement-mission', role: 'researcher', commands: ['node checks/verify.js'], actor: 'test-fixture'
    });
    garage.reserveSlot = async () => ({ reserved: true });
    dispatch.dispatchWorkerMission = async ({ agentId }) => {
      await db.run("UPDATE agents SET status = 'error', current_task = 'synthetic dispatch failure' WHERE id = ?", agentId);
      throw Object.assign(new Error('synthetic dispatch failure'), { code: 'DISPATCH_FAILED' });
    };
    const failed = await regeneration.regenerateWorker({
      db, missionId: 'replacement-mission', plan: { kind: 'workers', role: 'researcher', lostIdentifier: 'lost-worker' },
      organism: { tissues: { workers: [] }, memory: { scars: [] } }, executionBudget: { tokens: 1000 }
    });
    assert.equal(failed.success, false);
    assert.equal(failed.status, 'error');
    const failedRow = await db.get('SELECT status FROM agents WHERE id = ?', failed.replacementId);
    assert.equal(failedRow.status, 'error');

    dispatch.dispatchWorkerMission = async ({ agentId, prompt }) => {
      await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", agentId);
      const lostIdentifier = /lostIdentifier='([^']+)'/.exec(prompt)?.[1];
      await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, payload_json)
        VALUES (?, 'EVIDENCE_REPORT', 'TEST_REPORT', ?)`, agentId, JSON.stringify({ evidenceReport: {
        outcome: 'success', claims: [{ evidence: ['verified replacement result'] }],
        functionalEquivalence: { lostIdentifier, role: 'researcher', passed: true,
          checks: [{ command: 'node checks/verify.js', exitCode: 0, evidenceRef: 'sha256:check' }] }
      } }));
    };
    garage.enterIdleState = async (_db, agentId) => { await db.run("UPDATE agents SET status = 'idle' WHERE id = ?", agentId); };
    const succeeded = await regeneration.regenerateWorker({
      db, missionId: 'replacement-mission', plan: { kind: 'workers', role: 'researcher', lostIdentifier: 'lost-worker-success' },
      organism: { tissues: { workers: [] }, memory: { scars: [] } }, executionBudget: { tokens: 1000 }
    });
    const verificationRows = await db.all('SELECT outcome, executions_json FROM mission_regeneration_verifications WHERE replacement_id = ?', succeeded.replacementId);
    assert.equal(succeeded.success, true, JSON.stringify({ succeeded, verificationRows }));
    assert.ok(succeeded.evidenceRef.startsWith('sha256:'));
    const attached = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?', 'replacement-mission', succeeded.replacementId);
    assert.ok(attached);
    const persisted = await db.get('SELECT status FROM agents WHERE id = ?', succeeded.replacementId);
    assert.equal(persisted.status, 'idle');
    await dbApi.closeDatabase();
    db = await dbApi.getDatabase(dbPath);
    const restartedAgent = await db.get('SELECT status FROM agents WHERE id = ?', succeeded.replacementId);
    const restartedMembership = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?', 'replacement-mission', succeeded.replacementId);
    assert.equal(restartedAgent.status, 'idle');
    assert.ok(restartedMembership);
    console.log('Mission replacement dispatch failure, verified success and durable membership passed.');
  } finally {
    garage.reserveSlot = originals.reserveSlot;
    garage.enterIdleState = originals.enterIdleState;
    dispatch.dispatchWorkerMission = originals.dispatch;
    try { await dbApi.closeDatabase(); }
    finally {
      const resolvedRoot = path.resolve(root);
      if (path.dirname(resolvedRoot) !== path.resolve(os.tmpdir())
        || !path.basename(resolvedRoot).startsWith('genos-mission-replacement-')) {
        throw new Error('Refusing to remove an unexpected mission replacement test directory.');
      }
      fs.rmSync(resolvedRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
