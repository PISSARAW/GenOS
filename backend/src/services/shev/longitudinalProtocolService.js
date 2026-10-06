'use strict';

const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { requireActive } = require('./runtimeGuard');
const { digest } = require('./sensorService');

const BASELINES = ['generalist', 'scheduled-audit', 'genos-without-shev'];

function protocolDetails(input) {
  const conditions = input.conditions;
  if (!input.dimension || !['accelerated', 'field'].includes(input.executionMode)
    || !validConditions(conditions) || !validConfounders(input.confounders)) {
    throw new TypeError('SHEV protocol requires matched model, tools, permissions and budget.');
  }
  return { dimension: input.dimension, executionMode: input.executionMode,
    conditions: { modelRef: conditions.modelRef, toolsRef: conditions.toolsRef,
      permissionsHash: conditions.permissionsHash, budgetUsd: conditions.budgetUsd },
    baselines: BASELINES, confounders: input.confounders };
}

function validConditions(conditions) {
  return conditions?.modelRef && conditions.toolsRef && /^[a-f0-9]{64}$/.test(conditions.permissionsHash || '')
    && Number.isFinite(conditions.budgetUsd) && conditions.budgetUsd > 0;
}

function validConfounders(value) {
  return Array.isArray(value) && value.length <= 20 && value.every(item => typeof item === 'string' && item.length <= 1024);
}

async function registerProtocol(db, input) {
  const details = protocolDetails(input);
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId });
    if (!responsibility.mandate.dimensions.some(item => item.name === input.dimension)) throw new Error('SHEV protocol dimension is outside the mandate.');
    await consumeAuthorization(db, { ...input.authorization, operation: 'longitudinal-registration',
      projectId: input.projectId, subjectId: input.id, expectedVersion: responsibility.mandateVersion, details });
    const cutoff = await db.get('SELECT COALESCE(MAX(rowid), 0) AS id FROM shev_monitoring');
    await db.run(`INSERT INTO shev_longitudinal_protocols
      (id, project_id, dimension, protocol_json, monitoring_cutoff, authorization_nonce)
      VALUES (?, ?, ?, ?, ?, ?)`, [input.id, input.projectId, input.dimension,
      JSON.stringify(details), cutoff.id, input.authorization.nonce]);
    return db.get('SELECT * FROM shev_longitudinal_protocols WHERE id = ?', [input.id]);
  });
}

async function comparisonProtocol(db, input) {
  const row = await db.get('SELECT * FROM shev_longitudinal_protocols WHERE id = ? AND project_id = ?', [input.protocolId, input.projectId]);
  if (!row || row.dimension !== input.dimension) throw new Error('SHEV comparison requires a persisted preregistered protocol.');
  const protocol = JSON.parse(row.protocol_json);
  const expected = new Set(protocol.baselines);
  if (input.references.length !== expected.size || input.references.some(item => !expected.has(item.id))) {
    throw new Error('SHEV comparison is missing a preregistered baseline.');
  }
  const conditionsHash = digest(protocol.conditions);
  if ([...input.treated, ...input.references.flatMap(item => item.series)].some(item => item.conditionsHash !== conditionsHash)) {
    throw new Error('SHEV comparison conditions differ across arms.');
  }
  return { ...row, protocol, conditionsHash };
}

module.exports = { registerProtocol, comparisonProtocol, protocolDetails, BASELINES };
