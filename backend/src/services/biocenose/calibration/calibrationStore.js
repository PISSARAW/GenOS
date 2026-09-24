'use strict';

const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function appendBatch(db, entries) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    for (const entry of entries) await insertEntry(db, entry);
    const store = require('../communityStore');
    await store.appendEvent(db, {
      communityId: entries[0].communityId, actorId: entries[0].actorId,
      type: 'CALIBRATION_RECORDED',
      payload: { eventId: entries[0].eventId, domain: entries[0].domain, forecastCount: entries.length }, patch: {}
    });
    return entries;
  });
}

async function insertEntry(db, entry) {
  await db.run(
    `INSERT INTO biocenose_calibration
      (calibration_id, community_id, member_id, domain, event_id, probability, outcome, brier_score, oracle_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.calibrationId, entry.communityId, entry.memberId, entry.domain, entry.eventId,
    entry.probability, entry.outcome, entry.brierScore, entry.oracleRef, entry.createdAt
  );
}

async function list(db, memberId, domain) {
  await migrateBiocenoseSessions(db);
  const rows = await db.all(
    `SELECT member_id, domain, event_id, probability, outcome, brier_score, oracle_ref, created_at
     FROM biocenose_calibration WHERE member_id = ? AND domain = ? ORDER BY created_at, calibration_id`,
    memberId, domain
  );
  return rows.map((row) => ({
    memberId: row.member_id, domain: row.domain, eventId: row.event_id,
    probability: Number(row.probability), outcome: Number(row.outcome),
    brierScore: Number(row.brier_score), oracleRef: row.oracle_ref, createdAt: row.created_at
  }));
}

module.exports = { appendBatch, list };
