'use strict';

const assert = require('node:assert/strict');
const { createMockMembers, runVariantTest, relayDigest } = require('../fixtures/ateamVariantTestHelpers');

async function run(members, boundaries) {
  let passed = 0;
  let failed = 0;

  // ============ EXPERT COMMITTEE (4 tests) ============
  console.log('=== EXPERT COMMITTEE ===');

  // 1. Positive: Valid consensus with evidence
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
    const result = await runVariantTest('expert_committee', mission, { members: members.slice(0, 3), boundaries });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.result.consensus, 'approve');
    assert.equal(result.result.dissent.length, 1);
    assert.ok(result.evidence.some(e => e.type === 'consensus_achieved'));
    console.log('✓ Expert Committee: Valid consensus with evidence');
    passed++;
  } catch (e) { console.log('✗ Expert Committee: Valid consensus', e.message); failed++; }

  // 2. Negative: Quorum not met
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 3, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: ['e1'] },
        { memberId: 'web', decision: 'approve', evidenceRefs: ['e2'] }
      ]
    };
    await runVariantTest('expert_committee', mission, { members: members.slice(0, 3), boundaries });
    console.log('✗ Expert Committee: Should fail on quorum');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_NO_CONSENSUS');
    console.log('✓ Expert Committee: Rejects when quorum not met');
    passed++;
  }

  // 3. Negative: Invalid ballot (no evidence)
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 2, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: [] }
      ]
    };
    await runVariantTest('expert_committee', mission, { members: members.slice(0, 3), boundaries });
    console.log('✗ Expert Committee: Should reject invalid ballot');
    failed++;
  } catch (e) {
    console.log('✓ Expert Committee: Rejects ballots without evidence');
    passed++;
  }

  // 4. Negative: Quorum exceeds team size
  try {
    const mission = {
      variant: 'expert_committee',
      consensusProtocol: { quorum: 5, dissentRequired: true },
      ballots: [
        { memberId: 'api', decision: 'approve', evidenceRefs: ['e1'] }
      ]
    };
    await runVariantTest('expert_committee', mission, { members: members.slice(0, 3), boundaries });
    console.log('✗ Expert Committee: Should reject invalid quorum');
    failed++;
  } catch (e) {
    assert.equal(e.code, 'ATEAM_CONSENSUS_QUORUM_INVALID');
    console.log('✓ Expert Committee: Rejects quorum > team size');
    passed++;
  }

  return { passed, failed };
}

module.exports = run;
