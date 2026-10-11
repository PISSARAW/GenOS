'use strict';

const { digest } = require('./trinityExecutionJournal');

async function read(db, missionId) {
  const result = await readStage(db, missionId, 'comparison');
  return { status: result.status, inputHash: result.inputHash,
    comparison: result.status === 'verified' ? result.value : undefined };
}

async function readInitial(db, missionId) {
  const result = await readStage(db, missionId, 'initial_reports');
  return { status: result.status, inputHash: result.inputHash,
    reports: result.status === 'verified' ? result.value : undefined };
}

async function readStage(db, missionId, stage) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trinity_runtime_journal'");
  if (!table) return { status: 'missing' };
  const row = await db.get('SELECT input_hash, value_json FROM trinity_runtime_journal WHERE mission_id = ? AND stage = ?', missionId, stage);
  if (!row) return { status: 'missing' };
  try {
    const record = JSON.parse(row.value_json);
    const event = await storedEvent(db, { missionId, stageId: record.trace?.stageId, stage });
    if (!valid({ record, row, missionId, stage, event })) return { status: 'invalid' };
    return { status: 'verified', value: record.value, inputHash: row.input_hash };
  } catch (_) {
    return { status: 'invalid' };
  }
}

async function storedEvent(db, input) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trinity_trace_events'");
  if (!table || !input.stageId) return null;
  return db.get(`SELECT event_hash, event_json FROM trinity_trace_events
    WHERE mission_id = ? AND stage_id = ? AND stage = ? AND status = 'completed'`,
  input.missionId, input.stageId, input.stage);
}

function valid(input) {
  const { record, row, missionId, stage } = input;
  return validValue(record, stage) && validMetadata(record, missionId, stage)
    && validEvent(input.event, record, row);
}

function validValue(record, stage) {
  const value = record?.value;
  const shape = stage === 'initial_reports' ? Array.isArray(value)
    : typeof value?.outcome === 'string' && value.comparativeAnalysis
      && typeof value.comparativeAnalysis === 'object';
  return Boolean(shape) && record.digest === digest(value);
}

function validMetadata(record, missionId, stage) {
  const metadata = record.trace;
  return record.traceDigest === digest(metadata) && metadata?.stage === stage
    && metadata.correlation?.missionId === missionId;
}

function validEvent(stored, record, row) {
  const event = JSON.parse(stored.event_json);
  return event.stageId === record.trace.stageId && event.stage === record.trace.stage
    && event.status === 'completed'
    && digest(event.correlation) === digest(record.trace.correlation)
    && event.details?.inputHash === row.input_hash
    && event.details?.resultDigest === record.digest
    && digest(event) === stored.event_hash;
}

module.exports = { read, readInitial };
