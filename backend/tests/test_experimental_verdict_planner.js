'use strict';
const assert = require('assert');
const { pidRecommendation, admissibleVerdict, transition } = require('../src/services/experimentalVerdictPlannerService');
assert.strictEqual(pidRecommendation({ target: 1, measured: 0, kp: 2 }).output, 2);
const receipt = { contractType: 'CausalInterventionReceipt', payload: { verdict: 'supported' } };
assert.strictEqual(admissibleVerdict(receipt, { protocolId: 'p', manifestHash: 'h' }).admissible, true);
assert.strictEqual(transition({ receipt, context: { protocolId: 'p', manifestHash: 'h' } }).to, 'recommended');
console.log('✅ experimental verdict planner tests passed');
