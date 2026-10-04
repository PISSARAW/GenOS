'use strict';

const assert = require('node:assert/strict');
const biologicalMode = require('../src/services/biologicalModeService');
const capabilityResolver = require('../src/services/agents/agentIncarnationPayloadService');
const variantWorkers = require('../src/services/syncytiumVariantWorkerService');
const { parseToolLease } = require('../bin/agent-runtime-session.cjs');
const { isPermanentNetworkDenial } = require('../bin/agent-runtime-stdio.cjs');

const requiredSyncytiumCapabilities = [
  'CRDT_SHARED_STATE', 'SIGNALING_BUS', 'CAUSAL_STATE', 'SEMANTIC_CONFLICTS',
  'INVARIANT_GATES', 'SELECTIVE_SYNC', 'TRANSACTIONAL_SHARED_STATE'
];

assert.deepEqual(parseToolLease('[]'), [], 'a deny-all worker lease is a valid empty lease');
assert.equal(isPermanentNetworkDenial('connect wss://chatgpt.com/backend-api/codex/responses: os error 10013'), true);
assert.equal(isPermanentNetworkDenial('temporary timeout opening wss://chatgpt.com/backend-api/codex/responses'), false);

function assertLaunchLease(member) {
  const launch = capabilityResolver.buildLaunchCapabilities({
    role: member.role,
    mode: 'syncytium',
    prompt: member.mission,
    budgetTokens: 1500,
    capabilitiesHint: member.capabilities
  });
  for (const capability of requiredSyncytiumCapabilities) {
    assert.ok(launch.capabilities.includes(capability), `${member.role} keeps ${capability}`);
  }
  assert.ok(launch.toolLease.includes('genos_topology_session'), `${member.role} receives the shared-state API`);
}

for (const member of biologicalMode.compose('syncytium', 'Shared CRDT state and synchronization')) {
  assertLaunchLease(member);
}

for (const member of variantWorkers.membersForSession({
  mission: 'Validate graph state', variantPolicy: { id: 'graph' }
})) {
  assertLaunchLease(member);
}

console.log('Syncytium dispatch capabilities and tool leases: PASS');
