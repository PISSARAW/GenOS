'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const service = require('../src/services/trinityDispatchPreparation');
function database() {
  const state = { experiment: null, worlds: new Map(), writes: [] };
  return { state,
    get: async (sql, ...args) => {
      if (sql.includes('FROM trinity_experiments')) return state.experiment;
      if (sql.includes('FROM trinity_worlds')) return state.worlds.get(args[1]);
      return null;
    },
    run: async (sql, ...args) => {
      state.writes.push({ sql, args });
      if (sql.includes('INSERT INTO trinity_experiments')) state.experiment = { id: args[0], mission_id: args[1], domain: args[2], mission_snapshot_hash: args[3], design_json: args[4], isolation_policy_json: args[5], budget_policy_json: args[6], status: 'designed' };
      if (sql.includes('UPDATE trinity_experiments SET status')) state.experiment.status = args[0];
      return { changes: 1 };
    }
  };
}
async function main() {
  const base = path.resolve('.genos-agent-worlds');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'trinity-preparation-'));
  assert.ok(root.startsWith(base + path.sep));
  try {
    const source = path.join(root, 'source');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'artifact.js'), 'original');
    await fs.writeFile(path.join(source, '.env'), 'FAKE_TEST_SECRET=never-copy');
    const db = database();
    const input = { context: { request: { executionBudget: { tokens: 900 } }, repoRoot: root, orchestratorId: 'orch' },
      parent: { workspace_root: source }, missionId: 'sealed-mission', mission: 'Compare implementations', members: [1, 2, 3], selection: {} };
    const sealed = await service.prepare(db, input);
    assert.equal(db.state.experiment.status, 'sealed_running');
    assert.equal(await fs.readFile(path.join(sealed.snapshotRoot, 'artifact.js'), 'utf8'), 'original');
    await assert.rejects(fs.access(path.join(sealed.snapshotRoot, '.env')));
    await fs.writeFile(path.join(source, 'artifact.js'), 'parent changed');
    assert.equal((await service.prepare(db, input)).idempotent, true);
    const changedBudget = { ...input, context: { ...input.context, request: { executionBudget: { tokens: 1200 } } } };
    await assert.rejects(service.prepare(db, changedBudget), { code: 'TRINITY_EXPERIMENT_ID_CONFLICT' });
    db.state.worlds.set('worker', { agent_id: 'worker' });
    const scope = { trinityExperimentId: input.missionId };
    const context = { id: 'worker', orchestratorId: 'orch', request: { missionScope: scope } };
    assert.equal(await service.sourceFor(db, { context, parent: {} }), sealed.snapshotRoot);
    await assert.rejects(service.sourceFor(db, { context: { ...context, orchestratorId: 'other' }, parent: {} }), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
    const clone = path.join(root, 'private-worker');
    await fs.cp(sealed.snapshotRoot, clone, { recursive: true });
    assert.equal(await service.bindWorker(db, { scope, workerId: 'worker', workspaceRoot: clone }), 'trinity_workspace_worker');
    assert.ok(db.state.writes.some(write => write.sql.includes('INTO workspaces') && write.sql.includes("'Private'")));
    await fs.writeFile(path.join(clone, 'artifact.js'), 'changed');
    await assert.rejects(service.bindWorker(db, { scope, workerId: 'worker', workspaceRoot: clone }), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
    assert.deepEqual(service.restrictLease(scope, ['genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session', 'genos_change_organization', 'genos_search_failures']), ['genos_search_failures']);
    await fs.writeFile(path.join(sealed.snapshotRoot, 'artifact.js'), 'tampered sealed state');
    await assert.rejects(service.prepare(db, input), { code: 'TRINITY_SNAPSHOT_MISMATCH' });
    console.log('Trinity atomic snapshots, replay, private workspace binding and sealed lease: PASS');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
