'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const store = require('./studioProductionStore');

const MODALITIES = new Set(['visual', 'functional', 'security', 'accessibility']);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function list(value, code) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw failure(code, 400);
  return value;
}

function uniqueIds(items, code) {
  const ids = items.map(item => input.text(item?.id, 100));
  if (new Set(ids).size !== ids.length) throw failure(code, 400);
  return ids;
}

function hypotheses(value) {
  const items = list(value, 'PRODUCT_HYPOTHESES_REQUIRED');
  uniqueIds(items, 'PRODUCT_HYPOTHESIS_ID_DUPLICATE');
  return items.map(item => ({ id: input.text(item.id, 100),
    statement: input.text(item.statement), falsifier: input.text(item.falsifier),
    targetUser: input.text(item.targetUser) }));
}

function criteria(value) {
  const items = list(value, 'PRODUCT_CRITERIA_REQUIRED');
  uniqueIds(items, 'PRODUCT_CRITERION_ID_DUPLICATE');
  const normalized = items.map(item => ({ id: input.text(item.id, 100),
    modality: input.text(item.modality, 30), statement: input.text(item.statement),
    threshold: input.text(item.threshold) }));
  if (normalized.some(item => !MODALITIES.has(item.modality))) throw failure('PRODUCT_MODALITY_INVALID', 400);
  const modalities = new Set(normalized.map(item => item.modality));
  if (!modalities.has('visual') || !modalities.has('functional')) {
    throw failure('PRODUCT_PLURAL_CRITERIA_REQUIRED', 400);
  }
  return normalized;
}

function payload(context, revision, parentId) {
  const body = context.body;
  return { schema: 'genos.studio-product-contract/v1', workflowId: context.workflowId,
    revision, parentId, productGoal: input.text(body.productGoal),
    userHypotheses: hypotheses(body.userHypotheses), qualityCriteria: criteria(body.qualityCriteria),
    rollbackPlan: { scope: input.text(body.rollbackPlan?.scope),
      trigger: input.text(body.rollbackPlan?.trigger) },
    learningPolicy: { minIndependentObservers: 2, holdoutRequired: true },
    boundaries: { previewIsAcceptance: false, acceptanceIsEffect: false,
      autoDeploymentAllowed: false } };
}

function projection(row) {
  const value = JSON.parse(row.payload_json);
  return { contractId: row.id, contractHash: row.payload_hash, createdBy: row.created_by,
    createdAt: row.created_at, ...value };
}

async function current(db, context) {
  await store.workflow(db, context);
  const row = await db.get(`SELECT * FROM studio_product_contracts
    WHERE workflow_id=? ORDER BY revision DESC LIMIT 1`, context.workflowId);
  if (!row) throw failure('PRODUCT_CONTRACT_NOT_FOUND', 404);
  if (digest(row.payload_json) !== row.payload_hash) throw failure('PRODUCT_CONTRACT_INTEGRITY_FAILED', 409);
  return projection(row);
}

async function create(db, context) {
  await store.workflow(db, context);
  return withTransaction(db, async () => {
    const previous = await db.get(`SELECT * FROM studio_product_contracts
      WHERE workflow_id=? ORDER BY revision DESC LIMIT 1`, context.workflowId);
    const revision = Number(previous?.revision || 0) + 1;
    if (context.body.expectedRevision !== revision - 1) throw failure('PRODUCT_CONTRACT_REVISION_CONFLICT', 409);
    const value = payload(context, revision, previous?.id || null);
    const serialized = canonical(value);
    const hash = digest(serialized);
    const id = `product-${hash.slice(0, 24)}`;
    await db.run(`INSERT INTO studio_product_contracts
      (id,workflow_id,revision,parent_id,payload_json,payload_hash,created_by)
      VALUES(?,?,?,?,?,?,?)`, id, context.workflowId, revision, previous?.id || null,
    serialized, hash, context.actor);
    return current(db, context);
  });
}

async function byId(db, context) {
  const row = await db.get(`SELECT * FROM studio_product_contracts
    WHERE id=? AND workflow_id=?`, context.contractId, context.workflowId);
  if (!row) throw failure('PRODUCT_CONTRACT_NOT_FOUND', 404);
  if (digest(row.payload_json) !== row.payload_hash) throw failure('PRODUCT_CONTRACT_INTEGRITY_FAILED', 409);
  return projection(row);
}

module.exports = { MODALITIES, byId, canonical, create, current, digest, payload };
