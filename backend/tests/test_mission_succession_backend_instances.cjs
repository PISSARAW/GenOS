'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let sequence = 0;

function requestId() { sequence += 1; return `mission-${sequence}`; }

async function startInstance(file) {
  const child = fork(require.resolve('./fixtures/missionBackendInstance.cjs'), [], {
    env: { ...process.env, GENOS_DB_PATH: file, GENOS_DB_BOOTSTRAP_SKIP: '1', GENOS_DB_BACKUP_SKIP: '1' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  const [ready] = await once(child, 'message');
  assert.equal(ready.ready, true);
  const response = await fetch(`http://127.0.0.1:${ready.port}/livez`);
  assert.equal(response.status, 200, 'backend instance exposes its real HTTP liveness endpoint');
  child.backendPort = ready.port;
  return child;
}

async function call(child, input) {
  const id = input.requestId || requestId();
  const reply = once(child, 'message');
  child.send({ ...input, requestId: id });
  const [message] = await reply;
  assert.equal(message.requestId, id);
  return message;
}

async function waitForPhase(child, id) {
  while (true) {
    const [message] = await once(child, 'message');
    if (message.requestId === id && message.phase === 'stop-entered') return message;
  }
}

async function kill(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-succession-backend-'));
  const file = path.join(dir, 'mission.sqlite');
  const db = await open({ filename: file, driver: sqlite3.Database });
  const instances = [];
  try {
    await db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE missions(mission_id TEXT PRIMARY KEY, objective TEXT, orchestrator_agent_id TEXT,status TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE agents(id TEXT PRIMARY KEY,parent_agent_id TEXT,runtime_pid INTEGER);
      CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT,role TEXT,PRIMARY KEY(mission_id,agent_id));
      CREATE TABLE aeis_agent_dissonance(agent_id TEXT PRIMARY KEY,authority_level INTEGER);
      CREATE TABLE effects(agent_id TEXT);
      INSERT INTO missions VALUES('mission','resume','old','dormant',NULL,NULL);
      INSERT INTO agents(id,parent_agent_id) VALUES('old',NULL),('a',NULL),('b',NULL),('worker','old');
      INSERT INTO mission_agents VALUES('mission','old','orchestrator');`);
    const a = await startInstance(file);
    const b = await startInstance(file);
    instances.push(a, b);

    const outcomes = await Promise.all([
      call(a, { action: 'resume', missionId: 'mission', agentId: 'a', expectedOrchestratorId: 'old' }),
      call(b, { action: 'resume', missionId: 'mission', agentId: 'b', expectedOrchestratorId: 'old' })
    ]);
    assert.equal(outcomes.filter(result => result.result?.started === true).length, 1,
      'two live HTTP backend instances concurrently arbitrate one successor');
    assert.equal(outcomes.filter(result => result.error === 'MISSION_SUCCESSION_CONFLICT').length, 1);
    assert.equal((await db.all('SELECT * FROM effects')).length, 1);

    for (const agentId of ['old', 'worker']) {
      assert.equal((await call(b, { action: 'assert', agentId })).error, 'MISSION_AUTHORITY_STALE');
    }
    const winner = (await db.get('SELECT orchestrator_agent_id FROM missions')).orchestrator_agent_id;
    assert.equal((await call(b, { action: 'resume', missionId: 'mission', agentId: winner,
      expectedOrchestratorId: winner })).result.duplicate, true);
    assert.equal((await db.all('SELECT * FROM effects')).length, 1);

    await db.run("UPDATE missions SET status='dormant' WHERE mission_id='mission'");
    const reservation = await call(a, { action: 'reserve', missionId: 'mission', agentId: 'replacement',
      expectedOrchestratorId: winner });
    assert.equal(reservation.reserved.state, 'reserved');
    await kill(a);
    const recovered = await startInstance(file);
    instances.push(recovered);
    assert.equal((await call(recovered, { action: 'resume', missionId: 'mission', agentId: 'replacement',
      expectedOrchestratorId: 'replacement' })).result.started, true,
    'reservation persisted by one backend is resumed by a restarted backend instance');

    await db.run("UPDATE missions SET status='dormant' WHERE mission_id='mission'");
    const launchId = requestId();
    const phase = waitForPhase(b, launchId);
    b.send({ action: 'resume', requestId: launchId, pauseAfterClaim: true, missionId: 'mission',
      agentId: 'after_claim', expectedOrchestratorId: 'replacement' });
    await phase;
    assert.equal((await db.get('SELECT state FROM mission_execution_authority')).state, 'launching');
    await kill(b);
    const afterCrash = await startInstance(file);
    instances.push(afterCrash);
    assert.equal((await call(afterCrash, { action: 'resume', missionId: 'mission', agentId: 'after_claim',
      expectedOrchestratorId: 'after_claim' })).result.started, true,
    'launching lease is recovered after the owning backend instance is killed');
    assert.equal((await db.get('SELECT state FROM mission_execution_authority')).state, 'running');
    assert.equal((await db.all('SELECT * FROM effects')).length, 3,
      'one effect per successful successor launch across the two recovery cases');
    console.log('Two real backend HTTP instances on shared SQLite WAL: single successor, stale authority blocked, reservation and claimed launch recovered after process restart: PASS');
  } finally {
    await Promise.all(instances.map(async child => {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited.catch(() => {});
      }
    }));
    await db.close();
    console.log(`Preserved shared WAL fixture at ${file}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
