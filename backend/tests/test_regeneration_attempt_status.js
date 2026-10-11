'use strict';

const assert = require('node:assert/strict');
const { effectiveAgents } = require('../src/services/regenerationAttemptService');

async function main() {
  const agents = [
    { id: 'root', status: 'completed', execution_mode: 'orchestrator' },
    { id: 'worker_ok', status: 'idle', execution_mode: 'worker' },
    { id: 'worker_running', status: 'idle', execution_mode: 'worker' }
  ];
  const fakeDb = {
    exec: async () => {},
    all: async () => [],
    get: async (sql, id) => {
      if (sql.includes('FROM missions')) return { missionId: 'mission', orchestratorAgentId: 'root' };
      if (sql.includes('FROM strategy_execution_runs')) return { status: id === 'worker_ok' ? 'completed' : 'running' };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const effective = await effectiveAgents(fakeDb, 'mission', agents);
  assert.equal(effective.find(agent => agent.id === 'worker_ok').status, 'completed');
  assert.equal(effective.find(agent => agent.id === 'worker_running').status, 'idle');
  console.log('Idle worker outcome follows its latest execution run.');
}

main().catch(error => { console.error(error); process.exit(1); });
