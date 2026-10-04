'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ INCIDENT COMMAND (4 tests) ============
  console.log('\n=== INCIDENT COMMAND ===');

  // 29. Positive: Valid ICS flow with handover
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
    const result = await runVariantTest('incident_command', mission, { members: icsMembers, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.state.status, 'CLOSED');
    console.log('✓ Incident Command: Valid ICS flow with handover');
    passed++;
  } catch (e) { console.log('✗ Incident Command: Valid flow', e.message); failed++; }

  // 30. Negative: Missing required ICS role
  try {
    const mission = {
      variant: 'incident_command',
      incidentRoles: { commander: 'a', operations: 'b' },
      sitrepIntervalMinutes: 15,
      operationalObjectives: ['restore']
    };
    await runVariantTest('incident_command', mission, { members: members.slice(0, 2), boundaries });
    console.log('✗ Incident Command: Should require all 4 roles');
    failed++;
  } catch (e) {
    console.log('✓ Incident Command: Requires all 4 ICS roles');
    passed++;
  }

  // 31. Negative: Invalid state transition
  try {
    const mission = {
      variant: 'incident_command',
      incidentRoles: { commander: 'api', operations: 'web', planning: 'security', logistics: 'ops' },
      sitrepIntervalMinutes: 15,
      operationalObjectives: ['restore'],
      incidentEvents: [{ type: 'HANDOVER_ACCEPTED', actorId: 'b' }]
    };
    await runVariantTest('incident_command', mission, { members: members.slice(0, 4), boundaries });
    console.log('✗ Incident Command: Should reject invalid transition');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_ICS_TRANSITION_INVALID');
    console.log('✓ Incident Command: Enforces state machine transitions');
    passed++;
  }

  // 32. Negative: Span of control exceeded
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
    await runVariantTest('incident_command', mission, { members: manyMembers, boundaries });
    console.log('✗ Incident Command: Should enforce span of control');
    failed++;
  } catch (e) {
    console.log('✓ Incident Command: Enforces span of control');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
