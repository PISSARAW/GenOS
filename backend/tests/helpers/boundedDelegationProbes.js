'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./biologyDatabase');
const { withTransaction } = require('../../src/db');
const bounded = require('../../src/services/agents/boundedDelegationAuthority');
const authority = require('../../src/services/agentAuthorityService');

const request = { agentId: 'delegation-child', orchestratorAgentId: 'delegation-sub' };

async function currentRefusals(db) {
  await db.run("UPDATE agents SET status='error' WHERE id='delegation-root'");
  await assert.rejects(authority.authorizeMission(db, request));
  await db.run("UPDATE agents SET status='running' WHERE id='delegation-root'");
  await db.run("DELETE FROM mission_agents WHERE mission_id='delegation-mission' AND agent_id='delegation-sub'");
  await assert.rejects(authority.authorizeMission(db, request), { code: 'DELEGATION_BINDING_INVALID' });
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('delegation-mission','delegation-sub','sub_orchestrator')");
  const row = await db.get("SELECT metadata_json FROM agents WHERE id='delegation-sub'");
  const metadata = JSON.parse(row.metadata_json);
  metadata.workerContract.delegationExpiresAt = Date.now() - 1;
  await db.run("UPDATE agents SET metadata_json=? WHERE id='delegation-sub'", JSON.stringify(metadata));
  await assert.rejects(authority.authorizeMission(db, request), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
  await db.run("UPDATE agents SET metadata_json=? WHERE id='delegation-sub'", row.metadata_json);
}

async function reserve(db, input) {
  return withTransaction(db, async () => {
    await input.addChild(db, { id: input.id, tokens: input.tokens, native: input.native });
    return bounded.bind(db, { parentId: 'delegation-sub', childId: input.id, allocation: input.tokens });
  });
}

async function contention(db, options) {
  const other = openDatabase(options.filename);
  await other.exec('PRAGMA busy_timeout=5000');
  const original = db.run.bind(db);
  let entered;
  let release;
  const pending = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  db.run = async (sql, ...params) => {
    if (sql.includes('INSERT OR IGNORE INTO gvx_development_events')) { entered(); await barrier; }
    return original(sql, ...params);
  };
  try {
    const first = reserve(db, { addChild: options.addChild, id: 'delegation-budget-a', tokens: 6000 });
    await Promise.race([pending, first.then(() => { throw new Error('Reservation missed the write barrier.'); })]);
    let settled = false;
    const second = reserve(other, { addChild: options.addChild, id: 'delegation-budget-b', tokens: 6000 })
      .then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(settled, false, 'the second connection must wait for the first reservation');
    release();
    assert.equal((await first).modelTokens, 6000);
    assert.equal((await second).error.code, 'SUBORCHESTRATOR_TOKEN_LIMIT');
    assert.equal(await db.get("SELECT id FROM agents WHERE id='delegation-budget-b'"), undefined, 'rejected child insertion rolls back');
  } finally { release(); db.run = original; await other.close(); }
}

async function lifetimeLimits(db, options) {
  await reserve(db, { addChild: options.addChild, id: 'delegation-budget-c', tokens: 4000 });
  await db.run("DELETE FROM agents WHERE id='delegation-budget-a'");
  const capacity = await bounded.capacity(db, await bounded.parent(db, 'delegation-sub'));
  assert.deepEqual(capacity, { count: 4, remainingChildren: 1, remainingTokens: 0 });
  await assert.rejects(reserve(db, { addChild: options.addChild, id: 'delegation-over-budget', tokens: 1 }),
    { code: 'SUBORCHESTRATOR_TOKEN_LIMIT' });
  await reserve(db, { addChild: options.addChild, id: 'delegation-native-last', tokens: 0, native: true });
  await assert.rejects(reserve(db, { addChild: options.addChild, id: 'delegation-sixth', tokens: 0, native: true }),
    { code: 'SUBORCHESTRATOR_CHILD_LIMIT' });
  const reopened = openDatabase(options.filename);
  try {
    assert.equal((await authority.authorizeMission(reopened, request)).id, request.agentId);
    await assert.rejects(bounded.capacity(reopened, await bounded.parent(reopened, 'delegation-sub')),
      { code: 'SUBORCHESTRATOR_CHILD_LIMIT' });
  } finally { await reopened.close(); }
}

async function qualify(db, options) {
  await currentRefusals(db);
  await contention(db, options);
  await lifetimeLimits(db, options);
  console.log('Bounded delegation: current authority, expiry, mission membership, two-connection reservation, rollback and lifetime ceilings passed.');
}

module.exports = { qualify };
