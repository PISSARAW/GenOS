'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {open} = require('sqlite');
const sqlite3 = require('sqlite3');
const {ownsReplaySnapshot} = require('../src/services/agents/workerContractEnforcement');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gqwf-replay-scope-'));
  const db = await open({filename: ':memory:', driver: sqlite3.Database});
  const lease = '11111111-1111-4111-8111-111111111111';
  const container = path.join(root, '.genos/gqwf/materialized/lease-' + lease);
  const execution = path.join(container, 'root');
  const snapshot = path.join(execution, '.genos/evidence-snapshots/run.json');
  try {
    await fs.mkdir(path.dirname(snapshot), {recursive: true});
    await fs.writeFile(path.join(container, '.genos-gqwf-lease'), lease);
    await fs.writeFile(snapshot, JSON.stringify({agent_id: 'cell-id', snapshot_id: 'snap-owned'}));
    await db.exec(`CREATE TABLE agents(id, execution_mode, workspace_id);
      CREATE TABLE workspaces(id,path); CREATE TABLE strategy_execution_runs(id,agent_id,status);
      CREATE TABLE gqwf_leases(id,workspace_id,execution_path,status);
      CREATE TABLE gqwf_execution_sessions(agent_id,workspace_id,execution_run_id,lease_id,materialized_path,status);`);
    await db.run("INSERT INTO agents VALUES ('worker','worker','ws')");
    await db.run("INSERT INTO workspaces VALUES ('ws',?)", root);
    await db.run("INSERT INTO strategy_execution_runs VALUES ('run','worker','running')");
    await db.run("INSERT INTO gqwf_leases VALUES (?,'ws',?,'open')", lease, execution);
    await db.run("INSERT INTO gqwf_execution_sessions VALUES ('worker','ws','run',?,?,'materialized')", lease, execution);
    const request = {db, agentId: 'worker', reference: snapshot, suppliedRoot: execution};
    assert.equal(await ownsReplaySnapshot(request), true);
    assert.equal(await ownsReplaySnapshot({...request, suppliedRoot: root}), false);
    assert.equal(await ownsReplaySnapshot({...request, agentId: 'foreign'}), false);
    await db.run("UPDATE gqwf_leases SET status='released'");
    assert.equal(await ownsReplaySnapshot(request), false);
    await db.run("UPDATE gqwf_leases SET status='open'");
    await db.run("UPDATE strategy_execution_runs SET agent_id='foreign'");
    assert.equal(await ownsReplaySnapshot(request), false);
    await db.run("UPDATE strategy_execution_runs SET agent_id='worker'");
    await db.run("UPDATE agents SET execution_mode='orchestrator'");
    assert.equal(await ownsReplaySnapshot(request), true);
    assert.equal(await ownsReplaySnapshot({...request, suppliedRoot: root}), false);
    await db.run("UPDATE strategy_execution_runs SET status='completed'");
    assert.equal(await ownsReplaySnapshot(request), false);
    await db.run("UPDATE strategy_execution_runs SET status='running'");
    await fs.writeFile(path.join(container, '.genos-gqwf-lease'), 'tampered');
    assert.equal(await ownsReplaySnapshot(request), false);
    console.log('Active GQWF replay scope, foreign worker/run, released lease and tampered ownership: PASS');
  } finally {await db.close(); await fs.rm(root, {recursive: true, force: true});}
}
main().catch(error => {console.error(error); process.exitCode = 1;});
