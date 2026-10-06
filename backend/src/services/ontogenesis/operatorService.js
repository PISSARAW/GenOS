'use strict';

const { withTransaction } = require('../../db');
const { getProject, addTask, listTasks } = require('./projectStore');
const { postEvent, postInbox } = require('./inboxService');
const { recordMemory } = require('./memoryService');
const { validateProjectConfig } = require('./configSchema');
const { activeExecution } = require('./executionStore');

async function requireProject(db, projectId) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error('projet-introuvable');
  return project;
}

function strings(value, field) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${field}-invalide`);
  }
}

function validateTask(input) {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('titre-requis');
  const priority = input.priority ?? 0;
  if (!Number.isSafeInteger(priority)) throw new Error('priorite-invalide');
  const dependsOn = input.dependsOn || [];
  const acceptance = input.acceptance || [];
  strings(dependsOn, 'dependances');
  strings(acceptance, 'acceptation');
  return { priority, dependsOn, acceptance };
}

async function addOperatorTask(db, input) {
  await requireProject(db, input.projectId);
  const { priority, dependsOn, acceptance } = validateTask(input);
  return withTransaction(db, async () => {
    const tasks = await listTasks(db, input.projectId);
    if (dependsOn.some((id) => !tasks.some((task) => task.id === id))) throw new Error('dependance-hors-projet');
    const id = await addTask(db, { ...input, priority, dependsOn, acceptance });
    await postEvent(db, { projectId: input.projectId, type: 'user_reply', payload: { taskId: id } });
    return id;
  });
}

async function sendMessage(db, input) {
  await requireProject(db, input.projectId);
  if (typeof input.body !== 'string' || !input.body.trim()) throw new Error('message-requis');
  if (input.body.length > 32000) throw new Error('message-trop-long');
  return postInbox(db, { ...input, kind: input.kind || 'user' });
}

async function reprioritize(db, input) {
  if (!Number.isSafeInteger(input.priority)) throw new Error('priorite-invalide');
  return sendMessage(db, { projectId: input.projectId, kind: 'priority',
    body: JSON.stringify({ taskId: input.taskId, priority: input.priority }) });
}

function budgetReplacement(config, budgets) {
  const checked = validateProjectConfig({ ...config, budgets });
  if (!checked.ok) throw new Error(`configuration-invalide:${checked.errors.join(',')}`);
  return checked.config;
}

async function reviseBudgets(db, input) {
  if (typeof input.reason !== 'string' || !input.reason.trim()) throw new Error('raison-requise');
  return withTransaction(db, async () => {
    const project = await requireProject(db, input.projectId);
    if (await activeExecution(db, input.projectId)) throw new Error('execution-en-cours');
    const claim = await db.get("SELECT project_id FROM ontogenesis_claims WHERE project_id = ? AND julianday(expires_at) > julianday('now')", [input.projectId]);
    if (claim) throw new Error('claim-actif');
    const config = JSON.parse(project.config_json);
    const updated = budgetReplacement(config, input.budgets);
    await recordMemory(db, { projectId: input.projectId, kind: 'decision', content: input.reason,
      provenance: { action: 'revise-budgets', previous: config.budgets, budgets: updated.budgets } });
    await db.run("UPDATE ontogenesis_projects SET config_json = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updated), input.projectId]);
    await postEvent(db, { projectId: input.projectId, type: 'user_reply', payload: { reason: 'budgets-revises' } });
    return updated.budgets;
  });
}

module.exports = { requireProject, addOperatorTask, sendMessage, reprioritize, reviseBudgets };
