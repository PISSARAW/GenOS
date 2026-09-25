'use strict';

const assert = require('node:assert/strict');
const { read } = require('../src/services/metapopulation/metapopulationMissionResultService');
const { loadFixture, renderFixtureMission } = require('../src/services/comparativeMissionFixtureService');

function fakeDb(report) {
  return {
    async get(query) {
      if (query.includes('FROM agents')) return { status: 'completed' };
      return { id: 11, payload_json: JSON.stringify({ evidenceReport: report }) };
    }
  };
}

function evidence(answer, method) {
  const statement = JSON.stringify({ answer, submission: { schedule: 'locally checked' } });
  return { outcome: 'success', claims: [{ statement: `Method ${method}. ${statement}`, evidence: ['fixture input'] }] };
}

async function main() {
  const fixtureMission = `${renderFixtureMission(loadFixture('level-1'))}\nAssigned method: gloutonne.`;
  const validAnswer = 'Méthode gloutonne. Machine 1 -> E (6), B (3), A (2). Machine 2 -> D (5), C (4). Makespan = 11.';
  const result = await read(fakeDb(evidence(validAnswer, 'gloutonne')), { workerId: 'w1', role: 'greedy', mission: fixtureMission });
  assert.equal(result.status, 'completed');
  assert.equal(result.domainValidation.valid, true);
  const invalid = await read(fakeDb(evidence('Method gloutonne. Machine 1 -> A (2). Makespan = 2.', 'gloutonne')),
    { workerId: 'w2', role: 'greedy', mission: fixtureMission });
  assert.equal(invalid.status, 'unverified');
  assert.equal(invalid.domainValidation.valid, false);
}

main().then(() => console.log('Comparative mission result gate: PASS'));
