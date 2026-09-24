'use strict';

const assert = require('assert');
const { buildVariantPlan } = require('../src/services/aTeam/variants/variantRegistry');
const { planOrganizations, transitionOrganization } = require('../src/services/aTeam/variants/teamOrganizationController');

function run() {
  assert.equal(buildVariantPlan({ variant: 'pipeline' }).communication, 'sequential_handoff');
  assert.equal(buildVariantPlan({ goal: 'urgent zero-day incident' }).variant, 'tiger_team');
  assert.equal(buildVariantPlan({ teamCount: 3 }).variant, 'multiteam');
  assert.equal(planOrganizations({ phases: [{ id: 'build', variant: 'project_dag' }, { id: 'incident', variant: 'incident_command' }] }).length, 2);
  const moved = transitionOrganization({ variant: 'project_dag' }, { variant: 'tiger_team' }, { reason: 'incident_detected' });
  assert.equal(moved.changed, true);
  assert.throws(() => buildVariantPlan({ variant: 'imaginary' }), { code: 'ATEAM_VARIANT_UNKNOWN' });
}

run();
console.log('A-Team variant policies passed.');
