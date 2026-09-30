'use strict';

const { checkCnidocyteReflex } = require('../mcpLigandReceptorService');
const telemetry = require('../telemetryObserver');

async function screenCnidocyteThreat(db, request) {
  const { agentId, organizationId, projectId, toolName, args, taints } = request;
  let rawPayload;
  try {
    rawPayload = JSON.stringify({ args, taints });
  } catch (error) {
    return { success: false, status: 'blocked', error: `Cnidocyte input serialization failed: ${error.message}`, policy: { decision: 'deny', reason: 'CNIDOCYTE_SCAN_FAILED' } };
  }
  const reflex = checkCnidocyteReflex(toolName, rawPayload);
  if (!reflex.intercepted) return null;
  const reason = `Cnidocyte blocked MCP payload signature '${reflex.toxinDetected}'.`;
  await db.run(
    'INSERT INTO audit_logs (actor,agent_id,action,resource,decision,reason,payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    agentId || 'cnidocyte', agentId || null, 'WORKFLOW_TOOL_CALL', toolName, 'deny', reason,
    JSON.stringify({ schema: 'genos.cnidocyte-interception/v1', signature: reflex.toxinDetected, declaredLatencyMicros: reflex.latencyMicros, organizationId, projectId })
  );
  telemetry.emitEvent({
    eventType: 'CNIDOCYTE_MCP_INTERCEPTED', agentId: agentId || 'cnidocyte', action: 'MCP_EXECUTE',
    detail: reason, severity: 'critical',
    payload: { toolName, signature: reflex.toxinDetected, measuredLatencyMicros: reflex.latencyMicros, organizationId, projectId },
  });
  return {
    success: false, status: 'blocked', error: reason, reason,
    toxinDetected: reflex.toxinDetected, latencyMicros: reflex.latencyMicros,
    policy: { decision: 'deny', reason: 'CNIDOCYTE_REFLEX_INTERCEPTED' },
  };
}

module.exports = { screenCnidocyteThreat };
