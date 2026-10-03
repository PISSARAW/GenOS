'use strict';

const assert = require('node:assert/strict');
const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');

const event = buildMorphogenesisEvent({
  topology: 'mesh',
  agents: [{ role: 'worker' }],
  receipt: { committed: true, transitionId: 'tx-42' }
}, 'orchestrator-1');

assert.equal(event.eventType, 'MORPHOGENESIS_COMPLETED');
assert.equal(event.action, 'MORPHO_COMMITTED');
assert.deepEqual(event.payload, { topology: 'mesh', committed: true, transitionId: 'tx-42', commitId: null });
assert.equal(event.severity, 'info');
console.log('Morphogenesis transition telemetry: PASS');
