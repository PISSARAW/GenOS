'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ TIGER TEAM (4 tests) ============
  console.log('\n=== TIGER TEAM ===');

  // 25. Positive: Action within mandate
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], remainingBudget: 10, resourceLimits: { cpu: 4 } },
      actions: [{ type: 'restart', cost: 2, resources: { cpu: 1 } }]
    };
    const result = await runVariantTest('tiger_team', mission, { members: members.slice(0, 2), boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.authorized === true));
    console.log('✓ Tiger Team: Authorizes action within mandate');
    passed++;
  } catch (e) { console.log('✗ Tiger Team: Valid action', e.message); failed++; }

  // 26. Negative: Timebox expired
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 1, stopCriteria: ['service up'], allowedActions: ['restart'], hardTimebox: { enforceAt: Date.now() - 1000 } },
      actions: [{ type: 'restart' }]
    };
    await runVariantTest('tiger_team', mission, { members: members.slice(0, 2), boundaries });
    console.log('✗ Tiger Team: Should reject expired timebox');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_TIMEBOX_EXPIRED');
    console.log('✓ Tiger Team: Rejects expired timebox');
    passed++;
  }

  // 27. Negative: Action outside allowed scope
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], prohibitedActions: ['delete'] },
      actions: [{ type: 'delete' }]
    };
    await runVariantTest('tiger_team', mission, { members: members.slice(0, 2), boundaries });
    console.log('✗ Tiger Team: Should reject prohibited action');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_SCOPE_VIOLATION');
    console.log('✓ Tiger Team: Rejects prohibited action');
    passed++;
  }

  // 28. Negative: Budget exceeded
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], remainingBudget: 5 },
      actions: [{ type: 'restart', cost: 10 }]
    };
    await runVariantTest('tiger_team', mission, { members: members.slice(0, 2), boundaries });
    console.log('✗ Tiger Team: Should reject budget overrun');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_BUDGET_EXCEEDED');
    console.log('✓ Tiger Team: Enforces budget limit');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
