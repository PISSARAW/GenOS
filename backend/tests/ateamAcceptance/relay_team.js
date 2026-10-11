'use strict';
const assert = require('node:assert/strict');
const helpers = require('../fixtures/ateamVariantTestHelpers');
const { createMockMembers, relayDigest } = helpers;
const { createRelayHandoff } = require('../../src/services/aTeam/variants/variantExecutionService');
function runVariantTest(...args) { return helpers.runVariantTest(args[0], args[1], { members: args[2], boundaries: args[3] }); }

async function case1(context) {
  const { members, boundaries } = context;
  try {
    const relayMembers = createMockMembers([
      { memberId: 'owner1', domain: 'owner1' },
      { memberId: 'owner2', domain: 'owner2' }
    ]);
    const mission = {
      variant: 'relay_team',
      handoffSummary: 'Context: done. Decisions: x. Open: y. Next: z.',
      summaryMaxLength: 500,
      handoffSequence: 1,
      handoffVersion: 1,
      handoffState: { key: 'value' },
      artifactRefs: ['artifact1'],
      evidenceRefs: ['evidence1'],
      leaseDurationMinutes: 30,
      handoffAcknowledgment: { receiverId: 'owner2', accepted: true }
    };
    mission.handoffAcknowledgment.digest = relayDigest(mission);
    const result = await runVariantTest('relay_team', mission, relayMembers, boundaries);
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.handoff.status, 'ACCEPTED');
    console.log('✓ Relay Team: Accepts valid handoff with digest verification');
    context.passed++;
  } catch (e) { console.log('✗ Relay Team: Valid handoff', e.message); context.failed++; }

}

async function case2(context) {
  const { members, boundaries } = context;
  try {
    const relayMembers = createMockMembers([
      { memberId: 'owner1', domain: 'owner1' },
      { memberId: 'owner2', domain: 'owner2' }
    ]);
    const mission = {
      variant: 'relay_team',
      handoffSummary: 'Context',
      summaryMaxLength: 500,
      handoffSequence: 1,
      handoffVersion: 1,
      handoffState: { key: 'value' },
      artifactRefs: ['artifact1'],
      evidenceRefs: ['evidence1'],
      handoffAcknowledgment: { receiverId: 'owner2', accepted: true, digest: 'wrong-digest' }
    };
    await runVariantTest('relay_team', mission, relayMembers, boundaries);
    console.log('✗ Relay Team: Should reject digest mismatch');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_RELAY_DIGEST_MISMATCH');
    console.log('✓ Relay Team: Rejects digest mismatch');
    context.passed++;
  }

}

async function case3(context) {
  const { members, boundaries } = context;
  try {
    const relayMembers = createMockMembers([
      { memberId: 'owner1', domain: 'owner1' },
      { memberId: 'owner2', domain: 'owner2' }
    ]);
    const mission = {
      variant: 'relay_team',
      handoffSummary: 'Context: done. Decisions: x. Open: y. Next: z.',
      summaryMaxLength: 500,
      handoffSequence: 1,
      handoffVersion: 1,
      handoffState: { key: 'value' },
      artifactRefs: ['artifact1'],
      evidenceRefs: ['evidence1'],
      handoffAcknowledgment: { receiverId: 'owner2', accepted: false, reason: 'invalid state' }
    };
    mission.handoffAcknowledgment.digest = relayDigest(mission);
    await runVariantTest('relay_team', mission, relayMembers, boundaries);
    console.log('✗ Relay Team: Should rollback on rejection');
    context.failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_RELAY_ROLLED_BACK');
    console.log('✓ Relay Team: Rolls back on receiver rejection');
    context.passed++;
  }

}

async function case4(context) {
  const { members, boundaries } = context;
  try {
    const relayMembers = createMockMembers([
      { memberId: 'owner1', domain: 'owner1' },
      { memberId: 'owner2', domain: 'owner2' }
    ]);
    const mission = {
      variant: 'relay_team',
      handoffSummary: 'Context',
      summaryMaxLength: 500,
      handoffSequence: 1,
      handoffVersion: 1,
      handoffState: {},
      artifactRefs: [],
      evidenceRefs: []
    };
    await runVariantTest('relay_team', mission, relayMembers, boundaries);
    console.log('✗ Relay Team: Should require evidence refs');
    context.failed++;
  } catch (e) {
    console.log('✓ Relay Team: Requires evidence references');
    context.passed++;
  }

}

function chainHandoff(input) {
  const { previousOwner, nextOwner, sequence, previousDigest } = input;
  const entry = { previousOwner, nextOwner, handoffVersion: 1,
    handoffSequence: sequence, handoffSummary: `Context from ${previousOwner}`,
    handoffState: { owner: previousOwner, previousHandoffDigest: previousDigest || null },
    evidenceRefs: [`evidence:${sequence}`],
    artifactRefs: [`artifact:${sequence}`] };
  const receipt = createRelayHandoff({ version: entry.handoffVersion,
    sequence, previousOwner, nextOwner, summary: entry.handoffSummary,
    context: entry.handoffState, evidenceRefs: entry.evidenceRefs,
    artifactRefs: entry.artifactRefs });
  return { ...entry, handoffAcknowledgment: {
    receiverId: nextOwner, accepted: true, digest: receipt.digest
  } };
}

async function case5(context) {
  const members = createMockMembers(['owner1', 'owner2', 'owner3']
    .map((memberId) => ({ memberId, domain: memberId })));
  const first = chainHandoff({ previousOwner: 'owner1', nextOwner: 'owner2', sequence: 1 });
  const second = chainHandoff({ previousOwner: 'owner2', nextOwner: 'owner3', sequence: 2,
    previousDigest: first.handoffAcknowledgment.digest });
  const mission = { variant: 'relay_team', relayHandoffs: [first, second] };
  const result = await runVariantTest('relay_team', mission, members, context.boundaries);
  assert.equal(result.status, 'SUCCEEDED');
  assert.deepEqual(result.result.handoffs.map((handoff) => handoff.ownerId), ['owner2', 'owner3']);
  assert.equal(result.result.finalOwnerId, 'owner3');
  context.passed++;
  await assert.rejects(runVariantTest('relay_team', { ...mission,
    relayHandoffs: [first] }, members, context.boundaries),
  { code: 'ATEAM_RELAY_CHAIN_INCOMPLETE' });
  context.passed++;
  await assert.rejects(runVariantTest('relay_team', { ...mission,
    relayHandoffs: [first, { ...second, previousOwner: 'owner1' }] }, members, context.boundaries),
  { code: 'ATEAM_RELAY_CHAIN_INVALID' });
  context.passed++;
  await assert.rejects(runVariantTest('relay_team', { ...mission,
    relayHandoffs: [first, { ...second, handoffState: { owner: 'owner2' } }] },
  members, context.boundaries), { code: 'ATEAM_RELAY_CHAIN_LINK_INVALID' });
  context.passed++;
  await assert.rejects(runVariantTest('relay_team', { ...mission,
    relayHandoffs: [first, { ...second, handoffAcknowledgment: {
      ...second.handoffAcknowledgment, digest: 'forged'
    } }] }, members, context.boundaries),
  { code: 'ATEAM_RELAY_DIGEST_MISMATCH' });
  context.passed++;
}

module.exports = async function run(context) {
  await case1(context);
  await case2(context);
  await case3(context);
  await case4(context);
  await case5(context);
};
