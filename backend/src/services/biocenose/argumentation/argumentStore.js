'use strict';

const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function publish(db, record) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    await validateReferences(db, record);
    await db.run(
      `INSERT INTO biocenose_arguments
        (argument_id, community_id, claim_id, created_by, relation, argument_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      record.argumentId, record.communityId, record.claimId, record.createdBy,
      record.relation, JSON.stringify(record.argument), record.createdAt
    );
    const store = require('../communityStore');
    await store.appendEvent(db, {
      communityId: record.communityId, actorId: record.createdBy, type: 'ARGUMENT_ADDED',
      payload: { argumentId: record.argumentId, claimId: record.claimId, relation: record.relation }, patch: {}
    });
    return { argumentId: record.argumentId, relation: record.relation };
  });
}

async function validateReferences(db, record) {
  const source = await findClaim(db, record, record.claimId);
  if (!source) throw Object.assign(new Error('Argument source claim is not in this round.'), { code: 'BIOCENOSE_ARGUMENT_CLAIM_UNKNOWN' });
  const targetId = record.argument.targetClaimId;
  if (!targetId) return;
  const target = await findClaim(db, record, targetId);
  if (!target) throw Object.assign(new Error('Argument target claim is not in this round.'), { code: 'BIOCENOSE_ARGUMENT_TARGET_UNKNOWN' });
}

async function findClaim(db, record, claimId) {
  return db.get(
    'SELECT claim_id FROM biocenose_claims WHERE community_id = ? AND round = ? AND claim_id = ?',
    record.communityId, record.round, claimId
  );
}

async function list(db, communityId, round) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(
    `SELECT a.argument_id, a.community_id, a.claim_id, a.created_by, a.relation, a.argument_json, a.created_at
     FROM biocenose_arguments a JOIN biocenose_claims c ON c.claim_id = a.claim_id
     WHERE a.community_id = ? AND c.round = ? ORDER BY a.created_at, a.argument_id`, communityId, round
  );
  return rows.map((row) => ({
    argumentId: row.argument_id, communityId: row.community_id, claimId: row.claim_id,
    createdBy: row.created_by, relation: row.relation, argument: JSON.parse(row.argument_json),
    round: round, createdAt: row.created_at
  }));
}

module.exports = { publish, list };
