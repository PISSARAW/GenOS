'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { text, evidence, scope } = require('./ontologyContracts');

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
  const row = await db.get('SELECT * FROM ontology_possible_worlds WHERE id = ?', worldId);
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
  const left = await getWorld({ worldId: input.worldA });
  const right = await getWorld({ worldId: input.worldB });
  if (!left.found || !right.found) throw new Error('Both worlds must exist.');
  const rightKeys = new Map(right.world.assumptions.map(item => [item.key, item.value]));
  const differences = left.world.assumptions.filter(item => rightKeys.get(item.key) !== item.value);
  return { worldA: left.world.worldId, worldB: right.world.worldId, differences, evidenceStatus: 'unverified' };
}

module.exports = { createWorld, getWorld, listWorlds, addAccessibility, compareWorlds, decode };
