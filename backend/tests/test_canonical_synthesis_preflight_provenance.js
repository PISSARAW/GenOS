'use strict';

const assert = require('node:assert/strict');
const { cleanup } = require('../bin/agent-runtime-home.cjs');
const protocol = require('../src/services/runtimeProtocol');

const receipts = ['genos_snapshot', 'genos_search_failures'];
const decoded = protocol.decodeMission(protocol.encodeMission({ agentId: 'parent',
  preflightObservedTools: receipts }));
assert.deepEqual(decoded.preflightObservedTools, receipts,
  'verified preflight receipts must survive the framed runtime boundary');

const state = { cleanedUp: false, isolatedRuntimeRoot: null, isolatedCodexHome: null,
  latencyTimer: null };
assert.doesNotThrow(() => cleanup(state),
  'deterministic canonical synthesis has no isolated Codex home to remove');
assert.equal(state.cleanedUp, true);

console.log('Canonical synthesis preflight provenance checks passed.');
