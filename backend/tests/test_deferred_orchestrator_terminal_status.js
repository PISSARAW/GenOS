'use strict';

const assert = require('node:assert/strict');

async function main() {
  const statePath = require.resolve('../src/services/agentOrchestrationState');
  const original = require.cache[statePath];
  const updates = [];
  require.cache[statePath] = { id: statePath, filename: statePath, loaded: true,
    exports: { updateAgent: async (...args) => updates.push(args) } };
  try {
    const finalization = require('../bin/orchestratorMissionFinalization.cjs');
    await finalization.settleDeferredAgent({ agentId: 'orchestrator', status: 'completed', verdict: 'completed' });
    assert.deepEqual(updates, [['orchestrator', 'completed', 'Mission completed']]);
  } finally {
    if (original) require.cache[statePath] = original;
    else delete require.cache[statePath];
    delete require.cache[require.resolve('../bin/orchestratorMissionFinalization.cjs')];
  }
  console.log('deferred orchestrator terminal status: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
