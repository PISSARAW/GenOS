'use strict';

const assert = require('node:assert/strict');
const { validateComparativeMission, validateComparativeResult } = require('../src/services/comparativeMissionContract');

const mission = {
  schemaVersion: '1', missionId: 'schedule-v1',
  problem: {
    domain: 'scheduling', statement: 'Minimize the makespan.',
    inputs: { jobs: { A: 2, B: 3 }, machines: 2 }, constraints: ['Assign every job once.'],
    objective: { metric: 'makespan', direction: 'minimize', unit: 'time' }
  },
  populations: ['greedy', 'dynamic'].map((method) => ({
    id: method, method, localObjectives: ['produce a valid schedule'],
    fitness: { metric: 'makespan', direction: 'minimize' }, evidenceRequirements: ['machine assignments']
  })),
  migration: { enabled: true, requireLocalValidation: true, prohibitWholeSolutionCopy: true },
  reproducibility: { seed: 'case-1', maxRuntimeMs: 10000, maxTokens: 4000 }
};

assert.equal(validateComparativeMission(mission), mission);
assert.throws(() => validateComparativeMission({ ...mission, populations: [mission.populations[0]] }),
  { code: 'COMPARATIVE_MISSION_INVALID' });
assert.throws(() => validateComparativeMission({ ...mission,
  migration: { ...mission.migration, requireLocalValidation: false } }),
{ code: 'COMPARATIVE_MISSION_INVALID' });
assert.throws(() => validateComparativeResult({ missionId: 'm', populationId: 'p', method: 'dp',
  evidence: ['proof'], fitness: 2, migrations: [{ ideaId: 'i', decision: 'accepted', reason: 'better' }], unresolvedRisks: [] }),
{ code: 'COMPARATIVE_MISSION_INVALID' });
assert.equal(validateComparativeResult({ missionId: 'm', populationId: 'p', method: 'dp',
  evidence: ['proof'], fitness: 2,
  migrations: [{ ideaId: 'i', decision: 'accepted', reason: 'better', localValidation: true }],
  unresolvedRisks: [] }).fitness, 2);

console.log('Comparative mission contract: PASS');
