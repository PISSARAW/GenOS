'use strict';

const assert = require('node:assert/strict');
const { getWorkerStatusForMember } = require('../src/services/communication/organizationWorkerStatus');

async function testRosterScopeAndLimit() {
  const calls = [];
  const db = { all: async (sql, ...params) => {
    calls.push({ sql, params });
    return [{ workerId: 'child-1', status: 'running' }];
  } };
  const access = {
    assertOrchestrator: async (...args) => calls.push({ access: 'orchestrator', args }),
    assertMember: async (...args) => calls.push({ access: 'member', args })
  };
  const result = await getWorkerStatusForMember(db, {
    orchestratorId: 'root-1', requesterAgentId: 'member-1', limit: 500
  }, access);
  assert.deepEqual(result.workers, [{ workerId: 'child-1', status: 'running' }]);
  assert.deepEqual(calls.slice(0, 2).map((call) => call.access), ['orchestrator', 'member']);
  assert.match(calls[2].sql, /parent_agent_id = \?/);
  assert.match(calls[2].sql, /execution_mode = 'worker'/);
  assert.match(calls[2].sql, /LIMIT \?/);
  assert.deepEqual(calls[2].params, ['root-1', 50]);
}

async function testSingleWorkerRemainsParentScoped() {
  let query;
  const db = { all: async (sql, ...params) => { query = { sql, params }; return []; } };
  const access = { assertOrchestrator: async () => {}, assertMember: async () => {} };
  await getWorkerStatusForMember(db, {
    orchestratorId: 'root-2', requesterAgentId: 'root-2', workerId: 'child-2'
  }, access);
  assert.match(query.sql, /parent_agent_id = \?/);
  assert.match(query.sql, /execution_mode = 'worker'/);
  assert.match(query.sql, /id = \?/);
  assert.deepEqual(query.params, ['root-2', 'child-2']);
}

async function testAccessDenialStopsBeforeQuery() {
  let queried = false;
  const db = { all: async () => { queried = true; return []; } };
  const access = {
    assertOrchestrator: async () => {},
    assertMember: async () => { throw new Error('not a member'); }
  };
  await assert.rejects(getWorkerStatusForMember(db, {
    orchestratorId: 'root-3', requesterAgentId: 'outsider'
  }, access), /not a member/);
  assert.equal(queried, false);
}

Promise.all([
  testRosterScopeAndLimit(),
  testSingleWorkerRemainsParentScoped(),
  testAccessDenialStopsBeforeQuery()
]).then(() => process.stdout.write('Worker status scope checks passed.\n'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
