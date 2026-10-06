'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], remainingBudget: 10, resourceLimits: { cpu: 4 } },
      actions: [{ type: 'restart', cost: 2, resources: { cpu: 1 } }]
    };
    const result = await runVariantTest('tiger_team', mission, members.slice(0, 2), boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.data.authorized === true));
    console.log('✓ Tiger Team: Authorizes action within mandate');
    context.passed++;
  } catch (e) { console.log('✗ Tiger Team: Valid action', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 1, stopCriteria: ['service up'], allowedActions: ['restart'], hardTimebox: { enforceAt: Date.now() - 1000 } },
      actions: [{ type: 'restart' }]
    };
    await runVariantTest('tiger_team', mission, members.slice(0, 2), boundaries);
    console.log('✗ Tiger Team: Should reject expired timebox');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_TIMEBOX_EXPIRED');
    console.log('✓ Tiger Team: Rejects expired timebox');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], prohibitedActions: ['delete'] },
      actions: [{ type: 'delete' }]
    };
    await runVariantTest('tiger_team', mission, members.slice(0, 2), boundaries);
    console.log('✗ Tiger Team: Should reject prohibited action');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_SCOPE_VIOLATION');
    console.log('✓ Tiger Team: Rejects prohibited action');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'tiger_team',
      urgentMandate: { scope: 'restore', timeboxMinutes: 60, stopCriteria: ['service up'], allowedActions: ['restart'], remainingBudget: 5 },
      actions: [{ type: 'restart', cost: 10 }]
    };
    await runVariantTest('tiger_team', mission, members.slice(0, 2), boundaries);
    console.log('✗ Tiger Team: Should reject budget overrun');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_TIGER_BUDGET_EXCEEDED');
    console.log('✓ Tiger Team: Enforces budget limit');
    context.passed++;
  }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
