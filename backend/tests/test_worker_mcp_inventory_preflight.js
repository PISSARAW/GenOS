'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const preflight = require('../bin/worker-mcp-inventory-preflight.cjs');

const required = preflight.requiredWorkerTools({
  organization: 'cross_functional_pod', coordinationPolicy: { communicationCadence: 'continuous_sync' }
});
assert.deepEqual(required, [...preflight.COORDINATION_TOOLS]);
assert.deepEqual(preflight.requiredWorkerTools({ organization: 'specialist_expert_committee' }), []);
assert.equal(preflight.coordinationWaitMs({}), 120000);
assert.equal(preflight.coordinationWaitMs({ executionBudget: { latencyMs: 540000 } }), 243000);
assert.equal(preflight.coordinationWaitMs({ executionBudget: { latencyMs: 1000 } }), 30000);
assert.equal(preflight.coordinationWaitMs({ executionBudget: { latencyMs: 900000 } }), 300000);
const observedTools = new Set();
const verifiedTools = preflight.recordVerifiedCoordination({ requiredTools: new Set(required), observedTools },
  { directMessageId: 1, sharedMessageId: 2, replyMessageId: 3 });
assert.deepEqual(verifiedTools, required);
assert.deepEqual([...observedTools], required);
assert.deepEqual(preflight.recordVerifiedCoordination({ requiredTools: new Set(required), observedTools }, null), []);
const isolatedSdk = preflight.resolveSdkRoot({
  binaries: { workspace: path.join(__dirname, 'isolated-workspace-without-dependencies') }
});
assert.equal(fs.existsSync(path.join(isolatedSdk, 'dist', 'esm', 'client', 'index.js')), true);

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
  const emitted = [];
  const runtimeState = {
    ...state,
    executionMode: 'worker',
    mission: { agentId: 'worker-diagnostic', runtimeStartedAt: Date.now(), timeoutMs: 30000 },
    orchestratorAgentId: 'orchestrator-diagnostic',
    allowedCommands: [],
    allowFileEdits: false,
    executionPolicy: {},
    executionBudget: {},
    emit: (event) => emitted.push(event)
  };
  await assert.rejects(() => preflight.runWorkerMcpInventoryPreflight({
    state: runtimeState,
    binaries: { workspace: path.resolve(__dirname, '../..'), genosBinary: '', orchestratorBridge: '' },
    mcp: { mcpCommand: process.execPath,
      mcpArgs: ['-e', 'process.stderr.write("mcp bootstrap exploded"); process.exit(1)'] }
  }), (failure) => failure.message.includes('mcp bootstrap exploded'));
  assert.match(emitted.at(-1).detail, /mcp bootstrap exploded/);
}

main().then(() => console.log('Worker MCP inventory preflight: PASS'))
  .catch((failure) => { console.error(failure); process.exitCode = 1; });
