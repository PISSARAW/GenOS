'use strict';

function buildSignalReadQuery(subscriberAgentId, since, selection) {
  const includePending = selection?.includePending === true;
  const limit = typeof selection === 'object' ? selection.limit : selection;
  const targeted = includePending ? ` OR EXISTS (SELECT 1 FROM signal_deliveries targeted
    WHERE targeted.signal_id = s.signal_id AND targeted.subscriber_agent_id = ?
      AND targeted.status = 'pending')` : '';
  const excluded = includePending ? " AND d.status IN ('seen', 'acked', 'delivered')" : '';
  const sql = `SELECT DISTINCT s.signal_id, s.signal_type, s.signal_blob, s.content, s.topic, s.sender_agent_id, s.created_at
    FROM signal_blobs s
    JOIN agents receiver ON receiver.id = ?
    JOIN workspaces receiver_ws ON receiver_ws.id = receiver.workspace_id
    JOIN agents sender ON sender.id = s.sender_agent_id
    JOIN workspaces sender_ws ON sender_ws.id = sender.workspace_id
    LEFT JOIN signal_subscriptions sub ON sub.topic = s.topic AND sub.subscriber_agent_id = ?
    WHERE s.signal_type != 'text' AND s.sender_agent_id != ?
      AND (sub.subscriber_agent_id IS NOT NULL OR s.topic = ''${targeted})
      AND receiver_ws.organization_id IS NOT NULL AND receiver_ws.project_id IS NOT NULL
      AND sender_ws.organization_id = receiver_ws.organization_id
      AND sender_ws.project_id = receiver_ws.project_id
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      AND NOT EXISTS (SELECT 1 FROM signal_deliveries d
        WHERE d.signal_id = s.signal_id AND d.subscriber_agent_id = ?${excluded})
      ${since ? 'AND s.created_at > ?' : ''} ORDER BY s.created_at DESC LIMIT ?`;
  const vals = [subscriberAgentId, subscriberAgentId, subscriberAgentId];
  if (includePending) vals.push(subscriberAgentId);
  vals.push(subscriberAgentId);
  if (since) vals.push(since);
  vals.push(limit);
  return { sql, vals };
}

module.exports = { buildSignalReadQuery };
