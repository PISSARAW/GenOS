'use strict';

const assert = require('node:assert/strict');
const { workerStatuses } = require('../src/services/aTeam/execution/dependencyExecutionService');

async function run() {
  const db = {
    get: async (sql) => String(sql).includes('strategy_execution_runs')
      ? { status: 'completed' } : { status: 'idle' }
  };
  const statuses = await workerStatuses(db, [{ workerId: 'rearmed-worker' }]);
  assert.equal(statuses.get('rearmed-worker'), 'completed');

  const active = await workerStatuses({ get: async () => ({ status: 'running' }) },
    [{ workerId: 'active-worker' }]);
  assert.equal(active.get('active-worker'), 'running');
}

run().then(() => console.log('A-Team reads terminal execution status after garage rearm.'))
  .catch((error) => { console.error(error); process.exit(1); });
