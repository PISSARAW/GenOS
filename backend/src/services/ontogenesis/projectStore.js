'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../../db');

/**
 * Persistance des projets et du backlog (ADR 0235).
 * Fine couche SQLite ; un objet par appel (≤ 3 paramètres).
 */

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function createProject(db, project) {
  return withTransaction(db, () => insertProject(db, project));
}

async function insertProject(db, project) {
  const id = project.id || newId('onto');
  await db.run(
    `INSERT INTO ontogenesis_projects
       (id, root_path, branch, objective, config_json, config_version, state)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, project.rootPath, project.branch, project.objective || '',
      JSON.stringify(project.config || {}), project.configVersion || 1,
      project.state || 'INITIALIZING']
  );
  await db.run(
    `INSERT INTO ontogenesis_control (project_id, mode, reason, resume_json)
     VALUES (?, 'running', '', '{}')`,
    [id]
  );
  return id;
}

async function getProject(db, projectId) {
  return db.get('SELECT * FROM ontogenesis_projects WHERE id = ?', [projectId]);
}

async function setProjectState(db, update) {
  await db.run(
    `UPDATE ontogenesis_projects SET state = ?, updated_at = datetime('now') WHERE id = ?`,
    [update.state, update.projectId]
  );
}

async function addTask(db, task) {
  const id = task.id || newId('task');
  await db.run(
    `INSERT INTO ontogenesis_backlog
       (id, project_id, title, status, priority, depends_on_json, acceptance_json, attempt)
     VALUES (?, ?, ?, 'todo', ?, ?, ?, 0)`,
    [id, task.projectId, task.title, task.priority || 0,
      JSON.stringify(task.dependsOn || []), JSON.stringify(task.acceptance || [])]
  );
  return id;
}

async function taskByTitle(db, projectId, title) {
  return db.get(
    'SELECT id FROM ontogenesis_backlog WHERE project_id = ? AND title = ?',
    [projectId, title]
  );
}

async function listTasks(db, projectId) {
  return db.all(
    `SELECT * FROM ontogenesis_backlog WHERE project_id = ?
     ORDER BY priority DESC, rowid ASC`,
    [projectId]
  );
}

async function setTaskStatus(db, update) {
  await db.run(
    `UPDATE ontogenesis_backlog SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    [update.status, update.taskId]
  );
}

async function bumpAttempt(db, taskId) {
  await db.run('UPDATE ontogenesis_backlog SET attempt = attempt + 1 WHERE id = ?', [taskId]);
}

module.exports = { createProject, getProject, setProjectState, addTask, taskByTitle, listTasks, setTaskStatus, bumpAttempt };
