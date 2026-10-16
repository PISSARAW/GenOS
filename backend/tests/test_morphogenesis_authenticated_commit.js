'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
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
  const plan = { id: 'commit-plan', missionId: 'commit-mission', actions: [],
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
  const persisted = await db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
  assert.equal(collective.deserializeState(persisted.value).topologyState.organization, 'rhizome');
  const rollback = await executeTransition({ db, req, agentId: 'commit-agent',
    missionId: 'commit-mission', collectiveState: state,
    plan: { id: 'rollback-plan', missionId: 'commit-mission', actions: [],
      targetOrganization: 'trinity', expectedGain: 0.6, expectedRisk: 0.1,
      reason: 'forced-commit-failure' },
    persistCommit: async () => { throw new Error('forced commit failure'); } });
  assert.equal(rollback.committed, false);
  assert.equal(rollback.rollbackReceipt.durableRestored, true);
  assert.equal(state.topologyState.organization, 'rhizome');
  assert.equal((await snapshots.load({ db, id: rollback.durableSnapshot.id })).row.status, 'restored');
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
