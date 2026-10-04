'use strict';
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function child(file) {
  const process = fork(require.resolve('./fixtures/successionProcess.cjs'), [], { env: { ...global.process.env, TEST_DB: file }, stdio: ['ignore','ignore','inherit','ipc'] });
  await once(process,'message'); return process;
}
async function call(process, input) { const reply = once(process,'message'); process.send(input); return (await reply)[0]; }
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'genos-succession-process-'));
  const file = path.join(dir,'mission.sqlite'); const children = [];
  const db = await open({ filename: file, driver: sqlite3.Database });
  try {
    await db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE missions(mission_id TEXT PRIMARY KEY, objective TEXT, orchestrator_agent_id TEXT,status TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE agents(id TEXT PRIMARY KEY,parent_agent_id TEXT,runtime_pid INTEGER);
      CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT,role TEXT,PRIMARY KEY(mission_id,agent_id));
      CREATE TABLE effects(agent_id TEXT); INSERT INTO missions VALUES('mission','resume','old','dormant',NULL,NULL);
      INSERT INTO agents(id,parent_agent_id) VALUES('old',NULL),('a',NULL),('b',NULL),('worker','old');
      INSERT INTO mission_agents VALUES('mission','old','orchestrator');`);
    const a = await child(file); const b = await child(file); children.push(a,b);
    const outcomes = await Promise.all([a,b].map((process,index) => call(process, { missionId:'mission',agentId:index ? 'b':'a',expectedOrchestratorId:'old' })));
    assert.equal(outcomes.filter(result => result.result?.started).length,1);
    assert.equal((await db.all('SELECT * FROM effects')).length,1,'loser cannot execute before authority arbitration');
    for (const agentId of ['old','worker']) assert.equal((await call(b,{ action:'assert',agentId })).error,'MISSION_AUTHORITY_STALE');
    const winner = (await db.get('SELECT orchestrator_agent_id FROM missions')).orchestrator_agent_id;
    const duplicate = await call(b,{ missionId:'mission',agentId:winner,expectedOrchestratorId:winner });
    assert.equal(duplicate.result.duplicate,true);
    assert.equal((await db.all('SELECT * FROM effects')).length,1);
    const reserved = await call(a,{ action:'reserve',missionId:'mission',agentId:'replacement',expectedOrchestratorId:winner });
    assert.equal(reserved.reserved.state,'reserved');
    a.kill(); await once(a,'exit');
    const recovered = await child(file); children.push(recovered);
    const result = await call(recovered,{ missionId:'mission',agentId:'replacement',expectedOrchestratorId:'replacement' });
    assert.equal(result.result.started,true,'reservation survives distinct process restart');
    assert.equal((await db.get('SELECT state FROM mission_execution_authority')).state,'running');
    const claimed = await call(b,{ action:'claim',missionId:'mission',agentId:'after_claim',expectedOrchestratorId:'replacement' });
    assert.equal(claimed.claimed,true);
    b.kill(); await once(b,'exit');
    const afterCrash = await child(file); children.push(afterCrash);
    const resumed = await call(afterCrash,{ missionId:'mission',agentId:'after_claim',expectedOrchestratorId:'after_claim' });
    assert.equal(resumed.result.started,true,'launching lease survives an owner process crash');
    assert.equal((await db.get('SELECT state FROM mission_execution_authority')).state,'running');
    console.log('Two SQLite-backed processes: single successor, stale authority blocked, reserved and launching crashes recovered: PASS');
  } finally {
    await Promise.all(children.filter(process => process.exitCode === null && !process.killed).map(async process => { process.kill(); await once(process,'exit'); }));
    await db.close(); await fs.rm(dir,{ recursive:true,force:true });
  }
}
main().catch(error => { console.error(error); global.process.exitCode=1; });
