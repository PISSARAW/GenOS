'use strict';

const { randomUUID } = require('crypto');
const { validateDissent, DISSENT_STATUSES } = require('../contracts/dissentContract');
const communityStore = require('../communityStore');
const dissentStore = require('./dissentStore');

async function record(input) {
  const session = await activeSession(input);
  if (!['DELIBERATION', 'REVISION', 'AGGREGATION'].includes(session.phase)) throw phaseError();
  const dissent = { ...input.dissent };
  const participants = await communityStore.participantIds(input.db, input.communityId);
  if (!dissent.supportingMembers.every((memberId) => participants.includes(memberId))) throw memberError();
  const entry = {
    dissentId: randomUUID(), communityId: input.communityId, status: 'OPEN', dissent,
    actorId: input.actorId, round: input.round ?? session.round, createdAt: new Date().toISOString()
  };
  const validation = validateDissent(entry);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'BIOCENOSE_DISSENT_INVALID' });
  return dissentStore.record(input.db, entry);
}

async function changeStatus(input) {
  const session = await activeSession(input);
  if (!DISSENT_STATUSES.includes(input.status) || input.status === 'OPEN') throw phaseError();
  const existing = await dissentStore.list(input.db, input.communityId);
  if (!existing.some((item) => item.dissentId === input.dissentId)) {
    throw Object.assign(new Error('Dissent entry was not found.'), { code: 'BIOCENOSE_DISSENT_UNKNOWN' });
  }
  if (input.status === 'ESCALATED') {
    await communityStore.appendEvent(input.db, {
      communityId: input.communityId, actorId: input.actorId,
      type: 'DISSENT_ESCALATED', payload: { dissentId: input.dissentId, reason: input.reason }, patch: {}
    });
  }
  return dissentStore.updateStatus(input.db, {
    ...input, communityId: input.communityId, round: session.round
  });
}

async function list(input) {
  return dissentStore.list(input.db, input.communityId);
}

async function activeSession(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session || session.status !== 'ACTIVE') throw Object.assign(new Error('Active Biocenose session required.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  return session;
}

function phaseError() {
  return Object.assign(new Error('Dissent status or phase is invalid.'), { code: 'BIOCENOSE_DISSENT_PHASE_INVALID' });
}

function memberError() {
  return Object.assign(new Error('Dissent supporters must be active community participants.'), { code: 'BIOCENOSE_DISSENT_MEMBER_INVALID' });
}

module.exports = { record, changeStatus, list };
