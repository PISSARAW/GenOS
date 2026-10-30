'use strict';

const receipts = require('./organizationMessageReceipts');

async function audienceFor(db, row) {
  const audience = await db.all(
    'SELECT recipient_agent_id AS id FROM agent_organization_message_audiences WHERE message_id = ? ORDER BY recipient_agent_id', row.id);
  if (audience.length) return audience.map((entry) => entry.id);
  // Legacy direct messages have an exact recipient. A legacy broadcast has no
  // historical roster and must remain buffered rather than acquire an audience.
  if (row.recipientAgentId && row.recipientAgentId !== 'broadcast') return [row.recipientAgentId];
  return [];
}

async function releaseBufferedMessages(db, context) {
  if (context.organization === 'network_silence') return;
  await receipts.ensureTable(db);
  const pending = await db.all(
    `SELECT id, sender_agent_id AS senderAgentId, recipient_agent_id AS recipientAgentId
       FROM agent_organization_messages WHERE orchestrator_id = ? AND delivery = 'buffered'`, context.orchestratorId);
  for (const row of pending) {
    const recipientAgentIds = await audienceFor(db, row);
    if (!recipientAgentIds.length) continue;
    await receipts.recordAvailable(db, { messageId: row.id,
      orchestratorId: context.orchestratorId, senderAgentId: row.senderAgentId,
      recipientAgentIds, route: { delivery: 'delivered', recipientAgentId: row.recipientAgentId } });
    await db.run("UPDATE agent_organization_messages SET delivery = 'delivered' WHERE id = ? AND delivery = 'buffered'", row.id);
  }
}

module.exports = { releaseBufferedMessages };
