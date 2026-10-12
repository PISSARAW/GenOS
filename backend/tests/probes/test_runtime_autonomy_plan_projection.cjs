'use strict';

const assert = require('node:assert/strict');
const { runtimeAutonomyPlan } = require('../../src/services/agentMissionEnvelopeService');

const requiredTools = ['genos_snapshot', 'genos_search_failures'];
const plan = { schema: 'genos.autonomous-orchestration/v1alpha1',
  requiredTools, mandatoryTools: requiredTools, phases: [{ key: 'factual_source_baseline',
    required: true, requiredTools, purpose: 'Establish the source baseline.' }],
  morphogenesisPlan: 'x'.repeat(700000), workerResults: 'x'.repeat(200000),
  completedWorkerDossiers: Array.from({ length: 19 }, () => ({ report: 'x'.repeat(10000) })) };
const projected = runtimeAutonomyPlan(plan);
assert.ok(Buffer.byteLength(JSON.stringify(projected)) < 1024 * 1024,
  'runtime autonomy envelope must fit the bridge stdin limit');
assert.deepEqual(projected.requiredTools, requiredTools);
assert.deepEqual(projected.mandatoryTools, requiredTools);
assert.deepEqual(projected.phases, plan.phases);
assert.equal(projected.morphogenesisPlan, undefined);
assert.equal(projected.workerResults, undefined);
assert.equal(projected.completedWorkerDossiers, undefined);

const synthesis = { synthesisOnly: true, completedWorkerIds: ['worker-1'],
  requiredTools, nativeMissionPlan: { schema: 'native/v1', workers: ['worker-1'] },
  completedWorkerDossiers: [{ workerId: 'worker-1', evidence: ['source://1'] }],
  morphogenesisPlan: { privateTrace: 'x'.repeat(700000) } };
assert.deepEqual(runtimeAutonomyPlan(synthesis), { synthesisOnly: true,
  completedWorkerIds: synthesis.completedWorkerIds, requiredTools,
  nativeMissionPlan: synthesis.nativeMissionPlan,
  completedWorkerDossiers: synthesis.completedWorkerDossiers },
  'runtime synthesis keeps final-report source dossiers and omits oversized traces');
process.stdout.write('Runtime autonomy projection preserves mandatory tools and bounds native-plan input size.\n');
