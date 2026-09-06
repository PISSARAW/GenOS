const assert = require('node:assert/strict');
const { machineLoad } = require('../src/services/agentModelRoutingService');

const first = machineLoad();
assert(first === null || (Number.isFinite(first) && first >= 0));
console.log('Local worker load measurement is safe on this platform.');