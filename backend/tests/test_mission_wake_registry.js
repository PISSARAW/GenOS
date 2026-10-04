'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'mission-wake-registry-test';
const { getDatabase, closeDatabase } = require('../src/db');
const missions = require('../src/services/missionIdentityService');
const survival = require('../src/services/survivalStateService');
const wakes = require('../src/services/survivalWakeService');
const registry = require('../src/services/missionResourceRegistryService');
const authority = require('../src/services/missionExecutionAuthority');
const recovery = require('../src/services/survivalWakeRecoveryService');
const checks = require('../src/services/missionRegenerationChecksService');

async function addAgent(db, id) {
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES (?, ?, 'orchestrator', 'running', 'orchestrator')", id, id);
}

async function recordBudget(db, missionId, tokens) {
  return registry.record(db, { missionId, kind: 'budget', availableTokens: tokens,
    actor: 'test', evidenceRef: `budget-${tokens}-${Date.now()}` });
}

async function checkFreshObservations(db) {
  const missionId = 'registry-wake-mission';
  const agentId = 'registry-wake-agent';
  await addAgent(db, agentId);
  await missions.create(db, { missionId, objective: 'resume after budget', orchestratorAgentId: agentId });
  await recordBudget(db, missionId, 12);
  const suspended = await survival.suspend(db, { agentId, missionId,
    mission: { prompt: 'resume after budget', missionId },
    wakeCondition: { type: 'budget_restored', minimumTokens: 10 } });
  const armed = suspended.wakeCondition;
  assert.equal(await registry.satisfies(db, armed), false, 'old budget cannot wake a new condition');
  await recordBudget(db, missionId, 12);
  assert.equal(await registry.satisfies(db, armed), true, 'fresh budget can wake the mission');
  await db.run('UPDATE agents SET runtime_pid = ? WHERE id = ?', process.pid, agentId);
  const blocked = await survival.wake(db, { agentId, wakeConditionId: armed.id,
    event: { type: 'budget_restored' } });
  assert.equal(blocked.code, 'MISSION_DORMANT_RUNTIME_ACTIVE');
  assert.equal((await wakes.get({ db, id: armed.id })).status, 'armed');
  await db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', agentId);
  assert.equal((await wakes.trigger({ db, id: armed.id })).claimed, true);
  const rearmed = await wakes.rearm({ db, id: armed.id });
  assert.equal(await registry.satisfies(db, rearmed), false, 'rearm consumes prior observation');
  await recordBudget(db, missionId, 12);
  assert.equal(await registry.satisfies(db, rearmed), true, 'new observation re-enables wake');
  await checkOtherResourceKinds(db, { missionId, agentId });
}

async function checkOtherResourceKinds(db, input) {
  const { missionId, agentId } = input;
  const provider = await wakes.arm({ db, missionId, agentId,
    condition: { type: 'provider_available', providerId: 'test-provider' } });
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  await registry.record(db, { missionId, kind: 'provider', resourceKey: 'test-provider',
    available: true, expiresAt, actor: 'test', evidenceRef: 'provider-up' });
  assert.equal(await registry.satisfies(db, provider), true);
  await registry.record(db, { missionId, kind: 'provider', resourceKey: 'test-provider',
    available: false, actor: 'test', evidenceRef: 'provider-down' });
  assert.equal(await registry.satisfies(db, provider), false, 'latest provider observation governs');
  const external = await wakes.arm({ db, missionId, agentId,
    condition: { type: 'external_event', eventName: 'release-ready' } });
  await registry.record(db, { missionId, kind: 'external', resourceKey: 'release-ready',
    expiresAt, actor: 'test', evidenceRef: 'release-ready' });
  assert.equal(await registry.satisfies(db, external), true);
}

async function checkIndependentRegeneration(db) {
  const missionId = 'independent-check-mission';
  const agentId = 'independent-check-agent';
  await addAgent(db, agentId);
  await missions.create(db, { missionId, objective: 'verify replacement', orchestratorAgentId: agentId });
  await checks.configure(db, { missionId, role: 'verifier', commands: ['npm test'], actor: 'test' });
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-regeneration-check-'));
  try {
    const packageFile = path.join(workspaceRoot, 'package.json');
    await fs.writeFile(packageFile, JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }));
    const input = { missionId, role: 'verifier', lostAgentId: 'lost', replacementId: 'replacement',
      reportEvidenceRef: 'worker-report', workspaceRoot };
    const passed = await checks.verify(db, input);
    assert.equal(passed.success, true, 'GenOS replays the configured check itself');
    await fs.writeFile(packageFile, JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }));
    const failed = await checks.verify(db, input);
    assert.equal(failed.success, false, 'a failed independent check blocks replacement');
    const receipts = await db.all('SELECT outcome FROM mission_regeneration_verifications WHERE mission_id = ?', missionId);
    assert.deepEqual(receipts.map(row => row.outcome), ['verified', 'failed']);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function checkTerminalReconciliation(input) {
  const { db, missionId, agentId, terminalStatus, expectedState } = input;
  await addAgent(db, agentId);
  await missions.create(db, { missionId, objective: 'resume and finish', orchestratorAgentId: agentId });
  await authority.reserve(db, { missionId, agentId });
  const suspended = await survival.suspend(db, { agentId, missionId,
    mission: { prompt: 'resume and finish', missionId },
    wakeCondition: { type: 'operator_or_signal' } });
  assert.equal((await wakes.trigger({ db, id: suspended.wakeCondition.id })).claimed, true);
  await db.run('UPDATE survival_wake_conditions SET owner_pid = ? WHERE id = ?', 2147483647, suspended.wakeCondition.id);
  await survival.observe(db, agentId, { forcedState: 'waking',
    snapshotId: suspended.snapshot.snapshotId, wakeConditionId: suspended.wakeCondition.id });
  await missions.setStatus(db, missionId, 'active');
  await missions.setStatus(db, missionId, terminalStatus);
  await recovery.reconcileAbandoned(db);
  assert.equal((await survival.get(db, agentId)).state, expectedState);
  assert.equal((await wakes.get({ db, id: suspended.wakeCondition.id })).status, 'cancelled');
  const snapshot = await db.get('SELECT status FROM cryptobiosis_snapshots WHERE snapshot_id = ?', suspended.snapshot.snapshotId);
  assert.equal(snapshot.status, 'thawed');
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-mission-wake-registry-'));
  try {
    const db = await getDatabase(path.join(dir, 'mission.sqlite'));
    await checkFreshObservations(db);
    await checkIndependentRegeneration(db);
    await checkTerminalReconciliation({ db, missionId: 'completed-wake-mission', agentId: 'completed-wake-agent',
      terminalStatus: 'completed', expectedState: 'recovered' });
    await checkTerminalReconciliation({ db, missionId: 'failed-wake-mission', agentId: 'failed-wake-agent',
      terminalStatus: 'failed', expectedState: 'protected' });
    console.log('Fresh observations, independent checks and terminal wake reconciliation: PASS');
  } finally {
    await closeDatabase();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
