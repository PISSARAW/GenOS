'use strict';

const assert = require('node:assert/strict');
const { shouldAttachMissionOrchestrator } = require('../bin/orchestratorMissionHelpers.cjs');

assert.equal(shouldAttachMissionOrchestrator('dispatch_trinity', 'mission-1'), true);
assert.equal(shouldAttachMissionOrchestrator('orchestrate', 'mission-1'), true);
assert.equal(shouldAttachMissionOrchestrator('dispatch_worker', 'mission-1'), false);
assert.equal(shouldAttachMissionOrchestrator('dispatch_worker', 'mission-1', true), true);
assert.equal(shouldAttachMissionOrchestrator('dispatch_worker', null), false);

console.log('orchestrator mission attachment checks passed');
