/**
 * GenOS Incidents & Global Alerts Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const platformSafety = require('../services/platformSafetyService');

async function getAlerts(req, res) {
  const db = await getDatabase();
  const workspaceName = String(req.query.workspaceId || '').trim();
  const alerts = workspaceName
    ? await db.all('SELECT * FROM global_alerts WHERE workspace_name = ? OR workspace_name = (SELECT name FROM workspaces WHERE id = ?) ORDER BY created_at DESC', workspaceName, workspaceName)
    : await db.all('SELECT * FROM global_alerts ORDER BY created_at DESC');

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
  const incident = await db.get('SELECT * FROM global_alerts WHERE id = ?', incidentId);
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

  const events = await db.all('SELECT * FROM telemetry_events ORDER BY created_at ASC');
  res.json({ success: true, ...platformSafety.buildReplay(incidentId, events, stepSpeed) });
}

async function killTask(req, res) {
  const { id } = req.params;
  const db = await getDatabase();
  await db.run("UPDATE global_alerts SET status = 'resolved' WHERE id = ?", id);

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
