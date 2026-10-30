'use strict';

const tableInitializations = new WeakMap();

async function ensureTable(db) {
  if (tableInitializations.has(db)) return tableInitializations.get(db);
  const initialization = db.exec(`
    CREATE TABLE IF NOT EXISTS agent_organization_message_receipts (
      message_id INTEGER NOT NULL,
      recipient_agent_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','read','acknowledged')),
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      acknowledged_at DATETIME,
      PRIMARY KEY(message_id, recipient_agent_id),
      FOREIGN KEY(message_id) REFERENCES agent_organization_messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_agent_org_receipts_inbox
      ON agent_organization_message_receipts(recipient_agent_id, message_id);
    CREATE TABLE IF NOT EXISTS agent_organization_message_audiences (
      message_id INTEGER NOT NULL,
      recipient_agent_id TEXT NOT NULL,
      PRIMARY KEY(message_id, recipient_agent_id),
      FOREIGN KEY(message_id) REFERENCES agent_organization_messages(id) ON DELETE CASCADE
    );
  `).catch((failure) => {
    tableInitializations.delete(db);
    throw failure;
  });
  tableInitializations.set(db, initialization);
  return initialization;
}

function directRecipient(input) {
  const target = input.route && input.route.recipientAgentId;
  if (!target || target === 'broadcast' || target === input.senderAgentId) return null;
  return target;
}

async function recipientIds(db, input) {
  if (!input.route || input.route.delivery !== 'delivered') return [];
  const direct = directRecipient(input);
  if (direct) return [direct];
  const rows = await db.all(
    `SELECT id FROM agents
      WHERE (id = ? OR parent_agent_id = ?) AND id <> ?
      ORDER BY execution_mode DESC, id ASC`,
    input.orchestratorId, input.orchestratorId, input.senderAgentId
  );
  return rows.map((row) => row.id);
}

async function recordAvailable(db, input) {
  await ensureTable(db);
  const recipients = input.recipientAgentIds || await recipientIds(db, input);
  for (const recipientAgentId of recipients) {
    await db.run(
      `INSERT OR IGNORE INTO agent_organization_message_receipts
        (message_id, recipient_agent_id, state, available_at)
       VALUES (?, ?, 'available', CURRENT_TIMESTAMP)`,
      input.messageId, recipientAgentId
    );
  }
  return recipients;
}

async function recordPublication(db, input) {
  await ensureTable(db);
  const recipients = await recipientIds(db, { ...input, route: { ...input.route, delivery: 'delivered' } });
  for (const recipient of recipients) {
    await db.run('INSERT OR IGNORE INTO agent_organization_message_audiences(message_id, recipient_agent_id) VALUES (?, ?)', input.messageId, recipient);
  }
  if (input.route.delivery !== 'delivered') return [];
  return recordAvailable(db, { ...input, recipientAgentIds: recipients });
}

function placeholders(ids) {
  return ids.map(() => '?').join(', ');
}

async function receiptStates(db, input) {
  const ids = input.messageIds || [];
  if (!ids.length) return new Map();
  const rows = await db.all(
    `SELECT message_id as messageId, state as receiptState, available_at as availableAt,
            read_at as readAt, acknowledged_at as acknowledgedAt
       FROM agent_organization_message_receipts
      WHERE recipient_agent_id = ? AND message_id IN (${placeholders(ids)})`,
    input.recipientAgentId, ...ids
  );
  return new Map(rows.map((row) => [row.messageId, row]));
}

async function markRead(db, input) {
  await ensureTable(db);
  const ids = (input.messages || []).map((message) => message.id);
  if (!ids.length) return input.messages || [];
  await db.run(
    `UPDATE agent_organization_message_receipts
        SET state = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE recipient_agent_id = ? AND state = 'available'
        AND message_id IN (${placeholders(ids)})`,
    input.recipientAgentId, ...ids
  );
  const states = await receiptStates(db, { recipientAgentId: input.recipientAgentId, messageIds: ids });
  return input.messages.map((message) => ({ ...message, ...states.get(message.id) }));
}

async function acknowledge(db, input) {
  await ensureTable(db);
  const ids = [...new Set((input.messageIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { acknowledged: 0, receipts: [] };
  const result = await db.run(
    `UPDATE agent_organization_message_receipts
        SET state = 'acknowledged', read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
            acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP)
      WHERE recipient_agent_id = ? AND message_id IN (${placeholders(ids)})`,
    input.recipientAgentId, ...ids
  );
  const states = await receiptStates(db, { recipientAgentId: input.recipientAgentId, messageIds: ids });
  return { acknowledged: result.changes, receipts: [...states.values()] };
}

module.exports = { ensureTable, recipientIds, recordAvailable, recordPublication, markRead, acknowledge };
