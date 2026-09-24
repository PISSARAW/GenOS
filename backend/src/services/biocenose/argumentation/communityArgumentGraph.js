'use strict';

const { randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const argumentStore = require('./argumentStore');
const { validateArgument } = require('../contracts/argumentContract');
const { validateOwnership } = require('../claims/claimOwnershipService');

async function publish(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  if (!['DELIBERATION', 'REVISION'].includes(session.phase) || session.status !== 'ACTIVE') {
    throw Object.assign(new Error('Arguments are accepted only during active deliberation.'), { code: 'BIOCENOSE_ARGUMENT_PHASE_INVALID' });
  }
  const ownership = validateOwnership(await communityStore.participantIds(input.db, input.communityId), input.memberId);
  if (!ownership.valid) throw Object.assign(new Error(ownership.reason), { code: 'BIOCENOSE_ARGUMENT_AUTHOR_INVALID' });
  const record = {
    argumentId: randomUUID(), communityId: input.communityId, claimId: input.claimId,
    createdBy: input.memberId, relation: input.relation, argument: input.argument,
    round: input.round ?? session.round, createdAt: new Date().toISOString()
  };
  const result = validateArgument(record);
  if (!result.valid) throw Object.assign(new Error(result.errors.join(' ')), { code: 'BIOCENOSE_ARGUMENT_INVALID' });
  return argumentStore.publish(input.db, record);
}

async function snapshot(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  const round = input.round ?? session.round;
  return {
    round,
    claims: await communityStore.listClaims(input.db, input.communityId, round),
    arguments: await argumentStore.list(input.db, input.communityId, round)
  };
}

module.exports = { publish, snapshot };
