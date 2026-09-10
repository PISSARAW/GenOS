/**
 * Quarantine release (bug #7.6): the mirror of `quarantine` in safety.js.
 *
 * Quarantine had no exit primitive: a quarantined agent (status `blocked`,
 * isolation `Quarantine`) could never be restored to service. Releasing moves
 * the agent back to `idle` / isolation `None`, emits AGENT_UNQUARANTINED via
 * telemetry, and only touches rows still in quarantine
 * (`status = 'blocked' AND isolation_mode = 'Quarantine'`) so a state that
 * changed in the meantime is never overwritten.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');

function releaseCommandOf(context) {
  const scope = context || {};
  return {
    targetId: scope.targetId || scope.agentId,
    actorId: scope.actorId || scope.orchestratorId || scope.agentId,
    workspaceId: scope.workspaceId || null,
    reason: scope.reason || 'Quarantine lifted after review.'
  };
}

async function authorizeReleaseTarget(db, command) {
  const authority = require('../agentAuthorityService');
  try {
    const agent = await authority.authorizeAgentControl(db, command.targetId, command.actorId, command.workspaceId);
    return { authorized: true, agent };
  } catch (error) {
    return { authorized: false, code: error.code, error: error.message };
  }
}

async function readQuarantineState(db, targetId) {
  return db.get('SELECT id, status, isolation_mode FROM agents WHERE id = ?', targetId);
}

function isQuarantinedRow(row) {
  return Boolean(row) && row.status === 'blocked' && row.isolation_mode === 'Quarantine';
}

async function clearQuarantineState(db, targetId, reason) {
  const before = await readQuarantineState(db, targetId);
  if (!isQuarantinedRow(before)) return null;
  const result = await db.run(
    "UPDATE agents SET status = 'idle', isolation_mode = 'None', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked' AND isolation_mode = 'Quarantine'",
    '[RELEASED] ' + reason,
    targetId
  );
  if ((result?.changes || 0) !== 1) return null;
  return before;
}

function emitReleaseTelemetry(command, previous) {
  telemetry.emitEvent({
    eventType: 'AGENT_UNQUARANTINED',
    agentId: command.targetId,
    action: 'UNQUARANTINE',
    detail: 'Agent ' + command.targetId + ' released from quarantine: ' + command.reason,
    severity: 'info',
    payload: { targetId: command.targetId, reason: command.reason, previousStatus: previous.status }
  });
}

async function releaseQuarantine(context) {
  const command = releaseCommandOf(context);
  if (!command.targetId) return { success: false, error: 'targetId required for quarantine release.' };
  const db = await getDatabase();
  const auth = await authorizeReleaseTarget(db, command);
  if (!auth.authorized) return { success: false, code: auth.code, error: auth.error };
  const previous = await clearQuarantineState(db, command.targetId, command.reason);
  if (!previous) {
    return { success: false, code: 'QUARANTINE_STATE_CHANGED', error: `Agent '${command.targetId}' is not in quarantine; its status changed.` };
  }
  emitReleaseTelemetry(command, previous);
  return { success: true, released: command.targetId, reason: command.reason, previousStatus: previous.status };
}

async function unquarantine(context) {
  return releaseQuarantine(context);
}

module.exports = {
  releaseQuarantine,
  unquarantine
};
