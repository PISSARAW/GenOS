'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fixture = require('./helpers/authoritativeEvidenceFixture');
const semantic = require('../src/services/biologicalSemanticValidationService');
const metapopulation = require('../src/services/metapopulation/metapopulationMissionResultService');

function report(answer = 'authoritative answer') {
  return { outcome: 'success', answer,
    semanticClaims: [{ subject: 'scope', predicate: 'bound', value: true, evidence: ['receipt:1'] }] };
}

async function ambiguityFailsClosed() {
  const records = ['first', 'second'].map((runId) => fixture.record({
    workerId: 'worker-a', missionId: 'mission-a', runId, report: report(runId)
  }));
  const result = await semantic.validate(fixture.database(records),
    { members: [{ workerId: 'worker-a' }], missionId: 'mission-a' });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.coveredWorkers, 0);
}

async function foreignMissionFailsClosed() {
  const db = fixture.database([fixture.record({ workerId: 'worker-b', missionId: 'mission-old',
    runId: 'old-run', report: report('stale success') })]);
  const member = { workerId: 'worker-b', role: 'solver', mission: 'Return a checked answer.' };
  const result = await metapopulation.read(db, { member, missionId: 'mission-current' });
  assert.equal(result.status, 'unverified');
  assert.equal(result.verified, false);
  assert.equal(result.answer, null);
}

async function rhizomeRejectsForeignEvidence() {
  const coordinationPath = require.resolve('../src/services/rhizomeCoordinationService');
  require.cache[coordinationPath] = { id: coordinationPath, filename: coordinationPath,
    loaded: true, exports: { graphSnapshot: async () => ({ nodes: [], edges: [], graphVersion: 1 }),
      addCapabilityNode: async () => undefined, addCapabilityEdge: async () => undefined } };
  const servicePath = path.resolve(__dirname, '../src/services/rhizome/rhizomeMissionResultService.js');
  delete require.cache[servicePath];
  const rhizome = require(servicePath);
  const db = fixture.database([fixture.record({ workerId: 'worker-c', missionId: 'mission-foreign',
    runId: 'foreign-run', report: report('{"answer":"stale","capabilities":[],"unknownDependencies":[],"interfaces":[],"assumptions":[],"evidence":["x"]}') })]);
  const result = await rhizome.collect(db, { sessionId: 'session-a',
    workers: [{ workerId: 'worker-c', role: 'branch' }], missionId: 'mission-current' });
  assert.equal(result.status, 'partial');
  assert.equal(result.complete, false);
  assert.equal(result.branches[0].evidenceEventId, null);
}

async function main() {
  await ambiguityFailsClosed();
  await foreignMissionFailsClosed();
  await rhizomeRejectsForeignEvidence();
  console.log('Specialized result correlation: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
