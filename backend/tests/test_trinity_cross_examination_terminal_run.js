'use strict';

const assert = require('node:assert/strict');
const { examine } = require('../src/services/trinityCrossExaminationService');

function database(runId) {
  return {
    async get() {
      return { workspace_id: 'world-1', status: 'idle', workspace_root: 'C:\\worker',
        execution_run_id: 'run-current', execution_run_status: 'completed' };
    },
    async all() {
      return [{ event_type: 'AGENT_COMPLETED',
        payload_json: JSON.stringify({ executionRunId: runId }) }];
    }
  };
}

async function main() {
  const world = { worldNumber: 1, agentId: 'worker-1', report: { claims: [] } };
  const current = await examine(database('run-current'), [world]);
  assert.equal(current.status, 'complete');
  assert.equal(current.worlds[0].status, 'no_claims');

  const stale = await examine(database('run-previous'), [world]);
  assert.equal(stale.status, 'partial');
  assert.equal(stale.worlds[0].status, 'unresolved');
  assert.equal(stale.worlds[0].reason, 'world_not_terminal');

  console.log('Trinity cross-examination binds terminal evidence to the current run: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
