'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 2, dissentRequired: true, rounds: 2 },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: ['e1'] },
        { memberId: 'web', decision: 'approve', evidenceRefs: ['e2'] },
        { memberId: 'security', decision: 'reject', evidenceRefs: ['e3'] }
      ]
    };
    const result = await runVariantTest('expert_committee', mission, members.slice(0, 3), boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.consensus, 'approve');
    assert.equal(result.result.dissent.length, 1);
    assert.ok(result.evidence.some(e => e.type === 'consensus_achieved'));
    console.log('✓ Expert Committee: Valid consensus with evidence');
    context.passed++;
  } catch (e) { console.log('✗ Expert Committee: Valid consensus', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 3, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: ['e1'] },
        { memberId: 'web', decision: 'approve', evidenceRefs: ['e2'] }
      ]
    };
    await runVariantTest('expert_committee', mission, members.slice(0, 3), boundaries);
    console.log('✗ Expert Committee: Should fail on quorum');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_NO_CONSENSUS');
    console.log('✓ Expert Committee: Rejects when quorum not met');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 2, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: [] }
      ]
    };
    await runVariantTest('expert_committee', mission, members.slice(0, 3), boundaries);
    console.log('✗ Expert Committee: Should reject invalid ballot');
    context.failed++;
  } catch (e) {
    console.log('✓ Expert Committee: Rejects ballots without evidence');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 5, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: ['e1'] }
      ]
    };
    await runVariantTest('expert_committee', mission, members.slice(0, 3), boundaries);
    console.log('✗ Expert Committee: Should reject invalid quorum');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_CONSENSUS_QUORUM_INVALID');
    console.log('✓ Expert Committee: Rejects quorum > team size');
    context.passed++;
  }

}

async function case5(context) {
  const mission = { variant: 'expert_committee', consensusProtocol: { quorum: 2 },
    ballots: [
      { memberId: 'api', decision: 'approve', evidenceRefs: ['proof:api'] },
      { memberId: 'outsider', decision: 'approve', evidenceRefs: ['proof:outsider'] }
    ] };
  await assert.rejects(runVariantTest('expert_committee', mission,
    context.members.slice(0, 3), context.boundaries),
  { code: 'ATEAM_CONSENSUS_MEMBER_UNKNOWN' });
  context.passed++;
}

async function case6(context) {
  const mission = { variant: 'expert_committee', consensusProtocol: { quorum: 2 },
    ballots: [
      { memberId: 'api', decision: 'approve', evidenceRefs: ['proof:first'] },
      { memberId: 'api', decision: 'approve', evidenceRefs: ['proof:second'] }
    ] };
  await assert.rejects(runVariantTest('expert_committee', mission,
    context.members.slice(0, 3), context.boundaries),
  { code: 'ATEAM_CONSENSUS_DUPLICATE_BALLOT' });
  context.passed++;
}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
  await case5(context);
  await case6(context);
};
