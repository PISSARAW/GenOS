'use strict';

const assert = require('node:assert/strict');
const endocrine = require('../src/services/shev/developmentalEndocrineBridge');

async function main() {
  const pressure = endocrine.calculatePressure([
    { dimension: 'planning', kind: 'capability_gap', epistemic_status: 'observed' },
    { dimension: 'planning', kind: 'degradation', epistemic_status: 'observed' },
    { dimension: 'memory', kind: 'state', epistemic_status: 'observed' }
  ], [{ dimension: 'planning', current_phase: 'relapsed' }]);
  assert.ok(pressure.developmentalPressure > 0);
  const jobs = endocrine.prioritizeJobs([{ id: 'memory', dimension: 'memory' },
    { id: 'planning', dimension: 'planning' }], pressure.profile);
  assert.equal(jobs[0].id, 'planning');
  const calls = [];
  const result = await endocrine.secretePressure({ db: { all: async (sql) =>
    sql.includes('JOIN shev_observations')
      ? [{ dimension: 'planning', current_phase: 'relapsed' }]
      : [{ dimension: 'planning', kind: 'capability_gap', epistemic_status: 'observed' }] },
  projectId: 'project', jobs: [{ dimension: 'planning', id: 'job' }],
  authorization: { requiresExplicitAuthorization: true },
  verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:endocrine' }),
  modulateEndocrine: async (event) => { calls.push(event); } });
  assert.equal(calls[0].signal, 'developmental_pressure');
  assert.equal(calls[0].hormone, 'somatotropin');
  assert.equal(result.promotionEligible, false);
  assert.ok(result.priorities[0].developmentalPriority > 0);
  console.log('Developmental endocrine pressure and curriculum prioritization checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
