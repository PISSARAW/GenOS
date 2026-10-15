'use strict';

const { withTransaction } = require('../db');
const { METRICS, normalizeObservation } = require('./metabolicLedgerContract');

const SOURCE_PRIORITY = Object.freeze({ exact: 0, provider_receipt: 1, estimated: 2 });

async function insertObservation(db, observation) {
  await db.run(`INSERT INTO metabolic_ledger_observations (
    observation_id, mission_id, thread_id, organization_id, project_id, provider, model,
    operation_id, started_at, finished_at, observed_at, metadata_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, observation.id, observation.missionId,
  observation.threadId, observation.organizationId, observation.projectId,
  observation.provider, observation.model, observation.operationId, observation.startedAt,
  observation.finishedAt, observation.observedAt, JSON.stringify(observation.metadata));
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

async function recordMetabolicObservation(db, input) {
  const observation = normalizeObservation(input);
  await withTransaction(db, async (tx) => {
    await insertObservation(tx, observation);
    await insertMeasurements(tx, observation);
  });
  return observation;
}

function filterClause(filter) {
  if (!filter || typeof filter !== 'object') throw new TypeError('A ledger filter is required.');
  if (typeof filter.missionId !== 'string' || filter.missionId.trim() === '') {
    throw new TypeError('missionId is required for metabolic aggregation.');
  }
  const clauses = ['o.mission_id = ?'];
  const params = [filter.missionId.trim()];
  if (filter.threadId != null) {
    if (typeof filter.threadId !== 'string' || filter.threadId.trim() === '') {
      throw new TypeError('threadId must be a non-empty string.');
    }
    clauses.push('o.thread_id = ?');
    params.push(filter.threadId.trim());
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

async function aggregateMetabolicUsage(db, filter) {
  const where = filterClause(filter);
  const rows = await db.all(`SELECT m.metric, m.value, m.source
    FROM metabolic_ledger_measurements m
    JOIN metabolic_ledger_observations o ON o.observation_id = m.observation_id
    WHERE ${where.sql}
    ORDER BY o.observed_at, o.observation_id, m.metric`, ...where.params);
  return { missionId: filter.missionId.trim(), threadId: filter.threadId?.trim() || null,
    metrics: aggregateRows(rows) };
}

module.exports = { recordMetabolicObservation, aggregateMetabolicUsage, aggregateRows };
