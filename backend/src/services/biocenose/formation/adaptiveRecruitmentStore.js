'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const { migrateBiocenoseSessions } = require('../../../db/migrations/migrateBiocenoseSessions');

async function recruit(db, input) {
  await migrateBiocenoseSessions(db);
  return withTransaction(db, async () => {
    await db.run(
      `INSERT INTO biocenose_members (member_record_id, community_id, member_id, role, attributes_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      randomUUID(), input.communityId, input.memberId, input.role, JSON.stringify(input.attributes), input.createdAt
    );
    await require('../communityStore').appendEvent(db, {
      communityId: input.communityId, actorId: input.actorId, type: 'MEMBER_RECRUITED',
      payload: { memberId: input.memberId, role: input.role, reason: input.reason }, patch: {}
    });
    return { memberId: input.memberId, role: input.role };
  });
}

module.exports = { recruit };
