'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { text, object, evidence, scope } = require('./ontologyContracts');

function parse(row) {
  return {
    id: row.id, entityId: row.entity_id, dimension: row.dimension,
    representation: row.representation, value: row.value, discreteState: row.discrete_state,
    thresholds: JSON.parse(row.thresholds_json || '[]'), evidence: JSON.parse(row.evidence_json || '{}'),
    organizationId: row.organization_id, projectId: row.project_id, observedAt: row.observed_at,
  };
}

function thresholds(input) {
  const list = Array.isArray(input.thresholds) ? input.thresholds : [];
  return list.map(item => ({ at: Number(item.at), state: text(item.state, 'threshold.state') }))
    .filter(item => Number.isFinite(item.at)).sort((a, b) => b.at - a.at);
}

function stateFor(value, definitions) {
  const match = definitions.find(item => value <= item.at);
  return match ? match.state : 'normal';
}

async function recordObservation(input = {}) {
  const entityId = text(input.entityId || input.agentId, 'entityId');
  const dimension = text(input.dimension, 'dimension');
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error('value must be a finite number.');
  const defs = thresholds(input);
  const db = await getDatabase();
  const id = `ocont_${crypto.randomUUID()}`;
  const current = input.discreteState || stateFor(value, defs);
  const currentScope = scope(input);
  await db.run(`INSERT INTO ontology_continuity_observations
    (id, entity_id, dimension, representation, value, discrete_state, thresholds_json, evidence_json, organization_id, project_id)
    VALUES (?, ?, ?, 'continuous', ?, ?, ?, ?, ?, ?)`, id, entityId, dimension, value, current,
  JSON.stringify(defs), JSON.stringify(evidence(input.evidence)), currentScope.organizationId, currentScope.projectId);
  return parse(await db.get('SELECT * FROM ontology_continuity_observations WHERE id = ?', id));
}

async function classify(input = {}) {
  const entityId = text(input.entityId || input.agentId, 'entityId');
  const dimension = text(input.dimension, 'dimension');
  const db = await getDatabase();
  const row = await db.get(`SELECT * FROM ontology_continuity_observations
    WHERE entity_id = ? AND dimension = ? ORDER BY observed_at DESC LIMIT 1`, entityId, dimension);
  if (!row) return { found: false, entityId, dimension };
  const result = parse(row);
  return { found: true, ...result, classification: stateFor(result.value, result.thresholds) };
}

async function detectTransition(input = {}) {
  const entityId = text(input.entityId || input.agentId, 'entityId');
  const dimension = text(input.dimension, 'dimension');
  const db = await getDatabase();
  const rows = await db.all(`SELECT * FROM ontology_continuity_observations
    WHERE entity_id = ? AND dimension = ? ORDER BY observed_at DESC LIMIT 2`, entityId, dimension);
  if (rows.length < 2) return { detected: false, reason: 'insufficient_observations' };
  const current = parse(rows[0]);
  const previous = parse(rows[1]);
  return { detected: current.discreteState !== previous.discreteState, previous, current,
    transition: current.discreteState !== previous.discreteState ? 'threshold_crossing' : 'continuous' };
}

module.exports = { recordObservation, classify, detectTransition, parse, object };
