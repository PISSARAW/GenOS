'use strict';
const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const values = require('./trinityProvenanceValues');
const ready = new WeakMap();
const STATUSES = ['started', 'failed', 'completed', 'replayed', 'observed'];

function initialize(db) {
  if (!ready.has(db)) {
    const pending = schema(db).catch(error => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  return ready.get(db);
}

async function schema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS trinity_trace_events (
    mission_id TEXT NOT NULL, mission_seq INTEGER NOT NULL, world_key TEXT NOT NULL,
    world_seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL,
    stage_id TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL,
    request_hash TEXT NOT NULL, previous_hash TEXT, event_hash TEXT NOT NULL,
    event_json TEXT NOT NULL, PRIMARY KEY(mission_id, mission_seq),
    UNIQUE(mission_id, world_key, world_seq));
    CREATE TRIGGER IF NOT EXISTS trinity_trace_no_update BEFORE UPDATE ON trinity_trace_events
      BEGIN SELECT RAISE(ABORT, 'TRINITY_TRACE_APPEND_ONLY'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_trace_no_delete BEFORE DELETE ON trinity_trace_events
      BEGIN SELECT RAISE(ABORT, 'TRINITY_TRACE_APPEND_ONLY'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_trace_no_replace BEFORE INSERT ON trinity_trace_events
      WHEN EXISTS(SELECT 1 FROM trinity_trace_events WHERE event_id=NEW.event_id
        OR (mission_id=NEW.mission_id AND mission_seq=NEW.mission_seq)
        OR (mission_id=NEW.mission_id AND world_key=NEW.world_key AND world_seq=NEW.world_seq))
      BEGIN SELECT RAISE(ABORT, 'TRINITY_TRACE_APPEND_ONLY'); END;`);
}

function request(input) {
  validateStage(input);
  const details = input.details ?? input.payload ?? {};
  values.assertPublic(details);
  const result = { correlation: values.correlation(input.correlation ?? input), stage: input.stage,
    stageId: input.stageId ?? input.stage, status: input.status, details: values.clone(details),
    timestamp: input.timestamp === undefined ? null : values.utc(input.timestamp) };
  if (typeof result.stageId !== 'string' || !result.stageId) throw values.failure('TRINITY_TRACE_INVALID_STAGE');
  return result;
}

function validateStage(input) {
  if (typeof input.stage !== 'string' || !input.stage || !STATUSES.includes(input.status)) {
    throw values.failure('TRINITY_TRACE_INVALID_STAGE');
  }
}

function decode(row) {
  const event = JSON.parse(row.event_json);
  if (values.digest(event) !== row.event_hash) throw values.failure('TRINITY_TRACE_CORRUPT');
  validateColumns(row, event);
  return { ...event, hash: row.event_hash };
}

function validateColumns(row, event) {
  const expected = [event.eventId, event.correlation.missionId, event.correlation.runId,
    event.missionSeq, event.worldSeq, event.correlation.worldId ?? '@mission', event.stageId,
    event.stage, event.status, event.requestHash, event.previousHash];
  const actual = [row.event_id, row.mission_id, row.run_id, row.mission_seq, row.world_seq,
    row.world_key, row.stage_id, row.stage, row.status, row.request_hash, row.previous_hash];
  if (values.encode(expected) !== values.encode(actual)) throw values.failure('TRINITY_TRACE_CORRUPT');
}

async function stageEvents(db, input) {
  const key = input.correlation;
  const rows = await db.all(`SELECT * FROM trinity_trace_events
    WHERE mission_id=? AND world_key=? AND run_id=? AND stage_id=? ORDER BY mission_seq`,
  [key.missionId, key.worldId ?? '@mission', key.runId, input.stageId]);
  return rows.map(decode);
}

async function lifecycle(db, input) {
  if (input.status === 'observed') return;
  const events = await stageEvents(db, input);
  if (events.some(event => values.encode(event.correlation) !== values.encode(input.correlation))) {
    throw values.failure('TRINITY_TRACE_CORRELATION_CHANGED');
  }
  if (events.some(event => event.stage !== input.stage)) throw values.failure('TRINITY_TRACE_STAGE_CHANGED');
  if (input.status === 'started') return requireFresh(events);
  const terminal = events.find(event => ['completed', 'failed'].includes(event.status));
  if (input.status === 'replayed') return requireReplay(terminal, input);
  if (!events.some(event => event.status === 'started') || terminal) {
    throw values.failure('TRINITY_TRACE_INVALID_TRANSITION');
  }
}

function requireFresh(events) {
  if (events.length) throw values.failure('TRINITY_TRACE_STAGE_ALREADY_STARTED');
}

function requireReplay(terminal, input) {
  if (!terminal || input.details.replayedEventId !== terminal.eventId) {
    throw values.failure('TRINITY_TRACE_INVALID_REPLAY');
  }
}

async function append(db, input) {
  const normalized = request(input);
  await initialize(db);
  return withTransaction(db, () => appendTransaction(db, { normalized, eventId: input.eventId }));
}

async function appendTransaction(db, input) {
  const requestHash = values.digest(input.normalized);
  const eventId = input.eventId ?? crypto.randomUUID();
  const existing = await db.get('SELECT * FROM trinity_trace_events WHERE event_id=?', eventId);
  if (existing) return replayExisting(existing, requestHash);
  await lifecycle(db, input.normalized);
  const event = await nextEvent(db, { ...input.normalized, eventId, requestHash });
  if (Buffer.byteLength(values.encode(event)) > 2 * 1024 * 1024) throw values.failure('TRINITY_TRACE_EVENT_TOO_LARGE');
  const hash = values.digest(event);
  await db.run(`INSERT INTO trinity_trace_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.correlation.missionId, event.missionSeq, event.correlation.worldId ?? '@mission', event.worldSeq,
      event.eventId, event.correlation.runId, event.stageId, event.stage, event.status,
      requestHash, event.previousHash, hash, values.encode(event)]);
  return { ...event, hash };
}

function replayExisting(row, requestHash) {
  if (row.request_hash !== requestHash) throw values.failure('TRINITY_TRACE_REPLAY_CHANGED');
  return { ...decode(row), idempotentReplay: true };
}

async function nextEvent(db, input) {
  const key = input.correlation;
  const last = await db.get('SELECT * FROM trinity_trace_events WHERE mission_id=? ORDER BY mission_seq DESC LIMIT 1', key.missionId);
  const world = await db.get('SELECT MAX(world_seq) AS seq FROM trinity_trace_events WHERE mission_id=? AND world_key=?',
    key.missionId, key.worldId ?? '@mission');
  if (last) decode(last);
  return { schema: 'genos.trinity-trace/v1', ...input, timestamp: {
    value: values.utc(input.timestamp ?? undefined), qualification: 'event-recorded', clock: 'emitter-utc' },
    missionSeq: (last?.mission_seq ?? 0) + 1, worldSeq: (world?.seq ?? 0) + 1,
    previousHash: last?.event_hash ?? null };
}

async function read(db, filter) {
  await initialize(db);
  const rows = await db.all('SELECT * FROM trinity_trace_events WHERE mission_id=? ORDER BY mission_seq', filter.missionId);
  const events = verifyChain(rows);
  return events.filter(event => matches(event, filter));
}

function verifyChain(rows) {
  let previousHash = null;
  let seq = 0;
  const worlds = new Map();
  return rows.map(row => {
    const event = decode(row);
    const worldSeq = (worlds.get(row.world_key) ?? 0) + 1;
    if (event.previousHash !== previousHash || event.missionSeq !== ++seq || event.worldSeq !== worldSeq) {
      throw values.failure('TRINITY_TRACE_CHAIN_CORRUPT');
    }
    worlds.set(row.world_key, worldSeq);
    previousHash = event.hash;
    return event;
  });
}

function matches(event, filter) {
  const fields = ['runId', 'worldId', 'workerId', 'experimentId'];
  const correlated = fields.every(key => filter[key] === undefined || event.correlation[key] === filter[key]);
  return correlated && (filter.cutoff === undefined || event.missionSeq <= filter.cutoff);
}

async function observe(db, input) {
  await initialize(db);
  const normalized = request({ ...input, status: 'observed' });
  return withTransaction(db, async () => {
    const existing = await db.get('SELECT * FROM trinity_trace_events WHERE event_id=?', input.eventId ?? null);
    if (existing) {
      normalized.details.cutoff = decode(existing).details.cutoff;
      return appendTransaction(db, { normalized, eventId: input.eventId });
    }
    const row = await db.get('SELECT MAX(mission_seq) AS seq FROM trinity_trace_events WHERE mission_id=?', normalized.correlation.missionId);
    normalized.details.cutoff = { missionSeq: row?.seq ?? 0, qualification: 'before-observation' };
    return appendTransaction(db, { normalized, eventId: input.eventId });
  });
}

async function executeStage(context, stage, execute) {
  const input = { correlation: values.correlation(context.correlation ?? context), stage,
    stageId: context.stageId ?? stage, status: 'started', details: { inputHash: values.digest(context.configuration ?? {}) } };
  await initialize(context.db);
  const previous = await stageEvents(context.db, input);
  if (previous.length) return replayStage(context, input, previous);
  await append(context.db, input);
  return performStage(context.db, input, execute);
}

async function replayStage(context, input, previous) {
  const started = previous.find(event => event.status === 'started');
  if (!started || values.encode(started.correlation) !== values.encode(input.correlation)
    || started.details.inputHash !== input.details.inputHash) throw values.failure('TRINITY_TRACE_REPLAY_CHANGED');
  const terminal = previous.find(event => ['completed', 'failed'].includes(event.status));
  if (!terminal) throw values.failure('TRINITY_TRACE_INCOMPLETE_STAGE');
  await append(context.db, { ...input, status: 'replayed', details: { replayedEventId: terminal.eventId } });
  if (terminal.status === 'failed') throw values.failure(terminal.details.errorCode);
  return values.clone(terminal.details.result);
}

async function performStage(db, input, execute) {
  let result;
  try { result = await execute(); }
  catch (error) {
    await append(db, { ...input, status: 'failed', details: { errorCode: errorCode(error) } });
    throw error;
  }
  await append(db, { ...input, status: 'completed', details: { result } });
  return result;
}

function errorCode(error) {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : 'TRINITY_STAGE_EXECUTION_FAILED';
}

module.exports = { initialize, append, read, observe, executeStage,
  captureDatabase: require('./trinityTraceSnapshot').captureDatabase };
