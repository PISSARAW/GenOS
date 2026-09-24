'use strict';

const { randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const { validateClaim } = require('../contracts/claimContract');
const { canonicalizeClaim } = require('./claimCanonicalizer');
const { duplicateFor } = require('./claimDeduplicationService');
const { validateOwnership } = require('./claimOwnershipService');

async function publish(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  if (session.status !== 'ACTIVE' || !['REVIEW', 'DELIBERATION'].includes(session.phase)) {
    throw Object.assign(new Error('Claims are accepted only after initial judgment disclosure.'), { code: 'BIOCENOSE_CLAIM_PHASE_INVALID' });
  }
  const round = input.round ?? session.round;
  const members = await communityStore.participantIds(input.db, input.communityId);
  const ownership = validateOwnership(members, input.memberId);
  if (!ownership.valid) throw Object.assign(new Error(ownership.reason), { code: 'BIOCENOSE_CLAIM_OWNER_INVALID' });
  const claim = canonicalizeClaim(input.claim);
  const record = {
    claimId: randomUUID(), communityId: input.communityId, round,
    createdBy: input.memberId, claim, canonicalKey: claim.canonicalKey,
    createdAt: new Date().toISOString()
  };
  const validation = validateClaim({ ...record, claim });
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'BIOCENOSE_CLAIM_INVALID' });
  const existing = await communityStore.listClaims(input.db, input.communityId, round);
  const duplicate = duplicateFor(existing.map((entry) => canonicalizeClaim(entry.claim)), claim);
  if (duplicate) return communityStore.publishClaim(input.db, { ...record, canonicalKey: duplicate.canonicalKey });
  return communityStore.publishClaim(input.db, record);
}

async function list(input) {
  const session = await communityStore.loadSession(input.db, input.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  return communityStore.listClaims(input.db, input.communityId, input.round ?? session.round);
}

module.exports = { publish, list };
