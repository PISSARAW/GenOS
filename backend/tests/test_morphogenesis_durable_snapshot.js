'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-snapshot-test';
const { getDatabase, closeDatabase } = require('../src/db');
const collective = require('../src/services/collectiveStateService');
const snapshots = require('../src/services/morphogenesis/morphogenesisTransitionSnapshotService');

async function seed(db, root) {
  await db.run("INSERT INTO organizations(id,name) VALUES ('morph-org','Morph Org')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES ('morph-project','morph-org','Morph Project')");
  await db.run(`INSERT INTO workspaces(id,name,path,organization_id,project_id)
    VALUES ('morph-ws','Morph workspace',?,'morph-org','morph-project')`, root);
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id,
    cognitive_budget,cognitive_baseline_budget,cognitive_max_dissonance)
    VALUES ('morph-agent','Morph','orchestrator','idle','orchestrator','morph-ws',42,50,60)`);
  await db.run(`INSERT INTO agent_runtime_state(id,agent_id,workspace_id,status,state_json)
    VALUES ('runtime-morph','morph-agent','morph-ws','intermediate','{"checkpoint":7}')`);
  await db.run(`INSERT INTO agent_git_refs(ref_key,agent_id,ref_name,object_id,version,lease_token)
    VALUES ('morph-agent:main','morph-agent','main',NULL,3,'lease-before')`);
  await db.run(`INSERT INTO agent_identity_heads(agent_id,organization_id,project_id,kind,
    source_table,revision,lease_until,life_state) VALUES
    ('morph-agent','morph-org','morph-project','agent','agents',2,123456,'alive')`);
}

function state() {
  return collective.deserializeState({ mission: { id: 'morph-mission' },
    agents: { 'morph-agent': { id: 'morph-agent', status: 'idle',
      lease: ['read', 'write'], budget: { allocated: 42, consumed: 1 } } },
    topologyState: { organization: 'trinity', topology: 'trinity', activeSubgraphs: [] },
    budgets: { total: 50, allocated: 42, remaining: 8, perAgent: { 'morph-agent': 42 } } });
}

async function exercise(db, root) {
  const collectiveState = state();
  const plan = { id: 'durable-plan', missionId: 'morph-mission', actions: [],
    targetOrganization: 'rhizome', expectedGain: 0.8, expectedRisk: 0.2 };
  const input = { db, agentId: 'morph-agent', missionId: 'morph-mission',
    transitionId: 'tx-durable-test', collectiveState, plan, req: {
      user: { username: 'operator' }, tenant: { organizationId: 'morph-org',
        projectId: 'morph-project' } } };
  const snapshot = await snapshots.capture(input);
  await snapshots.markApplying({ db, id: snapshot.id, authority: { decision: 'APPLY' } });
  fs.writeFileSync(path.join(root, 'state.txt'), 'mutated');
  collectiveState.agents.get('morph-agent').lease = ['admin'];
  collectiveState.budgets.remaining = 0;
  await db.run("UPDATE agents SET cognitive_budget=1 WHERE id='morph-agent'");
  await db.run("UPDATE agent_runtime_state SET state_json='{}' WHERE agent_id='morph-agent'");
  await db.run("UPDATE agent_git_refs SET lease_token='lease-after' WHERE agent_id='morph-agent'");
  await db.run("UPDATE agent_identity_heads SET lease_until=999999 WHERE agent_id='morph-agent'");
  const restored = await snapshots.restore({ db, id: snapshot.id, collectiveState,
    error: 'test rollback' });
  assert.equal(restored.restored, true);
  assert.equal(fs.readFileSync(path.join(root, 'state.txt'), 'utf8'), 'before');
  assert.deepEqual(collectiveState.agents.get('morph-agent').lease, ['read', 'write']);
  assert.equal(collectiveState.budgets.remaining, 8);
  assert.equal((await db.get("SELECT cognitive_budget FROM agents WHERE id='morph-agent'")).cognitive_budget, 42);
  assert.equal(JSON.parse((await db.get("SELECT state_json FROM agent_runtime_state WHERE agent_id='morph-agent'")).state_json).checkpoint, 7);
  assert.equal((await db.get("SELECT lease_token FROM agent_git_refs WHERE agent_id='morph-agent'")).lease_token, 'lease-before');
  assert.equal((await db.get("SELECT lease_until FROM agent_identity_heads WHERE agent_id='morph-agent'")).lease_until, 123456);
  assert.equal((await snapshots.load({ db, id: snapshot.id })).row.status, 'restored');
}

async function run() {
  const root = fs.mkdtempSync(path.join(__dirname, '.morph-workspace-'));
  const dbPath = path.join(__dirname, `.morph-${crypto.randomUUID()}.db`);
  fs.writeFileSync(path.join(root, 'state.txt'), 'before');
  const db = await getDatabase(dbPath);
  try {
    await seed(db, root);
    await exercise(db, root);
    console.log('morphogenesis durable snapshot restore: PASS');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
