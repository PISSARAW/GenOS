'use strict';

function validateCommit({ session, participantIds, memberId, round, commitments }) {
  if (!session || session.status !== 'ACTIVE' || !session.constitutionId) return fail('Community constitution must be committed first.');
  if (!['CONSTITUTION', 'FORMATION', 'SEALED_JUDGMENT'].includes(session.phase)) return fail('Community is not accepting initial judgments.');
  if (!Number.isInteger(round) || round !== session.round) return fail('Judgment round does not match the active session round.');
  if (!participantIds.includes(memberId)) return fail('Member is not an active deliberation participant.');
  if (commitments.some((item) => item.memberId === memberId)) return fail('Member already committed for this round.');
  return { allowed: true, reason: null };
}

function validateDisclosure(participantIds, commitments) {
  if (!participantIds.length) return fail('Community has no eligible judgment participants.');
  const committed = new Set(commitments.map((item) => item.memberId));
  const missing = participantIds.filter((memberId) => !committed.has(memberId));
  return missing.length ? { allowed: false, reason: 'Waiting for all independent judgments.', missingMemberIds: missing }
    : { allowed: true, reason: null, missingMemberIds: [] };
}

function fail(reason) {
  return { allowed: false, reason };
}

module.exports = { validateCommit, validateDisclosure };
