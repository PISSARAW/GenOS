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

async function listBeforeRound(db, communityId, round) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(`SELECT judgment_id, round, judgment_json, created_at FROM biocenose_judgments
    WHERE community_id = ? AND round < ? ORDER BY round`, communityId, round);
  return rows.map((row) => ({ judgmentId: row.judgment_id, round: row.round,
    judgment: parseJson(row.judgment_json), createdAt: row.created_at }));
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

module.exports = { record, listBeforeRound };
