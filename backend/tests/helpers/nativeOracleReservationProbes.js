'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { openDatabase } = require('./biologyDatabase');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function contention(db, dispatch) {
  const other = openDatabase(process.env.GENOS_DB_PATH);
  await other.exec('PRAGMA busy_timeout=5000');
  const original = db.run.bind(db);
  let entered;
  let release;
  const pending = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  db.run = async (sql, ...params) => {
    if (sql.includes('INSERT OR IGNORE INTO gvx_development_events')
        && params.flat().some(value => typeof value === 'string' && value.endsWith(':native-oracle-reservation'))) {
      entered(); await barrier;
    }
    return original(sql, ...params);
  };
  let first;
  try {
    first = dispatch();
    await Promise.race([pending, first.then(() => { throw new Error('Native reservation missed the write barrier.'); })]);
    const row = await db.get('SELECT id,agent_id FROM strategy_execution_runs ORDER BY rowid DESC LIMIT 1');
    const request = { runId: row.id, agentId: row.agent_id };
    let settled = false;
    const second = journal.reserve(other, request).then(value => { settled = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(settled, false, 'second connection waits for the actual durable reservation');
    release();
    assert.equal((await second).owned, false);
    await first;
    await freshProcess(request);
  } finally { release(); db.run = original; await first?.catch(() => {}); await other.close(); }
  console.log('Native reservation: concurrent connection receives no second allocation; fresh process reuses sealed attestation.');
}

async function freshProcess(request) {
  const script = `process.env.GENOS_DISABLE_DOTENV='1';const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    require('./backend/src/services/epistemic/nativeOracleCoordinator').prepare(db,JSON.parse(process.argv[2]))
    .then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());`;
  const child = spawnSync(process.execPath, ['-e', script, process.env.GENOS_DB_PATH, JSON.stringify(request)],
    { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  const db = openDatabase(process.env.GENOS_DB_PATH);
  try {
    const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, request.runId);
    const attestation = await journal.read(db, { ...request, scope: authority.envelope.scope, kind: 'attestation' });
    assert.deepEqual(JSON.parse(child.stdout), { eventId: attestation.eventId, hash: attestation.hash });
    assert.equal(attestation.value.costs.processes, 2);
  } finally { await db.close(); }
}

module.exports = { contention };
