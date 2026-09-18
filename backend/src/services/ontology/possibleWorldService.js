'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const { text, evidence, scope } = require('./ontologyContracts');
const causality = require('../causalityService');

function decode(row) {
  return { worldId: row.id, parentWorldId: row.parent_world_id,
    assumptions: JSON.parse(row.assumptions_json || '[]'), status: row.status,
    evidence: JSON.parse(row.evidence_json || '{}'), organizationId: row.organization_id,
    projectId: row.project_id, createdAt: row.created_at };
}

async function createWorld(input = {}) {
  const db = await getDatabase();
  const worldId = input.worldId || `world_${crypto.randomUUID()}`;
  const currentScope = scope(input);
  const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
  await db.run(`INSERT INTO ontology_possible_worlds
    (id, parent_world_id, assumptions_json, status, evidence_json, organization_id, project_id)
    VALUES (?, ?, ?, 'hypothetical', ?, ?, ?)`, worldId, input.parentWorldId || null,
  JSON.stringify(assumptions), JSON.stringify(evidence(input.evidence)), currentScope.organizationId, currentScope.projectId);
  return decode(await db.get('SELECT * FROM ontology_possible_worlds WHERE id = ?', worldId));
}

async function getWorld(input = {}) {
  const worldId = text(input.worldId || input.id, 'worldId');
  const db = await getDatabase();
  const row = await db.get(`SELECT * FROM ontology_possible_worlds WHERE id = ?
    AND (? IS NULL OR organization_id = ?) AND (? IS NULL OR project_id = ?)`, worldId,
  input.organizationId || null, input.organizationId || null, input.projectId || null, input.projectId || null);
  return row ? { found: true, world: decode(row) } : { found: false, worldId };
}

async function listWorlds(input = {}) {
  const db = await getDatabase();
  const rows = await db.all(`SELECT * FROM ontology_possible_worlds
    WHERE (? IS NULL OR organization_id = ?) AND (? IS NULL OR project_id = ?)
    ORDER BY created_at DESC LIMIT ?`, input.organizationId || null, input.organizationId || null,
  input.projectId || null, input.projectId || null, Math.min(Math.max(Number(input.limit) || 100, 1), 500));
  return rows.map(decode);
}

async function addAccessibility(input = {}) {
  const sourceWorldId = text(input.sourceWorldId, 'sourceWorldId');
  const targetWorldId = text(input.targetWorldId, 'targetWorldId');
  if (sourceWorldId === targetWorldId) throw new Error('A world cannot access itself.');
  const db = await getDatabase();
  await db.run(`INSERT OR REPLACE INTO ontology_world_accessibility
    (source_world_id, target_world_id, conditions_json, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?)`, sourceWorldId, targetWorldId,
  JSON.stringify(Array.isArray(input.conditions) ? input.conditions : []), input.organizationId || null, input.projectId || null);
  return { sourceWorldId, targetWorldId, conditions: input.conditions || [] };
}

async function compareWorlds(input = {}) {
  const left = await getWorld({ worldId: input.worldA, organizationId: input.organizationId, projectId: input.projectId });
  const right = await getWorld({ worldId: input.worldB, organizationId: input.organizationId, projectId: input.projectId });
  if (!left.found || !right.found) throw new Error('Both worlds must exist.');
  const rightKeys = new Map(right.world.assumptions.map(item => [item.key, item.value]));
  const differences = left.world.assumptions.filter(item => rightKeys.get(item.key) !== item.value);
  return { worldA: left.world.worldId, worldB: right.world.worldId, differences, evidenceStatus: 'unverified' };
}

function canonicalPayload(input) {
  return { worldId: text(input.worldId, 'worldId'), executionId: input.executionId || null,
    outcome: input.outcome === undefined ? null : input.outcome, evidence: evidence(input.evidence) };
}

async function createReceipt(input = {}) {
  const payload = canonicalPayload(input);
  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const receiptId = `wreceipt_${crypto.randomUUID()}`;
  const currentScope = scope(input);
  const db = await getDatabase();
  await db.run(`INSERT INTO ontology_world_receipts
    (id, world_id, execution_id, payload_json, payload_hash, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, receiptId, payload.worldId, payload.executionId, payloadJson,
  payloadHash, currentScope.organizationId, currentScope.projectId);
  return { receiptId, ...payload, payloadHash, status: 'unverified' };
}

async function verifyReceipt(input = {}) {
  const receiptId = text(input.receiptId, 'receiptId');
  const db = await getDatabase();
  const row = await db.get(`SELECT * FROM ontology_world_receipts WHERE id = ?
    AND (? IS NULL OR organization_id = ?) AND (? IS NULL OR project_id = ?)`, receiptId,
  input.organizationId || null, input.organizationId || null, input.projectId || null, input.projectId || null);
  if (!row) throw new Error(`Unknown world receipt '${receiptId}'.`);
  const actualHash = crypto.createHash('sha256').update(row.payload_json).digest('hex');
  const status = actualHash === row.payload_hash ? 'verified' : 'invalid';
  await db.run('UPDATE ontology_world_receipts SET status = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?', status, receiptId);
  return { receiptId, status, payloadHash: row.payload_hash, actualHash };
}

function evaluateCausalDependence(input = {}) {
  const result = causality.computeNecessity({
    causeAgent: text(input.causeAgent, 'causeAgent'), effectAgent: text(input.effectAgent, 'effectAgent'),
    actualOutcome: input.actualOutcome, counterfactualOutcome: input.counterfactualOutcome,
  });
  return { ...result, worldId: text(input.worldId, 'worldId'), evidenceStatus: 'simulated' };
}

module.exports = { createWorld, getWorld, listWorlds, addAccessibility, compareWorlds,
  createReceipt, verifyReceipt, evaluateCausalDependence, decode };
