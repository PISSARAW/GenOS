'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ RELAY TEAM (4 tests) ============
  console.log('\n=== RELAY TEAM ===');

  // 41. Positive: Valid handoff with acceptance
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
    const result = await runVariantTest('relay_team', mission, { members: relayMembers, boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.handoff.status, 'ACCEPTED');
    console.log('✓ Relay Team: Accepts valid handoff with digest verification');
    passed++;
  } catch (e) { console.log('✗ Relay Team: Valid handoff', e.message); failed++; }

  // 42. Negative: Digest mismatch on transfer
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
    await runVariantTest('relay_team', mission, { members: relayMembers, boundaries });
    console.log('✗ Relay Team: Should reject digest mismatch');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_RELAY_DIGEST_MISMATCH');
    console.log('✓ Relay Team: Rejects digest mismatch');
    passed++;
  }

  // 43. Negative: Receiver rejects handoff
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
    await runVariantTest('relay_team', mission, { members: relayMembers, boundaries });
    console.log('✗ Relay Team: Should rollback on rejection');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_RELAY_ROLLED_BACK');
    console.log('✓ Relay Team: Rolls back on receiver rejection');
    passed++;
  }

  // 44. Negative: Missing evidence references
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
    await runVariantTest('relay_team', mission, { members: relayMembers, boundaries });
    console.log('✗ Relay Team: Should require evidence refs');
    failed++;
  } catch (e) {
    console.log('✓ Relay Team: Requires evidence references');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
