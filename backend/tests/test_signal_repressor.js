const assert = require('node:assert/strict');
const repressors = require('../src/services/signalRepressorService');

const repressor = repressors.createRepressor('duplicate_hypothesis', 'already_seen', { ttlMs: 1000 });
assert.equal(repressors.applyRepressors({ kind: 'duplicate_hypothesis' }, [repressor]).accepted, false);
assert.equal(repressors.applyRepressors({ kind: 'risk' }, [repressor]).accepted, true);
console.log('Signal repressor checks passed.');
