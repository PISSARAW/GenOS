'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-commit-test';
const { getDatabase, closeDatabase } = require('../src/db');
const collective = require('../src/services/collectiveStateService');
const snapshots = require('../src/services/morphogenesis/morphogenesisTransitionSnapshotService');
const { executeVersionedTransition, getLineage } = require('../src/services/morphogenesis/morphogenesisGitService');
const { executeTransition } = require('../src/services/morphogenesis/transitionEngineService');

function configureAuthority() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = JSON.stringify({ [keyId]: raw.toString('hex') });
}

async function seed(db, root) {
  await db.run("INSERT INTO organizations(id,name) VALUES ('commit-org','Commit Org')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES ('commit-project','commit-org','Commit Project')");
  await db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
    VALUES ('commit-ws','Commit workspace',?,'commit-org','commit-project')`, root);
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id)
    VALUES ('commit-agent','Commit Agent','orchestrator','idle','orchestrator','commit-ws')`);
}

async function execute(db) {
  const state = collective.deserializeState({ mission: { id: 'commit-mission' },
    agents: { 'commit-agent': { id: 'commit-agent', status: 'idle', lease: ['read'] } },
    topologyState: { organization: 'trinity', topology: 'trinity', activeSubgraphs: [] },
    budgets: { total: 100, allocated: 20, remaining: 80, perAgent: { 'commit-agent': 20 } } });
  const plan = { id: 'commit-plan', missionId: 'commit-mission',
    actions: [{ type: 'rebind', agentId: 'commit-agent', targetRole: 'verifier' }],
    targetOrganization: 'rhizome', expectedGain: 0.7, expectedRisk: 0.2,
    reason: 'authenticated-production-transition' };
  const req = { user: { username: 'operator' }, tenant: {
    organizationId: 'commit-org', projectId: 'commit-project' } };
  const result = await executeVersionedTransition({ plan, collectiveState: state, db,
    req, agentId: 'commit-agent', missionId: 'commit-mission' });
  assert.equal(result.receipt.committed, true);
  assert.equal(result.receipt.rustAuthority.decision, 'APPLY');
  assert.ok(result.commit?.id);
  assert.equal(state.topologyState.organization, 'rhizome');
  const stored = await snapshots.load({ db, id: result.receipt.durableSnapshot.id });
  assert.equal(stored.row.status, 'committed');
  assert.equal((await getLineage(db, 'commit-agent')).length, 1);
  const hysteresisStore = require('../src/services/morphogenesis/morphogenesisHysteresisStore');
  const hysteresisScope = { organizationId: 'commit-org', projectId: 'commit-project',
    missionId: 'commit-mission' };
  const committedHysteresis = await hysteresisStore.load(db, hysteresisScope);
  assert.equal(committedHysteresis.version, 1);
  assert.ok(Math.abs(committedHysteresis.budgetLeft - 0.8) < 0.000001);
  const actionEvents = await db.all(`SELECT receipt_json FROM morphogenesis_transition_actions
    WHERE transition_id=? ORDER BY sequence`, result.receipt.transitionId);
  assert.deepEqual(actionEvents.map(row => JSON.parse(row.receipt_json).phase),
    ['PREPARE', 'PREPARE', 'COMMIT', 'COMMIT']);
  assert.equal(JSON.parse(actionEvents[1].receipt_json).actionId,
    JSON.parse(actionEvents[2].receipt_json).actionId);
  const persisted = await db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
  assert.equal(collective.deserializeState(persisted.value).topologyState.organization, 'rhizome');
  await db.run(`INSERT INTO morphogenesis_transition_snapshots
    SELECT 'mts-startup-prepared', 'tx-startup-prepared', organization_id, project_id, mission_id,
      principal_id, plan_hash, snapshot_hash, payload_json, 'prepared', authority_json, NULL,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM morphogenesis_transition_snapshots WHERE snapshot_id=?`,
  result.receipt.durableSnapshot.id);
  await db.run(`INSERT INTO morphogenesis_transition_snapshots
    SELECT 'mts-startup-applying', 'tx-startup-applying', organization_id, project_id, mission_id,
      principal_id, plan_hash, snapshot_hash, payload_json, 'applying', authority_json, NULL,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM morphogenesis_transition_snapshots WHERE snapshot_id=?`,
  result.receipt.durableSnapshot.id);
  const recovery = await require('../src/services/morphogenesis/morphogenesisTransitionRecovery')
    .recoverStartupTransitions(db, { snapshotStore: { restore: async () => ({ restored: true }) } });
  assert.equal(recovery.aborted, 1);
  assert.equal(recovery.recoveryRequired, 1);
  assert.equal((await snapshots.load({ db, id: 'mts-startup-prepared' })).row.status, 'restored');
  assert.equal((await snapshots.load({ db, id: 'mts-startup-applying' })).row.status,
    'recovery_required');
  await db.run(`UPDATE morphogenesis_hysteresis SET last_commit_unix_ms=?
    WHERE organization_id=? AND project_id=? AND mission_id=?`,
  Date.now() - 60000, 'commit-org', 'commit-project', 'commit-mission');
  const rollback = await executeTransition({ db, req, agentId: 'commit-agent',
    missionId: 'commit-mission', collectiveState: state,
    plan: { id: 'rollback-plan', missionId: 'commit-mission', actions: [],
      targetOrganization: 'trinity', expectedGain: 0.6, expectedRisk: 0.1,
      reason: 'forced-commit-failure' },
    persistCommit: async () => { throw new Error('forced commit failure'); } });
  assert.equal(rollback.committed, false);
  assert.equal(rollback.rollbackReceipt.durableRestored, true);
  const rollbackEvents = await db.all(`SELECT receipt_json FROM morphogenesis_transition_actions
    WHERE transition_id=? ORDER BY sequence`, rollback.transitionId);
  assert.deepEqual(rollbackEvents.map(row => JSON.parse(row.receipt_json).phase), ['PREPARE', 'ABORT']);
  assert.equal(state.topologyState.organization, 'rhizome');
  assert.equal((await snapshots.load({ db, id: rollback.durableSnapshot.id })).row.status, 'restored');
  assert.equal((await hysteresisStore.load(db, hysteresisScope)).version, 1);
}

async function run() {
  configureAuthority();
  const root = fs.mkdtempSync(path.join(__dirname, '.morph-commit-workspace-'));
  const dbPath = path.join(__dirname, `.morph-commit-${crypto.randomUUID()}.db`);
  fs.writeFileSync(path.join(root, 'state.txt'), 'before');
  const db = await getDatabase(dbPath);
  try {
    await seed(db, root);
    await execute(db);
    console.log('authenticated Rust morphogenesis commit: PASS');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
    delete process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
    delete process.env.GENOS_CLI_AUTHORITY_TRUST_JSON;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
