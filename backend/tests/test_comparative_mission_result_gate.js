'use strict';

const assert = require('node:assert/strict');
const { read } = require('../src/services/metapopulation/metapopulationMissionResultService');
const { loadFixture, renderFixtureMission } = require('../src/services/comparativeMissionFixtureService');
const fixture = require('./helpers/authoritativeEvidenceFixture');

function evidence(answer, method) {
  const statement = JSON.stringify({ answer, submission: { schedule: 'locally checked' } });
  return { outcome: 'success', claims: [{ statement: `Method ${method}. ${statement}`, evidence: ['fixture input'] }] };
}

async function main() {
  const fixtureMission = `${renderFixtureMission(loadFixture('level-1'))}\nAssigned method: gloutonne.`;
  const validAnswer = 'Méthode gloutonne. Machine 1 -> E (6), B (3), A (2). Machine 2 -> D (5), C (4). Makespan = 11.';
  const missionId = 'comparative-mission';
  const member = { workerId: 'w1', role: 'greedy', mission: fixtureMission };
  const db = fixture.database([fixture.record({ workerId: 'w1', missionId,
    runId: 'comparative-valid', report: evidence(validAnswer, 'gloutonne') })]);
  const result = await read(db, { member, missionId });
  assert.equal(result.status, 'completed');
  assert.equal(result.domainValidation.valid, true);
  const invalidMember = { workerId: 'w2', role: 'greedy', mission: fixtureMission };
  const invalidDb = fixture.database([fixture.record({ workerId: 'w2', missionId,
    runId: 'comparative-invalid',
    report: evidence('Method gloutonne. Machine 1 -> A (2). Makespan = 2.', 'gloutonne') })]);
  const invalid = await read(invalidDb, { member: invalidMember, missionId });
  assert.equal(invalid.status, 'unverified');
  assert.equal(invalid.domainValidation.valid, false);
}

main().then(() => console.log('Comparative mission result gate: PASS'));
