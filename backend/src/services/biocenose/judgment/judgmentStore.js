'use strict';

const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function record(db, input) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    await db.run(
      `INSERT INTO biocenose_judgments (judgment_id, community_id, round, judgment_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      input.judgmentId, input.communityId, input.round, JSON.stringify(input.judgment), input.createdAt
    );
    await require('../communityStore').appendEvent(db, {
      communityId: input.communityId, actorId: input.actorId, type: 'COMMUNITY_JUDGMENT_RECORDED',
      payload: { judgmentId: input.judgmentId, round: input.round, status: input.judgment.status },
      patch: { phase: input.nextPhase, status: input.nextStatus, judgmentId: input.judgmentId }
    });
    return { judgmentId: input.judgmentId, judgment: input.judgment };
  });
}

module.exports = { record };
