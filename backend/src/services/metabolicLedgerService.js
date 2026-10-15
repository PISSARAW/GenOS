'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { METRICS, normalizeObservation } = require('./metabolicLedgerContract');
const { stableStringify } = require('./fossilProvenanceService');

const SOURCE_PRIORITY = Object.freeze({ exact: 0, provider_receipt: 1, estimated: 2 });

function optionalIdentity(value, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeLedgerObservation(input) {
  return { ...normalizeObservation(input),
    episodeId: optionalIdentity(input.episodeId, 'episodeId'),
    workerId: optionalIdentity(input.workerId, 'workerId') };
}

function observationHash(observation) {
  const { observedAt: _ingestedAt, ...stable } = observation;
  const material = { ...stable,
    measurements: [...stable.measurements].sort((a, b) => a.metric.localeCompare(b.metric)) };
  return crypto.createHash('sha256').update(stableStringify(material)).digest('hex');
}

async function insertObservation(db, observation, hash) {
  await db.run(`INSERT INTO metabolic_ledger_observations (
    observation_id, mission_id, episode_id, thread_id, worker_id,
    organization_id, project_id, provider, model, operation_id,
    started_at, finished_at, observed_at, observation_hash, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, observation.id,
  observation.missionId, observation.episodeId, observation.threadId, observation.workerId,
  observation.organizationId, observation.projectId, observation.provider, observation.model,
  observation.operationId, observation.startedAt, observation.finishedAt,
  observation.observedAt, hash, JSON.stringify(observation.metadata));
}

async function insertMeasurements(db, observation) {
  for (const measurement of observation.measurements) {
    await db.run(`INSERT INTO metabolic_ledger_measurements (
      observation_id, metric, value, source, evidence_ref, estimation_method, unavailable_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, observation.id, measurement.metric, measurement.value,
    measurement.source, measurement.evidenceRef, measurement.estimationMethod,
    measurement.unavailableReason);
  }
}

function collision(observationId) {
  return Object.assign(new Error(`Metabolic observation '${observationId}' has another payload.`), {
    code: 'METABOLIC_OBSERVATION_ID_COLLISION'
  });
}

async function recordMetabolicObservation(db, input) {
  const observation = normalizeLedgerObservation(input);
  const hash = observationHash(observation);
  return withTransaction(db, async (tx) => {
    const existing = await tx.get(`SELECT observation_hash FROM metabolic_ledger_observations
      WHERE observation_id = ?`, observation.id);
    if (existing) {
      if (existing.observation_hash === hash) return observation;
      throw collision(observation.id);
    }
    await insertObservation(tx, observation, hash);
    await insertMeasurements(tx, observation);
    return observation;
  });
}

function requiredFilterText(filter, field) {
  if (typeof filter[field] !== 'string' || filter[field].trim() === '') {
    throw new TypeError(`${field} is required for metabolic aggregation.`);
  }
  return filter[field].trim();
}

function filterClause(filter) {
  if (!filter || typeof filter !== 'object') throw new TypeError('A ledger filter is required.');
  const clauses = ['o.mission_id = ?'];
  const params = [requiredFilterText(filter, 'missionId')];
  const fields = [['organizationId', 'organization_id'], ['projectId', 'project_id'],
    ['episodeId', 'episode_id'], ['threadId', 'thread_id'], ['workerId', 'worker_id']];
  for (const [field, column] of fields) {
    if (filter[field] != null) {
      clauses.push(`o.${column} = ?`);
      params.push(optionalIdentity(filter[field], field));
    }
  }
  return { sql: clauses.join(' AND '), params };
}

function strongestSource(rows) {
  return rows.reduce((selected, row) => SOURCE_PRIORITY[row.source] > SOURCE_PRIORITY[selected]
    ? row.source : selected, 'exact');
}

function sourceCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.source] = (counts[row.source] || 0) + 1;
    return counts;
  }, {});
}

function aggregateMetric(rows, unit) {
  if (!rows.length) return { value: null, observedValue: null, source: 'unavailable',
    complete: false, samples: 0, sources: {}, unit };
  const available = rows.filter((row) => row.source !== 'unavailable');
  const observedValue = available.length
    ? available.reduce((sum, row) => sum + Number(row.value), 0) : null;
  const complete = available.length === rows.length;
  return {
    value: complete ? observedValue : null, observedValue,
    source: complete ? strongestSource(available) : 'unavailable', complete,
    samples: rows.length, sources: sourceCounts(rows), unit
  };
}

function groupByMetric(rows) {
  return rows.reduce((groups, row) => {
    if (!groups[row.metric]) groups[row.metric] = [];
    groups[row.metric].push(row);
    return groups;
  }, {});
}

function aggregateRows(rows) {
  const grouped = groupByMetric(rows);
  return Object.fromEntries(Object.entries(METRICS).map(([publicName, definition]) => [
    publicName, aggregateMetric(grouped[definition[0]] || [], definition[1])
  ]));
}

async function measurementRows(db, where, cellColumns = '') {
  return db.all(`SELECT ${cellColumns} m.metric, m.value, m.source
    FROM metabolic_ledger_measurements m
    JOIN metabolic_ledger_observations o ON o.observation_id = m.observation_id
    WHERE ${where.sql}
    ORDER BY o.observed_at, o.observation_id, m.metric`, ...where.params);
}

async function aggregateMetabolicUsage(db, filter) {
  const rows = await measurementRows(db, filterClause(filter));
  return { missionId: filter.missionId.trim(), episodeId: filter.episodeId?.trim() || null,
    threadId: filter.threadId?.trim() || null, workerId: filter.workerId?.trim() || null,
    metrics: aggregateRows(rows) };
}

function requireTenant(filter) {
  return { organizationId: requiredFilterText(filter, 'organizationId'),
    projectId: requiredFilterText(filter, 'projectId') };
}

function groupCellRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const identity = { episodeId: row.episode_id, threadId: row.thread_id,
      workerId: row.worker_id };
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { ...identity, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(({ rows: metrics, ...identity }) => ({
    ...identity, metrics: aggregateRows(metrics)
  }));
}

async function aggregateMetabolicUsageByCell(db, filter) {
  const tenant = requireTenant(filter);
  const where = filterClause({ ...filter, ...tenant });
  const rows = await measurementRows(db, where,
    'o.episode_id, o.thread_id, o.worker_id,');
  return { missionId: filter.missionId.trim(), ...tenant, cells: groupCellRows(rows) };
}

module.exports = { recordMetabolicObservation, aggregateMetabolicUsage,
  aggregateMetabolicUsageByCell, aggregateRows };
