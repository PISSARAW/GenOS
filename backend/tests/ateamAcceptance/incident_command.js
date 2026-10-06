'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const icsMembers = createMockMembers([
      { memberId: 'cmd', domain: 'cmd', role: 'commander' },
      { memberId: 'ops', domain: 'ops', role: 'operations' },
      { memberId: 'plan', domain: 'planning', role: 'planning' },
      { memberId: 'log', domain: 'logistics', role: 'logistics' }
    ]);
    const mission = {
      variant: 'incident_command',
      incidentRoles: { commander: 'cmd', operations: 'ops', planning: 'plan', logistics: 'log' },
      sitrepIntervalMinutes: 15,
      operationalObjectives: ['restore'],
      incidentEvents: [
        { type: 'SITREP', actorId: 'cmd', payload: { status: 'assessing' } },
        { type: 'HANDOVER', actorId: 'cmd' },
        { type: 'HANDOVER_ACCEPTED', actorId: 'ops' },
        { type: 'CLOSE', actorId: 'ops' }
      ]
    };
    const result = await runVariantTest('incident_command', mission, icsMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.state.status, 'CLOSED');
    console.log('✓ Incident Command: Valid ICS flow with handover');
    context.passed++;
  } catch (e) { console.log('✗ Incident Command: Valid flow', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'incident_command',
      incidentRoles: { commander: 'a', operations: 'b' },
      sitrepIntervalMinutes: 15,
      operationalObjectives: ['restore']
    };
    await runVariantTest('incident_command', mission, members.slice(0, 2), boundaries);
    console.log('✗ Incident Command: Should require all 4 roles');
    context.failed++;
  } catch (e) {
    console.log('✓ Incident Command: Requires all 4 ICS roles');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'incident_command',
      incidentRoles: { commander: 'api', operations: 'web', planning: 'security', logistics: 'ops' },
      sitrepIntervalMinutes: 15,
      operationalObjectives: ['restore'],
      incidentEvents: [{ type: 'HANDOVER_ACCEPTED', actorId: 'b' }]
    };
    await runVariantTest('incident_command', mission, members.slice(0, 4), boundaries);
    console.log('✗ Incident Command: Should reject invalid transition');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_ICS_TRANSITION_INVALID');
    console.log('✓ Incident Command: Enforces state machine transitions');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const manyMembers = createMockMembers([
      { memberId: 'cmd', domain: 'cmd', role: 'commander' },
      { memberId: 'ops', domain: 'ops', role: 'operations' },
      { memberId: 'plan', domain: 'planning', role: 'planning' },
      { memberId: 'log', domain: 'logistics', role: 'logistics' },
      { memberId: 's1', domain: 's1', role: 'safety' },
      { memberId: 'l1', domain: 'l1', role: 'liaison' },
      { memberId: 'p1', domain: 'p1', role: 'publicInfo' },
      { memberId: 'x1', domain: 'x1', role: 'extra' }
    ]);
    const mission = { variant: 'incident_command', incidentRoles: { commander: 'cmd', operations: 'ops', planning: 'plan', logistics: 'log', safety: 's1', liaison: 'l1', publicInfo: 'p1' }, sitrepIntervalMinutes: 15, operationalObjectives: ['restore'], spanOfControl: 3 };
    await runVariantTest('incident_command', mission, manyMembers, boundaries);
    console.log('✗ Incident Command: Should enforce span of control');
    context.failed++;
  } catch (e) {
    console.log('✓ Incident Command: Enforces span of control');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
