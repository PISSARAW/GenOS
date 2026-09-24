'use strict';

const { randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const { validateBeliefUpdate } = require('../contracts/beliefUpdateContract');
const historyStore = require('./beliefHistoryStore');
const reasonClassifier = require('./revisionReasonClassifier');
const conformityMonitor = require('../dissent/conformityMonitor');

async function revise(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session || session.status !== 'ACTIVE') throw Object.assign(new Error('Active Biocenose session required.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  if (session.phase !== 'REVISION') throw Object.assign(new Error('Beliefs can only be revised during the revision phase.'), { code: 'BIOCENOSE_REVISION_PHASE_INVALID' });
  if (input.round !== undefined && input.round !== session.round) throw Object.assign(new Error('Belief update round is not active.'), { code: 'BIOCENOSE_REVISION_ROUND_INVALID' });
  await requireParticipant(input.db, input.communityId, input.memberId);
  const update = updateRecord(input, session);
  validate(update);
  await requireClaims(input.db, input.communityId, update);
  const rationale = reasonClassifier.classify(update);
  rejectCriticalSocialOnly(update, rationale, input.criticalClaims || []);
  const history = await historyStore.list(input.db, input.communityId, update.round);
  const saved = await historyStore.append(input.db, update);
  return { update: saved, ...conformityMonitor.inspect(saved, [...history, saved]), rationale };
}

function updateRecord(input, session) {
  return {
    updateId: randomUUID(), communityId: input.communityId, memberId: input.memberId,
    round: session.round, previousPosition: input.previousPosition, newPosition: input.newPosition,
    changedClaims: input.changedClaims, reasonCodes: input.reasonCodes,
    evidenceRefs: input.evidenceRefs, createdAt: new Date().toISOString()
  };
}

function validate(update) {
  const result = validateBeliefUpdate(update);
  if (!result.valid || !nonEmptyPositions(update)) {
    throw Object.assign(new Error(result.errors.join(' ') || 'Previous and new positions are required.'), { code: 'BIOCENOSE_BELIEF_UPDATE_INVALID' });
  }
}

function nonEmptyPositions(update) {
  return typeof update.previousPosition === 'string' && update.previousPosition.trim()
    && typeof update.newPosition === 'string' && update.newPosition.trim();
}

function rejectCriticalSocialOnly(update, rationale, criticalClaims) {
  const affectsCriticalClaim = update.changedClaims.some((claimId) => criticalClaims.includes(claimId));
  if (rationale.socialSignalOnly && affectsCriticalClaim) {
    throw Object.assign(new Error('Majority or authority signal alone cannot revise a critical claim.'), { code: 'BIOCENOSE_SOCIAL_REVISION_BLOCKED' });
  }
}

async function requireParticipant(db, communityId, memberId) {
  const participants = await communityStore.participantIds(db, communityId);
  if (!participants.includes(memberId)) throw Object.assign(new Error('Belief author is not an active participant.'), { code: 'BIOCENOSE_REVISION_MEMBER_INVALID' });
}

async function requireClaims(db, communityId, update) {
  const claims = await communityStore.listClaims(db, communityId, update.round);
  const known = new Set(claims.map((claim) => claim.claimId));
  if (!update.changedClaims.every((claimId) => known.has(claimId))) {
    throw Object.assign(new Error('Belief update refers to a claim outside the active community round.'), { code: 'BIOCENOSE_REVISION_CLAIM_UNKNOWN' });
  }
}

module.exports = { revise };
