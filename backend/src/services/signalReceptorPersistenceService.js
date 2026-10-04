'use strict';

const { actionDispatchers } = require('./signalReceptorService');

function receptorError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateScope(scope) {
  if (!scope?.organizationId || !scope?.projectId) throw receptorError('A complete receptor scope is required.');
}

function validateReceptorInput(receptor) {
  if (!receptor) throw receptorError('Invalid receptor.');
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(receptor.id || '')) throw receptorError('Invalid receptor id.');
  if (!validLigand(receptor.targetLigand)) throw receptorError('targetLigand is required.');
  if (!actionDispatchers[receptor.action]) throw receptorError('Unsupported receptor action.');
  if (!validThreshold(receptor.threshold)) throw receptorError('threshold must be between 0 and 1.');
  if (!validActionData(receptor.actionData)) throw receptorError('actionData must be an object.');
}

function validLigand(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validThreshold(value) {
  const threshold = Number(value ?? 0.5);
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
}

function validActionData(value) {
  return value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value));
}

async function validateActionTarget(db, receptor, scope) {
  const data = receptor.actionData || {};
  const target = receptor.targetAgentId;
  if (receptor.action === 'wake_worker' && (!target || data.workerId !== target)) throw receptorError('wake_worker requires a matching targetAgentId and workerId.');
  if (receptor.action === 'update_agent' && (!target || data.agentId !== target)) throw receptorError('update_agent requires a matching targetAgentId and agentId.');
  if (!target) return;
  const row = await db.get(
    `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
    target, scope.organizationId, scope.projectId
  );
  if (!row) throw receptorError('targetAgentId is outside the receptor scope.');
}

async function saveScopedReceptor(db, scope, receptor) {
  validateScope(scope);
  validateReceptorInput(receptor);
  await validateActionTarget(db, receptor, scope);
  const result = await db.run(
    `INSERT INTO signal_receptors
     (id, organization_id, project_id, target_ligand, threshold, target_agent_id, action, action_data_json, enabled, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET target_ligand = excluded.target_ligand,
       threshold = excluded.threshold, target_agent_id = excluded.target_agent_id,
       action = excluded.action, action_data_json = excluded.action_data_json,
       enabled = excluded.enabled, description = excluded.description
     WHERE signal_receptors.organization_id = excluded.organization_id
       AND signal_receptors.project_id = excluded.project_id`,
    receptor.id, scope.organizationId, scope.projectId, receptor.targetLigand,
    Number(receptor.threshold ?? 0.5), receptor.targetAgentId || null,
    receptor.action, JSON.stringify(receptor.actionData || {}),
    receptor.enabled === false ? 0 : 1, String(receptor.description || '').slice(0, 512)
  );
  if (!result.changes) throw receptorError('Receptor id belongs to another scope.', 409);
  return { registered: true, id: receptor.id };
}

async function deleteScopedReceptor(db, scope, receptorId) {
  validateScope(scope);
  const result = await db.run(
    'DELETE FROM signal_receptors WHERE id = ? AND organization_id = ? AND project_id = ?',
    receptorId, scope.organizationId, scope.projectId
  );
  return result.changes > 0;
}

function decodeReceptor(row) {
  return {
    id: row.id, organizationId: row.organization_id, projectId: row.project_id,
    targetLigand: row.target_ligand, threshold: Number(row.threshold),
    targetAgentId: row.target_agent_id, action: row.action,
    actionData: JSON.parse(row.action_data_json), enabled: row.enabled === 1,
    description: row.description, createdAt: row.created_at
  };
}

async function listScopedReceptors(db, scope) {
  validateScope(scope);
  const rows = await db.all(
    'SELECT * FROM signal_receptors WHERE organization_id = ? AND project_id = ? ORDER BY id',
    scope.organizationId, scope.projectId
  );
  return rows.map(decodeReceptor);
}

async function loadPersistedReceptors(db) {
  return (await db.all('SELECT * FROM signal_receptors WHERE enabled = 1')).map(decodeReceptor);
}

module.exports = { saveScopedReceptor, deleteScopedReceptor, listScopedReceptors, loadPersistedReceptors };
