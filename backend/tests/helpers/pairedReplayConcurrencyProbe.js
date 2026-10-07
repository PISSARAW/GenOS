'use strict';

const assert = require('node:assert/strict');
const fixture = require('../fixtures/pairedReplayRunner.cjs');
const experiments = require('../../src/services/proceduralCausalExperimentService');
const replay = require('../../src/services/proceduralCausalReplayService');

async function qualify(db) {
  const { created } = await require('./pairedReplayNegativeProbes').fork(db, 'concurrent');
  let notify;
  let release;
  const claimed = new Promise(resolve => { notify = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const original = db.run;
  let intercepted = false;
  db.run = async (sql, ...params) => {
    const result = await original(sql, ...params);
    if (!intercepted && sql.includes("SET status = 'running', lease_token")) { intercepted = true; notify(); await barrier; }
    return result;
  };
  const filename = (await db.all('PRAGMA database_list')).find(row => row.name === 'main').file;
  const second = require('./biologyDatabase').openDatabase(filename);
  const first = replay.replayFork(db, fixture.replayInput(created.forkId));
  try {
    await claimed;
    await assert.rejects(replay.replayFork(second, fixture.replayInput(created.forkId)), /CAUSAL_FORK_LEASE_CONFLICT/);
  } finally { release(); db.run = original; await second.close(); }
  await first;
  const saved = await experiments.loadFork(db, created.forkId);
  assert.equal(saved.events.filter(event => event.event_type === 'RUN_RESULT').length, 1);
  console.log('Two real SQLite connections cannot replay the same leased fork concurrently.');
}

module.exports = { qualify };
