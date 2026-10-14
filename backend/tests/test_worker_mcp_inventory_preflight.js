'use strict';

const assert = require('node:assert/strict');
const preflight = require('../bin/worker-mcp-inventory-preflight.cjs');

const required = preflight.requiredWorkerTools({
  organization: 'cross_functional_pod', coordinationPolicy: { communicationCadence: 'continuous_sync' }
});
assert.deepEqual(required, [...preflight.COORDINATION_TOOLS]);
assert.deepEqual(preflight.requiredWorkerTools({ organization: 'specialist_expert_committee' }), []);

async function main() {
  const state = {
    toolLease: [...required, 'genos_search_failures'],
    requiredTools: new Set(required),
    emit: () => {}
  };
  const available = state.toolLease.map((name) => ({ name }));
  const receipt = await preflight.runWorkerMcpInventoryPreflight({
    state, listTools: async () => ({ tools: available })
  });
  assert.deepEqual(receipt.availableTools, state.toolLease);
  await assert.rejects(() => preflight.runWorkerMcpInventoryPreflight({
    state, listTools: async () => ({ tools: available.filter((tool) => tool.name !== 'genos_worker_inbox') })
  }), (failure) => failure.code === 'WORKER_MCP_INVENTORY_INCOMPLETE'
    && failure.missingRequired.includes('genos_worker_inbox'));
}

main().then(() => console.log('Worker MCP inventory preflight: PASS'))
  .catch((failure) => { console.error(failure); process.exitCode = 1; });
