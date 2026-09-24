'use strict';

const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function append(db, update) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    await db.run(
      `INSERT INTO biocenose_belief_updates (update_id, community_id, member_id, round, update_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      update.updateId, update.communityId, update.memberId, update.round,
      JSON.stringify(update), update.createdAt
    );
    await require('../communityStore').appendEvent(db, {
      communityId: update.communityId, actorId: update.memberId, type: 'BELIEF_REVISED',
      payload: { updateId: update.updateId, memberId: update.memberId, changedClaims: update.changedClaims }, patch: {}
    });
    return update;
  });
}

async function list(db, communityId, round) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(
    `SELECT update_json FROM biocenose_belief_updates
     WHERE community_id = ? AND round = ? ORDER BY created_at, update_id`, communityId, round
  );
  return rows.map((row) => JSON.parse(row.update_json));
}

module.exports = { append, list };
