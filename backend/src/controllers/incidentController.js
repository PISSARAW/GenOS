/**
 * GenOS Incidents & Global Alerts Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

async function getAlerts(req, res) {
  const db = await getDatabase();
  const alerts = await db.all('SELECT * FROM global_alerts ORDER BY created_at DESC');

  const formatted = alerts.map(a => ({
    id: a.id,
    title: a.title,
    status: a.status,
    agent: a.agent_name,
    workspace: a.workspace_name,
    time: 'Just now',
    confidence: a.confidence || '95%',
    severity: a.severity || 'medium',
    contextSnapshot: a.context_snapshot
  }));

  res.json(formatted);
}

async function getIncidents(req, res) {
  return getAlerts(req, res);
}

async function replayIncident(req, res) {
  const { incidentId = 'inc-001', stepSpeed = 100 } = req.body || {};

  telemetry.emitEvent({
    eventType: 'INCIDENT_REPLAY_STARTED',
    agentId: 'incident_controller',
    action: 'REPLAY',
    detail: `Causal replay initiated for incident ${incidentId}`,
    severity: 'info'
  });

  res.json({
    success: true,
    incidentId,
    totalSteps: 8,
    timeline: [
      { step: 1, action: 'Agent deleted unused import in auth.ts', status: 'WARN' },
      { step: 2, action: 'Static analyzer emitted false-positive syntax error', status: 'ERROR' },
      { step: 3, action: 'Automated 500ms rollback triggered', status: 'SUCCESS' },
      { step: 4, action: 'Workspace state restored to clean snapshot', status: 'SUCCESS' }
    ]
  });
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
