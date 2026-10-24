'use strict';

const assert = require('node:assert/strict');
const { requiredRuntimeTools } = require('../src/services/agentRuntimeRequiredTools');

assert.deepEqual([...requiredRuntimeTools({}, { autonomyPlan: { mandatoryTools: ['genos_snapshot'] } })],
  ['genos_snapshot']);
assert.deepEqual([...requiredRuntimeTools({ autonomousOrchestration: false },
  { autonomyPlan: { mandatoryTools: ['genos_snapshot'] } })], [],
'a mission with autonomous orchestration disabled must not fail for unused plan phases');
assert.ok(requiredRuntimeTools({ workerKind: 'bounded_worker', communicationRequired: true,
  organization: 'cross_functional_pod' }, { isWorker: true }).size > 0,
  'worker MCP preflight requirements remain enforced');
process.stdout.write('Runtime-required tool policy respects autonomous orchestration mode: PASS\n');
