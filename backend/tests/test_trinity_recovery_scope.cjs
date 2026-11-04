'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trinity-recovery-scope-'));
const snapshot = path.join(root, 'snapshot');
const failed = path.join(root, 'failed');
for (const directory of [snapshot, failed]) {
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'public.txt'), 'Sealed public input.');
}
fs.writeFileSync(path.join(failed, 'poison.txt'), 'Failed worker private changes must not be inherited.');
Object.assign(process.env, {GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
  GENOS_DB_PATH: path.join(root, 'runtime.sqlite'), GENOS_WORKSPACE_ROOT: snapshot,
  GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_DISABLE_WORKSPACE_GC: '1',
  GENOS_ADMIN_PASSWORD: require('node:crypto').randomBytes(24).toString('hex')});
const database = require('../src/db');
const authority = require('../src/services/trinityWorkerAuthority');
const recovery = require('../src/services/agentRecovery/recoveryTrinityWorkspace');

async function fixture(db) {
  const hash = await require('../src/services/trinitySnapshotService').hashWorkspace(snapshot);
  await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id)
    VALUES('recovery-parent','Parent','orchestrator','running','orchestrator','ws-local')`);
  for (const id of ['failed-worker', 'replacement', 'bad-replacement']) {
    await db.run(`INSERT INTO agents(id,name,role,status,execution_mode,workspace_id,parent_agent_id)
      VALUES(?,?,'bounded_worker','error','worker','ws-local','recovery-parent')`, id, id);
  }
  const workspace = 'trinity_workspace_failed-worker';
  const tenant = await db.get('SELECT organization_id,project_id FROM workspaces WHERE id=?', 'ws-local');
  await db.run(`INSERT INTO workspaces(id,name,path,visibility,organization_id,project_id)
    VALUES(?, 'Failed private world', ?, 'Private', ?, ?)`, workspace, failed.toLowerCase(),
  tenant.organization_id, tenant.project_id);
  await db.run('UPDATE agents SET workspace_id=? WHERE id=?', workspace, 'failed-worker');
  await require('../src/services/trinityExperimentStore').create(db, {id: 'scope-experiment',
    missionId: 'scope-mission', domain: 'software', snapshotHash: hash,
    design: {orchestratorId: 'recovery-parent', snapshotRoot: snapshot}});
  await db.run(`INSERT INTO trinity_worlds(id,mission,world_number,name,strategy,status,agent_id,
    experiment_id,snapshot_hash,workspace_root) VALUES('world','scope',1,'world','bounded','error',
    'failed-worker','scope-experiment',?,?)`, hash, failed.toLowerCase());
  const source = await db.get('SELECT *, ? AS workspace_root FROM agents WHERE id=?', failed, 'failed-worker');
  const target = {targetId: 'replacement', sourceAgentId: source.id, orchestratorId: 'recovery-parent',
    sameIdentity: false, name: 'Replacement', role: 'bounded_worker', decision: {action: 'replace_worker'},
    report: {attempt: 0}, mission: {missionScope: {trinityExperimentId: 'scope-experiment'},
      capsuleRoot: path.join(root, 'capsules')}};
  return {source, target};
}

async function verifyRollback(db, input) {
  const wrong = path.join(root, 'wrong');
  fs.mkdirSync(wrong);
  fs.writeFileSync(path.join(wrong, 'public.txt'), 'Different snapshot.');
  await assert.rejects(database.withTransaction(db, () => recovery.bind(db,
    {...input, target: {...input.target, targetId: 'bad-replacement'}, workspace: {workspaceRoot: wrong}})),
  {code: 'TRINITY_SNAPSHOT_MISMATCH'});
  assert.equal((await db.get('SELECT agent_id FROM trinity_worlds WHERE id=?', 'world')).agent_id, input.source.id);
  assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id=?', 'bad-replacement')).workspace_id, 'ws-local');
}

async function scenario(db) {
  const input = await fixture(db);
  assert.equal(await recovery.sourceRoot(db, input), snapshot);
  await assert.rejects(recovery.sourceRoot(db, {...input,
    target: {...input.target, orchestratorId: 'unrelated-parent'}}), {code: 'TRINITY_RECOVERY_SCOPE_INVALID'});
  await verifyRollback(db, input);
  const workspace = await require('../src/services/agentRecovery/recoveryWorkspace').createRecoveryWorkspace(
    {db, ...input, mission: input.target.mission});
  assert.equal(workspace.workspaceId, 'trinity_workspace_replacement');
  assert.notEqual(workspace.workspaceRoot, failed);
  assert.equal(fs.existsSync(path.join(workspace.workspaceRoot, 'poison.txt')), false);
  const agent = await db.get('SELECT * FROM agents WHERE id=?', 'replacement');
  const parent = await db.get('SELECT * FROM agents WHERE id=?', 'recovery-parent');
  assert.ok(await authority.delegation(db, {agent, parent}), 'Actual startup authority accepts the new private identity.');
  assert.equal((await db.get('SELECT workspace_id FROM agents WHERE id=?', 'failed-worker')).workspace_id,
    'trinity_workspace_failed-worker');
  assert.equal((await db.get('SELECT workspace_id FROM lineage_nodes WHERE id=?', 'replacement')).workspace_id,
    workspace.workspaceId);
  assert.equal((await db.get('SELECT agent_id FROM trinity_worlds WHERE id=?', 'world')).agent_id, 'replacement');
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM trinity_worlds')).count, 1);
}

async function main() {
  try {await scenario(await database.getDatabase());}
  finally {
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await database.closeDatabase();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('trinity-recovery-scope-'));
    fs.rmSync(root, {recursive: true, force: true});
  }
  console.log('Trinity replacement receives a fresh sealed private capsule, valid startup authority and lineage; foreign scope and altered snapshots are refused atomically: PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
