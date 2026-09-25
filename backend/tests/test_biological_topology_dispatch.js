'use strict';

const assert = require('node:assert/strict');
const { composeMode, normalizeMode } = require('../src/services/biologicalTopologyService');

async function verifyTrinityDispatch() {
  const result = await composeMode({ mode: 'trinity', mission: 'Compare three independent hypotheses.' });
  assert.equal(result.members.length, 3);
  assert.deepEqual(result.members.map((member) => member.worldNumber), [1, 2, 3]);
}

async function verifyATeamDispatch() {
  const result = await composeMode({ mode: 'a-team', mission: 'Build a React interface and an Express API.' });
  assert.ok(result.members.length >= 2);
  assert.ok(result.members.every((member) => member.mission.includes('Project goal:')));
  await assert.rejects(
    () => composeMode({ mode: 'a_team', mission: 'Solve one simple recurrence.' }),
    { code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED' }
  );
}

async function run() {
  assert.equal(normalizeMode(' A-TEAM '), 'a_team');
  assert.equal(normalizeMode('holobiont'), 'holobionte');
  await verifyTrinityDispatch();
  await verifyATeamDispatch();
  console.log('Biological topology dispatch checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
