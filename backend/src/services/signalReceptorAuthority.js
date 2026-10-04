'use strict';

const TARGET_ACTIONS = new Set(['wake_worker', 'update_agent']);

function actionTarget(receptor) {
  return receptor.action === 'wake_worker'
    ? receptor.actionData?.workerId : receptor.actionData?.agentId;
}

async function authorizeReceptorAction(input) {
  const { db, receptor, signal } = input;
  const senderId = signal.senderAgentId;
  if (!senderId) return { authorized: false, reason: 'SENDER_REQUIRED' };
  const sender = await db.get(
    `SELECT a.execution_mode AS mode, w.organization_id AS organizationId,
            w.project_id AS projectId
     FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`,
    [senderId]
  );
  if (sender?.mode !== 'orchestrator' || !sender.organizationId || !sender.projectId) {
    return { authorized: false, reason: 'ORCHESTRATOR_SCOPE_REQUIRED' };
  }
  if (!TARGET_ACTIONS.has(receptor.action)) return { authorized: true };
  const targetId = actionTarget(receptor);
  if (!targetId || !signal.recipientAgentIds?.includes(targetId)) {
    return { authorized: false, reason: 'TARGET_NOT_ROUTED' };
  }
  const target = await db.get(
    `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND a.parent_agent_id = ? AND a.execution_mode = 'worker'
       AND w.organization_id = ? AND w.project_id = ?`,
    [targetId, senderId, sender.organizationId, sender.projectId]
  );
  return target ? { authorized: true } : { authorized: false, reason: 'TARGET_SCOPE_MISMATCH' };
}

module.exports = { authorizeReceptorAction };
