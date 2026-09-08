const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/services/strategyExecutionService'), 'utf8');
const adaptation = require('../src/services/strategyAdaptationService');

assert.equal(typeof adaptation.useFallbackStrategyIfPrimaryFailed, 'function');
assert.match(source, /useFallbackStrategyIfPrimaryFailed\(db, agentId\)/);
console.log('Strategy fallback hook checks passed.');