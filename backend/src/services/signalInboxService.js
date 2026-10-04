'use strict';

const { decodeSignalRow } = require('./signalEnvelopeCodec');

async function readDeliveredInbox(db, scope, input) {
  const { agentId, since = null, limit = 100 } = input;
  const rows = await db.all(`SELECT s.signal_id, s.signal_type, s.signal_blob, s.content,
      s.topic, s.sender_agent_id, s.created_at, d.status AS delivery_status
    FROM signal_deliveries d
    JOIN signal_blobs s ON s.signal_id = d.signal_id
    JOIN agents sender ON sender.id = s.sender_agent_id
    JOIN workspaces sender_ws ON sender_ws.id = sender.workspace_id
    WHERE d.subscriber_agent_id = ? AND d.status IN ('delivered', 'seen')
      AND sender_ws.organization_id = ? AND sender_ws.project_id = ?
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      AND (? IS NULL OR s.created_at > ?)
    ORDER BY s.created_at DESC LIMIT ?`,
  [agentId, scope.organizationId, scope.projectId, since, since, limit]);
  return rows.map((row) => ({ ...decodeSignalRow(row), deliveryStatus: row.delivery_status }));
}

async function ackScopedDelivery(db, scope, input) {
  const { signalId, agentId } = input;
  const result = await db.run(`UPDATE signal_deliveries SET status = 'acked',
      acked_at = CURRENT_TIMESTAMP
    WHERE signal_id = ? AND subscriber_agent_id = ? AND status IN ('delivered', 'seen')
      AND EXISTS (SELECT 1 FROM signal_blobs s
        JOIN agents sender ON sender.id = s.sender_agent_id
        JOIN workspaces sender_ws ON sender_ws.id = sender.workspace_id
        WHERE s.signal_id = signal_deliveries.signal_id
          AND sender_ws.organization_id = ? AND sender_ws.project_id = ?)`,
  [signalId, agentId, scope.organizationId, scope.projectId]);
  return result.changes === 1;
}

module.exports = { readDeliveredInbox, ackScopedDelivery };
