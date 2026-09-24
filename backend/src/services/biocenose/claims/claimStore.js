'use strict';

const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function publishClaim(db, record) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    await validateRecord(db, record);
    const duplicate = await findDuplicate(db, record);
    if (duplicate) return storeDuplicate(db, record, duplicate.claim_id);
    await insertClaim(db, record);
    await recordClaimEvent(db, record, { claimId: record.claimId, duplicate: false });
    return { claimId: record.claimId, duplicate: false };
  });
}

async function validateRecord(db, record) {
  const session = await db.get('SELECT round FROM biocenose_communities WHERE community_id = ?', record.communityId);
  if (!session) throw Object.assign(new Error('Biocenose community not found.'), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
  if (Number(session.round) !== record.round) throw Object.assign(new Error('Claim round is not active.'), { code: 'BIOCENOSE_CLAIM_ROUND_CONFLICT' });
  const communityStore = require('../communityStore');
  if (!await communityStore.isActiveMember(db, record.communityId, record.createdBy)) {
    throw Object.assign(new Error('Claim author is not an active community member.'), { code: 'BIOCENOSE_MEMBER_UNKNOWN' });
  }
}

async function findDuplicate(db, record) {
  const rows = await db.all(
    'SELECT claim_id, claim_json FROM biocenose_claims WHERE community_id = ? AND round = ?',
    record.communityId, record.round
  );
  return rows.find((row) => JSON.parse(row.claim_json).canonicalKey === record.canonicalKey) || null;
}

async function insertClaim(db, record) {
  await db.run(
    `INSERT INTO biocenose_claims (claim_id, community_id, round, created_by, claim_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    record.claimId, record.communityId, record.round, record.createdBy,
    JSON.stringify({ claim: record.claim, canonicalKey: record.canonicalKey }), record.createdAt
  );
  await addOwner(db, record, record.claimId);
}

async function storeDuplicate(db, record, claimId) {
  await addOwner(db, record, claimId);
  await recordClaimEvent(db, record, { claimId, duplicate: true });
  return { claimId, duplicate: true };
}

async function addOwner(db, record, claimId) {
  await db.run(
    'INSERT OR IGNORE INTO biocenose_claim_owners (claim_id, community_id, member_id, created_at) VALUES (?, ?, ?, ?)',
    claimId, record.communityId, record.createdBy, record.createdAt
  );
}

async function recordClaimEvent(db, record, event) {
  const store = require('../communityStore');
  return store.appendEvent(db, {
    communityId: record.communityId, actorId: record.createdBy, type: 'CLAIM_PUBLISHED',
    payload: { claimId: event.claimId, round: record.round, duplicateSubmission: event.duplicate }, patch: {}
  });
}

async function listClaims(db, communityId, round) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(
    `SELECT c.claim_id, c.community_id, c.round, c.created_by, c.claim_json, c.created_at,
      GROUP_CONCAT(o.member_id) AS owner_ids
     FROM biocenose_claims c LEFT JOIN biocenose_claim_owners o ON o.claim_id = c.claim_id
     WHERE c.community_id = ? AND c.round = ? GROUP BY c.claim_id ORDER BY c.created_at, c.claim_id`,
    communityId, round
  );
  return rows.map(mapClaim);
}

function mapClaim(row) {
  const stored = JSON.parse(row.claim_json);
  return {
    claimId: row.claim_id, communityId: row.community_id, round: Number(row.round),
    createdBy: row.created_by, owners: row.owner_ids ? row.owner_ids.split(',') : [row.created_by],
    claim: stored.claim, createdAt: row.created_at
  };
}

module.exports = { publishClaim, listClaims };
