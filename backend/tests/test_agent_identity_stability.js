const assert = require('node:assert/strict');
const identity = require('../src/services/agentIdentityService');

const first = identity.generateAgentIdentity({ role: 'worker', stableKey: 'orchestrator-1/worker-1' });
const second = identity.generateAgentIdentity({ role: 'worker', stableKey: 'orchestrator-1/worker-1' });
assert.deepEqual(second, first);
assert.notEqual(identity.generateAgentIdentity({ role: 'worker', stableKey: 'orchestrator-1/worker-2' }).name, first.name);
console.log('Agent identities are stable and collision-resistant for stable keys.');