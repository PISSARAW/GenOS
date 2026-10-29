'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../../db');
const { getProject, addTask, listTasks } = require('./projectStore');
const { postEvent, postInbox } = require('./inboxService');
const { recordMemory } = require('./memoryService');
const { validateProjectConfig } = require('./configSchema');
const { activeExecution } = require('./executionStore');
const { HOST_TRUST_MODE } = require('./verificationTrust');

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

async function reviseAttemptLimit(db, input) {
  if (typeof input.reason !== 'string' || !input.reason.trim()) throw new Error('raison-requise');
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10) {
    throw new Error('max-attempts-invalide');
  }
  return withTransaction(db, async () => {
    const project = await requireProject(db, input.projectId);
    if (await activeExecution(db, input.projectId)) throw new Error('execution-en-cours');
    const claim = await db.get("SELECT project_id FROM ontogenesis_claims WHERE project_id = ? AND julianday(expires_at) > julianday('now')", [input.projectId]);
    if (claim) throw new Error('claim-actif');
    const config = JSON.parse(project.config_json);
    const updated = validateProjectConfig({ ...config,
      durability: { ...config.durability, maxAttempts: input.maxAttempts } });
    if (!updated.ok) throw new Error(`configuration-invalide:${updated.errors.join(',')}`);
    await recordMemory(db, { projectId: input.projectId, kind: 'decision', content: input.reason,
      provenance: { action: 'revise-attempt-limit', previous: config.durability.maxAttempts || 3,
        maxAttempts: updated.config.durability.maxAttempts } });
    await db.run("UPDATE ontogenesis_projects SET config_json = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updated.config), input.projectId]);
    await postEvent(db, { projectId: input.projectId, type: 'user_reply',
      payload: { reason: 'limite-tentatives-revisee', maxAttempts: updated.config.durability.maxAttempts } });
    return updated.config.durability.maxAttempts;
  });
}

function configDigest(config) {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

async function assertConfigRevisionAvailable(db, projectId) {
  if (await activeExecution(db, projectId)) throw new Error('execution-en-cours');
  const claim = await db.get("SELECT project_id FROM ontogenesis_claims WHERE project_id = ? AND julianday(expires_at) > julianday('now')", [projectId]);
  if (claim) throw new Error('claim-actif');
}

async function reviseProjectConfig(db, input) {
  if (typeof input.reason !== 'string' || !input.reason.trim()) throw new Error('raison-requise');
  if (input.reason.length > 2000) throw new Error('raison-trop-longue');
  return withTransaction(db, async () => {
    const project = await requireProject(db, input.projectId);
    await assertConfigRevisionAvailable(db, input.projectId);
    const checked = validateProjectConfig(input.config);
    if (!checked.ok) throw new Error(`configuration-invalide:${checked.errors.join(',')}`);
    if (checked.config.branch !== project.branch) throw new Error('branche-projet-configuration-incoherente');
    const previous = JSON.parse(project.config_json || '{}');
    const previousHash = configDigest(previous);
    const configHash = configDigest(checked.config);
    const hostTrustDeclarations = checked.config.checks.flatMap((check, index) =>
      check.trustMode === HOST_TRUST_MODE ? [index] : []);
    await recordMemory(db, { projectId: input.projectId, kind: 'decision', content: input.reason,
      provenance: { action: 'revise-project-config', previousHash, configHash,
        hostTrustMode: HOST_TRUST_MODE, hostTrustDeclarations } });
    await db.run("UPDATE ontogenesis_projects SET config_json = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(checked.config), input.projectId]);
    await postEvent(db, { projectId: input.projectId, type: 'user_reply', payload: {
      reason: 'configuration-projet-revisee', previousHash, configHash
    } });
    return { config: checked.config, previousHash, configHash };
  });
}

module.exports = { requireProject, addOperatorTask, sendMessage, reprioritize, reviseBudgets,
  reviseAttemptLimit, reviseProjectConfig };
