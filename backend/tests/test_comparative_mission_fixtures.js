'use strict';

const assert = require('node:assert/strict');
const { FIXTURE_IDS, loadFixture, renderFixtureMission } = require('../src/services/comparativeMissionFixtureService');
const biologicalMode = require('../src/services/biologicalModeService');

assert.equal(FIXTURE_IDS.length, 6);
for (const id of FIXTURE_IDS) {
  const fixture = loadFixture(id);
  assert.ok(fixture.problem.inputs);
  assert.ok(fixture.evaluation.kind);
  assert.equal(fixture.migration.requireLocalValidation, true);
  assert.ok(renderFixtureMission(fixture).includes(fixture.missionId));
  assert.equal(biologicalMode.compose('metapopulation', renderFixtureMission(fixture)).length, fixture.populations.length);
}
const schedulingMission = renderFixtureMission(loadFixture('level-1'));
assert.match(schedulingMission, /A=2, B=3, C=4, D=5, E=6; two machines; minimize makespan/);
assert.throws(() => loadFixture('../package'), { code: 'COMPARATIVE_FIXTURE_NOT_FOUND' });

console.log('Comparative mission fixtures: PASS');
