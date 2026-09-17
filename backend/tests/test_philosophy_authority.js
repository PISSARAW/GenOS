'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/toolLeasePolicy');
const effects = require('../src/services/philosophyRuntimeEffectService');

const worker = policy.workerLeaseForRole('implementation');
const orchestrator = policy.orchestratorLeaseForPlan({});
assert.ok(worker.includes('genos_philosophy'));
assert.ok(orchestrator.includes('genos_philosophy'));
assert.deepEqual(
  policy.restrictProvidedLease(['genos_philosophy', 'genos_orchestrate', 'genos_unknown'], worker),
  ['genos_philosophy']
);
assert.deepEqual(policy.staleLeaseTools({ execution_mode: 'worker', role: 'implementation' }, ['genos_orchestrate']), ['genos_orchestrate']);
assert.deepEqual(Object.keys(effects.EFFECTS).sort(), ['hold_promotion', 'prefer_observation', 'require_evidence']);
assert.throws(
  () => effects.applyRuntimeEffect({ concept: 'school.kantianism', agentId: 'worker-1', effect: 'genos_orchestrate', apply: true }),
  /Unsupported philosophy runtime effect/
);
console.log('Philosophy authority and lease checks: PASS');
