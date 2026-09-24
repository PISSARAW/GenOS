'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function record(db, input) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    const claimId = input.dissent.claimRefs[0];
    for (const claimId of input.dissent.claimRefs) await requireClaim(db, { ...input, claimId });
    await db.run(
      `INSERT INTO biocenose_dissent (dissent_id, community_id, claim_id, status, dissent_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.dissentId, input.communityId, claimId, input.status, JSON.stringify(input.dissent), input.createdAt
    );
    await event(db, { ...input, type: 'DISSENT_RECORDED', payload: { dissentId: input.dissentId, claimRefs: input.dissent.claimRefs } });
    return input;
  });
}

async function requireClaim(db, input) {
  const claim = await db.get(
    'SELECT claim_id FROM biocenose_claims WHERE community_id = ? AND round = ? AND claim_id = ?',
    input.communityId, input.round, input.claimId
  );
  if (!claim) throw Object.assign(new Error(`Dissent claim '${input.claimId}' is outside the active round.`), { code: 'BIOCENOSE_DISSENT_CLAIM_UNKNOWN' });
}

async function updateStatus(db, input) {
  await event(db, { ...input, type: 'DISSENT_STATUS_CHANGED', payload: {
    dissentId: input.dissentId, status: input.status, reason: input.reason
  } });
  return { dissentId: input.dissentId, status: input.status };
}

async function list(db, communityId) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(
    'SELECT dissent_id, community_id, claim_id, status, dissent_json, created_at FROM biocenose_dissent WHERE community_id = ? ORDER BY created_at, dissent_id',
    communityId
  );
  const events = await require('../communityStore').listEvents(db, communityId);
  return rows.map((row) => mapDissent(row, events));
}

async function event(db, input) {
  return require('../communityStore').appendEvent(db, {
    communityId: input.communityId, actorId: input.actorId || null, type: input.type, payload: input.payload, patch: {}
  });
}

function mapDissent(row, events) {
  const changes = events.filter((item) => item.type === 'DISSENT_STATUS_CHANGED'
    && item.payload.dissentId === row.dissent_id);
  return {
    dissentId: row.dissent_id, communityId: row.community_id, claimId: row.claim_id,
    status: changes.length ? changes[changes.length - 1].payload.status : row.status,
    dissent: JSON.parse(row.dissent_json), createdAt: row.created_at
  };
}

module.exports = { record, updateStatus, list, randomId: randomUUID };
