'use strict';

/**
 * Exploitation d'un projet Ontogenèse (ADR 0235 §7).
 * Transport interprocessus : les tables SQLite en WAL sont lisibles par
 * plusieurs processus ; commandes via ontogenesis_inbox, réveils via
 * ontogenesis_events, retours via ontogenesis_notifications. Le bus
 * local du daemon reste cantonné à son processus.
 */

const { postInbox, listPendingInbox, postEvent } = require('./inboxService');
const { listPendingNotifications } = require('./notificationService');
const { listFailures } = require('./memoryService');
const { listTasks, getProject } = require('./projectStore');
const { sampleMemory } = require('./memoryPressure');
const { buildActivity } = require('./activityView');

const MODES = ['running', 'paused', 'stopping', 'stopped', 'sleeping_resource', 'waiting_input'];

function isMode(value) {
  return MODES.includes(value);
}

async function getControl(db, projectId) {
  return db.get('SELECT * FROM ontogenesis_control WHERE project_id = ?', [projectId]);
}

async function setMode(db, input) {
  if (!isMode(input.mode)) throw new Error('mode-inconnu');
  await db.run(
    `UPDATE ontogenesis_control SET mode = ?, reason = ?, updated_at = datetime('now') WHERE project_id = ?`,
    [input.mode, input.reason || '', input.projectId]
  );
}

async function pauseProject(db, input) {
  await setMode(db, { projectId: input.projectId, mode: 'paused', reason: input.reason });
  await postInbox(db, { projectId: input.projectId, kind: 'system', body: `pause:${input.reason || ''}` });
}

async function resumeProject(db, input) {
  await setMode(db, { projectId: input.projectId, mode: 'running', reason: '' });
  await postEvent(db, { projectId: input.projectId, type: 'wake', payload: { reason: 'reprise-operateur' } });
}

async function stopProject(db, input) {
  await setMode(db, { projectId: input.projectId, mode: 'stopping', reason: input.reason });
  await postInbox(db, { projectId: input.projectId, kind: 'stop', body: input.reason || '' });
}

async function startProject(db, input) {
  await setMode(db, { projectId: input.projectId, mode: 'running', reason: '' });
  await postEvent(db, { projectId: input.projectId, type: 'wake', payload: { reason: 'demarrage-operateur' } });
}

async function readRuns(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`,
    [projectId]
  );
}

async function readIntegrations(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_integrations WHERE project_id = ? ORDER BY created_at DESC LIMIT 5`,
    [projectId]
  );
}

function parseConfig(project) {
  try {
    return JSON.parse(project.config_json || '{}');
  } catch (_) {
    return {};
  }
}

function parseWorkers(run) {
  if (!run) return [];
  try {
    const workers = JSON.parse(run.worker_json || '{}');
    return Array.isArray(workers) ? workers : [workers];
  } catch (_) {
    return [];
  }
}

function currentRunOf(runs) {
  return (runs || []).find((run) => run.status === 'running') || null;
}

function lastCommitOf(integrations) {
  const committed = (integrations || []).find((row) => row.status === 'committed');
  return (committed && committed.result_sha) || null;
}

async function getStatusView(db, input) {
  const project = await getProject(db, input.projectId);
  if (!project) throw new Error('projet-introuvable');
  const control = await getControl(db, input.projectId);
  const config = parseConfig(project);
  const tasks = await listTasks(db, input.projectId);
  const runs = await readRuns(db, input.projectId);
  const integrations = await readIntegrations(db, input.projectId);
  const inbox = await listPendingInbox(db, input.projectId);
  const notifications = await listPendingNotifications(db, input.projectId);
  const failures = await listFailures(db, input.projectId);
  const current = currentRunOf(runs);
  const live = sampleMemory({ reservationsMb: 0 });
  const view = buildActivity({
    projectId: project.id, state: project.state, branch: project.branch,
    lastCommit: lastCommitOf(integrations), waitReason: (control && control.reason) || null,
    backlog: tasks, runs, inbox, notifications, failures
  });
  return {
    ...view,
    objective: project.objective,
    control: (control && control.mode) || 'inconnu',
    topology: (current && current.topology) || null,
    workers: parseWorkers(current),
    budgets: config.budgets || null,
    memory: { ...live, failures: view.memory.failures }
  };
}

function cutoffFor(olderThanDays) {
  const count = Number.isInteger(olderThanDays) && olderThanDays >= 0 ? olderThanDays : 30;
  return `-${count} days`;
}

async function pruneHistory(db, input) {
  const cutoff = cutoffFor(input.olderThanDays);
  const events = await db.run(
    `DELETE FROM ontogenesis_events WHERE project_id = ? AND consumed = 1
     AND created_at < datetime('now', ?)`,
    [input.projectId, cutoff]
  );
  const notifications = await db.run(
    `DELETE FROM ontogenesis_notifications WHERE project_id = ? AND status IN ('sent', 'acked')
     AND created_at < datetime('now', ?)`,
    [input.projectId, cutoff]
  );
  return { events: events.changes || 0, notifications: notifications.changes || 0 };
}

module.exports = {
  MODES, isMode, getControl, setMode,
  pauseProject, resumeProject, stopProject, startProject,
  getStatusView, pruneHistory
};
