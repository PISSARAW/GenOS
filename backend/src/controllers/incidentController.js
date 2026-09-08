/**
 * GenOS Incidents & Global Alerts Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const platformSafety = require('../services/platformSafetyService');

async function getAlerts(req, res) {
  const db = await getDatabase();
  const scope = req.tenant;
  const workspaceName = String(req.query.workspaceId || '').trim();
  const alerts = workspaceName
    ? await db.all('SELECT * FROM global_alerts WHERE organization_id = ? AND project_id = ? AND (workspace_name = ? OR workspace_name = (SELECT name FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?)) ORDER BY created_at DESC', scope.organizationId, scope.projectId, workspaceName, workspaceName, scope.organizationId, scope.projectId)
    : await db.all('SELECT * FROM global_alerts WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC', scope.organizationId, scope.projectId);

  const formatted = alerts.map(a => ({
    id: a.id,
    title: a.title,
    status: a.status,
    agent: a.agent_name,
    workspace: a.workspace_name,
    time: a.created_at || null,
    confidence: a.confidence || null,
    severity: a.severity || null,
    contextSnapshot: a.context_snapshot
  }));

  res.json(formatted);
}

async function getIncidents(req, res) {
  return getAlerts(req, res);
}

async function replayIncident(req, res) {
  const { incidentId = 'inc-001', stepSpeed = 100 } = req.body || {};

  const db = await getDatabase();
  const incident = await db.get('SELECT * FROM global_alerts WHERE id = ? AND organization_id = ? AND project_id = ?', incidentId, req.tenant.organizationId, req.tenant.projectId);
  if (!incident) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Incident not found: ${incidentId}` } });
  }

  telemetry.emitEvent({
    eventType: 'INCIDENT_REPLAY_STARTED',
    agentId: 'incident_controller',
    action: 'REPLAY',
    detail: `Causal replay initiated for incident ${incidentId}`,
    severity: 'info'
  });

  const events = await db.all('SELECT * FROM telemetry_events WHERE organization_id = ? AND project_id = ? ORDER BY created_at ASC LIMIT 10000', req.tenant.organizationId, req.tenant.projectId);
  res.json({ success: true, ...platformSafety.buildReplay(incidentId, events, stepSpeed) });
}

async function killTask(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  const result = await db.run("UPDATE global_alerts SET status = 'resolved' WHERE id = ? AND organization_id = ? AND project_id = ?", id, req.tenant.organizationId, req.tenant.projectId);
  if (result.changes !== 1) return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: `Task ${id} was not found in the current project.` } });

  telemetry.emitEvent({
    eventType: 'TASK_CANCELLED',
    agentId: 'incident_controller',
    action: 'KILL_TASK',
    detail: `Cancelled alert task: ${id}`,
    severity: 'warning'
  });

  res.json({ success: true, message: `Task ${id} cancelled and marked resolved.` });
}

module.exports = {
  getAlerts,
  getIncidents,
  replayIncident,
  killTask
};
