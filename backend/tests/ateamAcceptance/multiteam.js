'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'multiteam',
      teams: [
        { teamId: 'product', variant: 'expert_committee', members: [{ memberId: 'p1' }, { memberId: 'p2' }] },
        { teamId: 'platform', variant: 'pipeline', members: [{ memberId: 's1' }, { memberId: 's2' }] }
      ],
      systemObjectives: ['deliver product'],
      globalBudget: { tokens: 1000, compute: 100, time: 3600 },
      contracts: { 'product-platform': { from: 'product', to: 'platform', artifact: 'api', schema: { type: 'object' } } }
    };
    const allMembers = createMockMembers([
      { memberId: 'p1', domain: 'p1' }, { memberId: 'p2', domain: 'p2' },
      { memberId: 's1', domain: 's1' }, { memberId: 's2', domain: 's2' }
    ]);
    const result = await runVariantTest('multiteam', mission, allMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.teams.length, 2);
    console.log('✓ Multiteam: Plans sub-teams with contracts');
    context.passed++;
  } catch (e) { console.log('✗ Multiteam: Valid sub-teams', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = { variant: 'multiteam', teams: [{ teamId: 'only', members: [{ memberId: 'm1' }] }] };
    await runVariantTest('multiteam', mission, members.slice(0, 1), boundaries);
    console.log('✗ Multiteam: Should require 2+ teams');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_MULTITEAM_MIN_TEAMS');
    console.log('✓ Multiteam: Requires at least 2 sub-teams');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'multiteam',
      teams: [
        { teamId: 'a', variant: 'expert_committee', members: [{ memberId: 'a1' }] },
        { teamId: 'b', variant: 'expert_committee', members: [{ memberId: 'b1' }] }
      ],
      systemObjectives: ['goal'],
      conflicts: [{ type: 'resource_contention', teams: ['a', 'b'] }],
      councilChair: 'a',
      councilAuthority: 'binding'
    };
    const allMembers = createMockMembers([{ memberId: 'a1' }, { memberId: 'b1' }]);
    const result = await runVariantTest('multiteam', mission, allMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.ok(result.decisions.some(d => d.type === 'conflict_resolution_plan'));
    console.log('✓ Multiteam: Integration council resolves conflicts');
    context.passed++;
  } catch (e) { console.log('✗ Multiteam: Conflict resolution plan', e.message); context.failed++; }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'multiteam',
      teams: [
        { teamId: 'a', variant: 'pipeline', members: [{ memberId: 'a1' }], weight: 2 },
        { teamId: 'b', variant: 'pipeline', members: [{ memberId: 'b1' }], weight: 1 }
      ],
      systemObjectives: ['deliver the coordinated outcome'],
      globalBudget: { tokens: 300, compute: 30, time: 100 },
      budgetAllocation: 'proportional'
    };
    const allMembers = createMockMembers([{ memberId: 'a1' }, { memberId: 'b1' }]);
    const result = await runVariantTest('multiteam', mission, allMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.budget.local.a.tokens, 200);
    assert.equal(result.result.budget.local.b.tokens, 100);
    console.log('✓ Multiteam: Enforces proportional budget allocation');
    context.passed++;
  } catch (e) { console.log('✗ Multiteam: Budget allocation', e.message); context.failed++; }

}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
};
