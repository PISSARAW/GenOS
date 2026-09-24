'use strict';

const { createHash, randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const disclosureGate = require('./disclosureGate');
const { canonicalize } = require('../governance/protocolVersioning');
const { validateJudgment } = require('../contracts/judgmentContract');

function judgmentHash(payload) {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

function assertAllowed(result, code) {
  if (result.allowed) return;
  throw Object.assign(new Error(result.reason), { code });
}

async function commitJudgment(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  const commitInput = { ...input, round: input.round ?? session.round };
  const participantIds = await communityStore.participantIds(input.db, input.communityId);
  const commitments = await communityStore.listCommitments(input.db, input.communityId, commitInput.round);
  assertAllowed(disclosureGate.validateCommit({ ...commitInput, session, participantIds, commitments }), 'BIOCENOSE_COMMIT_REJECTED');
  const judgment = judgmentRecord(commitInput);
  const nonce = randomUUID();
  const payload = { nonce, judgment };
  const commitmentHash = judgmentHash(payload);
  const saved = await communityStore.saveCommitment(input.db, {
    commitmentId: randomUUID(), communityId: input.communityId,
    memberId: commitInput.memberId, round: commitInput.round,
    commitmentType: 'SEALED_JUDGMENT', commitmentHash, payload
  });
  return {
    committed: true, commitmentId: saved.commitmentId, commitmentHash,
    round: commitInput.round, participantCount: participantIds.length,
    remainingCount: participantIds.length - commitments.length - 1
  };
}

function judgmentRecord(input) {
  const judgment = {
    judgmentId: randomUUID(), communityId: input.communityId,
    memberId: input.memberId, round: input.round, judgment: input.judgment
  };
  const validation = validateJudgment(judgment);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'BIOCENOSE_JUDGMENT_INVALID' });
  return judgment;
}

async function revealJudgments(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  const participantIds = await communityStore.participantIds(input.db, input.communityId);
  const commitments = await communityStore.listCommitments(input.db, input.communityId, session.round);
  const gate = disclosureGate.validateDisclosure(participantIds, commitments);
  assertAllowed(gate, 'BIOCENOSE_DISCLOSURE_BLOCKED');
  if (session.phase !== 'SEALED_JUDGMENT') {
    throw Object.assign(new Error('Initial judgments are not in the sealed phase.'), { code: 'BIOCENOSE_DISCLOSURE_PHASE_INVALID' });
  }
  const payloads = await communityStore.sealedPayloads(input.db, input.communityId, session.round);
  assertPayloadIntegrity(payloads);
  await communityStore.appendEvent(input.db, {
    communityId: input.communityId, actorId: input.actorId,
    type: 'JUDGMENTS_REVEALED', payload: { round: session.round, participantCount: participantIds.length },
    patch: { phase: 'REVIEW' }
  });
  return payloads.map((entry) => ({
    memberId: entry.memberId, round: entry.round,
    judgmentId: entry.payload.judgment.judgmentId,
    judgment: entry.payload.judgment.judgment
  }));
}

function assertPayloadIntegrity(payloads) {
  const valid = payloads.every((entry) => judgmentHash(entry.payload) === entry.commitmentHash);
  if (!valid) throw Object.assign(new Error('A sealed judgment failed commitment hash validation.'), { code: 'BIOCENOSE_COMMITMENT_INTEGRITY_FAILURE' });
}

module.exports = { commitJudgment, revealJudgments, judgmentHash };
