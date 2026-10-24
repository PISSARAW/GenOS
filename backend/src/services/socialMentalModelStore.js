'use strict';

const crypto = require('node:crypto');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail('SOCIAL_MODEL_INVALID', `${name} is required.`);
  return value.trim();
}

function validateAgentPair(input) {
  const subjectAgentId = requiredText(input.subjectAgentId, 'subjectAgentId');
  const otherAgentId = requiredText(input.otherAgentId, 'otherAgentId');
  if (subjectAgentId === otherAgentId) fail('SOCIAL_MODEL_INVALID', 'A social model requires two distinct agents.');
  return { subjectAgentId, otherAgentId };
}

function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('SOCIAL_MODEL_INVALID', 'revision must be a positive integer.');
}

function validateModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SOCIAL_MODEL_INVALID', 'model must be an object.');
  return JSON.stringify(value);
}

function normalizeSourceMemoryIds(value) {
  if (!Array.isArray(value)) fail('SOCIAL_MODEL_INVALID', 'sourceMemoryIds must be an array.');
  const ids = [...new Set(value)].map((id) => requiredText(id, 'sourceMemoryId'));
  if (ids.length === 0) fail('SOCIAL_MODEL_INVALID', 'At least one source memory is required.');
  return ids;
}

function normalizeInput(input) {
  const { subjectAgentId, otherAgentId } = validateAgentPair(input);
  validateRevision(input.revision);
  const sourceMemoryIds = normalizeSourceMemoryIds(input.sourceMemoryIds);
  const modelJson = validateModel(input.model);
  const modelHash = crypto.createHash('sha256').update(modelJson).digest('hex');
  return {
    snapshotId: requiredText(input.snapshotId, 'snapshotId'),
    organizationId: typeof input.organizationId === 'string' ? input.organizationId.trim() : '',
    projectId: typeof input.projectId === 'string' ? input.projectId.trim() : '',
    subjectAgentId, otherAgentId, revision: input.revision, modelJson, modelHash, sourceMemoryIds,
    intervention: input.intervention ? requiredText(input.intervention, 'intervention') : null,
  };
}

function sameSnapshot(row, record) {
  return row.model_hash === record.modelHash && row.model_json === record.modelJson
    && row.source_memory_ids_json === JSON.stringify(record.sourceMemoryIds)
    && row.intervention === record.intervention;
}

async function persistSocialMentalModel(db, input) {
  const record = normalizeInput(input);
  await db.run(`INSERT OR IGNORE INTO social_mental_model_snapshots
    (snapshot_id, organization_id, project_id, subject_agent_id, other_agent_id,
     revision, model_json, source_memory_ids_json, model_hash, intervention)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  record.snapshotId, record.organizationId, record.projectId, record.subjectAgentId,
  record.otherAgentId, record.revision, record.modelJson, JSON.stringify(record.sourceMemoryIds),
  record.modelHash, record.intervention);
  const row = await db.get('SELECT * FROM social_mental_model_snapshots WHERE snapshot_id = ?', record.snapshotId);
  if (!row || !sameSnapshot(row, record)) fail('SOCIAL_MODEL_REVISION_CONFLICT', 'Snapshot id or scoped revision already exists with different content.');
  return toSnapshot(row);
}

function toSnapshot(row) {
  return {
    snapshotId: row.snapshot_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    subjectAgentId: row.subject_agent_id,
    otherAgentId: row.other_agent_id,
    revision: row.revision,
    model: JSON.parse(row.model_json),
    sourceMemoryIds: JSON.parse(row.source_memory_ids_json),
    modelHash: row.model_hash,
    intervention: row.intervention,
    createdAt: row.created_at,
  };
}

async function getLatestSocialMentalModel(db, scope) {
  const row = await db.get(`SELECT * FROM social_mental_model_snapshots
    WHERE organization_id = ? AND project_id = ? AND subject_agent_id = ? AND other_agent_id = ?
    ORDER BY revision DESC LIMIT 1`,
  scope.organizationId || '', scope.projectId || '',
  requiredText(scope.subjectAgentId, 'subjectAgentId'), requiredText(scope.otherAgentId, 'otherAgentId'));
  return row ? toSnapshot(row) : null;
}

module.exports = { persistSocialMentalModel, getLatestSocialMentalModel };
