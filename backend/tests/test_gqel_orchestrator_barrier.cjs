'use strict';
const assert = require('node:assert/strict');
const {requiresWorkerBarrier} = require('../bin/orchestratorLocalExecutionPolicy.cjs');
assert.equal(requiresWorkerBarrier({qualityElevation: {domain: 'software_engineering'}}, {dispatchWorkers: []}), true);
assert.equal(requiresWorkerBarrier({qualityElevation: {domain: 'creative_writing'}}, {dispatchWorkers: []}), true);
assert.equal(requiresWorkerBarrier({}, {dispatchWorkers: []}), false);
assert.equal(requiresWorkerBarrier({worker_roster: {agent_count: 2}}, {dispatchWorkers: []}), true);
console.log('Global GQEL obligations cannot take the local monoworker shortcut: PASS');
