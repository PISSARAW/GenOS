'use strict';

const communityStore = require('../communityStore');

async function memberMissionCount(db, memberId) {
  await communityStore.ensureSchema(db);
  const rows = await db.all(
    `SELECT payload_json FROM biocenose_events
     WHERE event_type = 'MEMBER_RECRUITED' AND actor_id = ? ORDER BY rowid`, memberId
  );
  if (!rows.length) return 0;
  return rows.reduce((count, row, index) => {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) { /* ignore malformed legacy payload */ }
    return Math.max(count, (Number(payload.missionsServed) || 0) + rows.length - index);
  }, 0);
}

module.exports = { memberMissionCount };
