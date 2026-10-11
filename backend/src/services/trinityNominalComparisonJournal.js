'use strict';

const { digest } = require('./trinityExecutionJournal');

async function read(db, missionId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trinity_runtime_journal'");
  if (!table) return { status: 'missing' };
  const row = await db.get('SELECT input_hash, value_json FROM trinity_runtime_journal WHERE mission_id = ? AND stage = ?', missionId, 'comparison');
  if (!row) return { status: 'missing' };
  try {
    const record = JSON.parse(row.value_json);
    const event = await storedEvent(db, missionId, record.trace?.stageId);
    if (!valid({ record, row, missionId, event })) return { status: 'invalid' };
    return { status: 'verified', comparison: record.value };
  } catch (_) {
    return { status: 'invalid' };
  }
}

async function storedEvent(db, missionId, stageId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trinity_trace_events'");
  if (!table || !stageId) return null;
  return db.get(`SELECT event_hash, event_json FROM trinity_trace_events
    WHERE mission_id = ? AND stage_id = ? AND stage = 'comparison' AND status = 'completed'`, missionId, stageId);
}

function valid(input) {
  const { record, row, missionId } = input;
  return validValue(record) && validMetadata(record, missionId)
    && validEvent(input.event, record, row);
}

function validValue(record) {
  return typeof record?.value?.outcome === 'string'
    && record.value.comparativeAnalysis && typeof record.value.comparativeAnalysis === 'object'
    && record.digest === digest(record.value);
}

function validMetadata(record, missionId) {
  const metadata = record.trace;
  return record.traceDigest === digest(metadata) && metadata?.stage === 'comparison'
    && metadata.correlation?.missionId === missionId;
}

function validEvent(stored, record, row) {
  const event = JSON.parse(stored.event_json);
  return event.stageId === record.trace.stageId && event.status === 'completed'
    && digest(event.correlation) === digest(record.trace.correlation)
    && event.details?.inputHash === row.input_hash
    && event.details?.resultDigest === record.digest
    && digest(event) === stored.event_hash;
}

module.exports = { read };
