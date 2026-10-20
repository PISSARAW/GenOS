'use strict';

function result(status, reason, extra = {}) {
  return { status, ...(reason ? { reason } : {}), ...extra };
}

function sessionId(context = {}) {
  return context.sessionId || context.output?.sessionId
    || context.output?.metapopulationId || null;
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) { return null; }
}

async function locateSession(db, missionId, context) {
  const explicit = sessionId(context);
  if (explicit) return db.get('SELECT * FROM metapopulation_sessions WHERE id = ?', explicit);
  const rows = await db.all(`SELECT * FROM metapopulation_sessions
    WHERE mission_id = ? ORDER BY created_at, id`, missionId);
  if (rows.length !== 1) return result('partial', rows.length
    ? 'metapopulation_session_ambiguous' : 'metapopulation_session_missing');
  return rows[0];
}

function sessionIssue(row) {
  if (!row) return result('partial', 'metapopulation_session_missing');
  if (row.reason && ['partial', 'failed'].includes(row.status)) return row;
  return null;
}

function strictJsonRows(rows, fields, reason) {
  const parsed = [];
  for (const row of rows) {
    const item = { ...row };
    for (const field of fields) {
      item[field] = parseJson(row[field]);
      if (item[field] === null) return result('failed', reason);
    }
    parsed.push(item);
  }
  return { rows: parsed };
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function eventIssue(events, revision) {
  if (!events.length) return result('partial', 'metapopulation_event_journal_missing');
  if (events.length !== revision) return result('failed', 'metapopulation_event_journal_gap');
  const contiguous = events.every((event, index) =>
    Number(event.sequence) === index + 1 && Number(event.revision) === index + 1);
  return contiguous ? null : result('failed', 'metapopulation_event_journal_integrity_failed');
}

async function readEvents(db, id, revision) {
  const rows = await db.all(`SELECT sequence, revision, event_type, payload_json,
    provenance_json, actor FROM metapopulation_events
    WHERE metapopulation_id = ? ORDER BY sequence`, id);
  const parsed = strictJsonRows(rows, ['payload_json', 'provenance_json'],
    'metapopulation_event_journal_integrity_failed');
  if (!parsed.rows) return parsed;
  if (parsed.rows.some((row) => !objectValue(row.payload_json)
      || !objectValue(row.provenance_json))) {
    return result('failed', 'metapopulation_event_journal_integrity_failed');
  }
  const issue = eventIssue(parsed.rows, revision);
  return issue || result('read', null, { events: parsed.rows });
}

async function readDemes(db, id) {
  const rows = await db.all(`SELECT deme_id, patch_id, status, members_json,
    local_strategies_json, local_procedures_json, lineage_json, fitness_json
    FROM metapopulation_demes WHERE metapopulation_id = ? ORDER BY deme_id`, id);
  const parsed = strictJsonRows(rows, ['members_json', 'local_strategies_json',
    'local_procedures_json', 'lineage_json', 'fitness_json'],
  'metapopulation_deme_state_invalid');
  if (!parsed.rows) return parsed;
  const invalid = parsed.rows.some((row) => !Array.isArray(row.members_json)
    || !Array.isArray(row.local_strategies_json)
    || !Array.isArray(row.local_procedures_json) || !objectValue(row.lineage_json)
    || !objectValue(row.fitness_json));
  return invalid ? result('failed', 'metapopulation_deme_state_invalid') : parsed;
}

async function readMigrations(db, id) {
  const rows = await db.all(`SELECT migration_id, corridor_id, source_deme_id,
    target_deme_id, status, evidence_json, provenance_json
    FROM metapopulation_migrations WHERE metapopulation_id = ?
    ORDER BY created_at, migration_id`, id);
  const parsed = strictJsonRows(rows, ['evidence_json', 'provenance_json'],
    'metapopulation_migration_state_invalid');
  if (!parsed.rows) return parsed;
  const invalid = parsed.rows.some((row) => !objectValue(row.evidence_json)
    || !objectValue(row.provenance_json));
  return invalid ? result('failed', 'metapopulation_migration_state_invalid') : parsed;
}

async function readCycles(db, id) {
  const rows = await db.all(`SELECT state_id, cycle, observed_json, diagnosis_json,
    plan_json, execution_json, verification_json, status
    FROM metapopulation_cycle_states WHERE metapopulation_id = ?
    ORDER BY cycle, created_at, state_id`, id);
  const parsed = strictJsonRows(rows, ['observed_json', 'diagnosis_json', 'plan_json',
    'execution_json', 'verification_json'], 'metapopulation_cycle_state_invalid');
  if (!parsed.rows) return parsed;
  const fields = ['observed_json', 'diagnosis_json', 'plan_json',
    'execution_json', 'verification_json'];
  const invalid = parsed.rows.some((row) => fields.some((field) => !objectValue(row[field])));
  return invalid ? result('failed', 'metapopulation_cycle_state_invalid') : parsed;
}

async function readFitness(db, scope) {
  return db.all(`SELECT fitness_id, deme_id, mission_id, cycle, fitness_score,
    budget_used, budget_limit FROM mission_fitness
    WHERE metapopulation_id = ? AND mission_id = ? ORDER BY cycle, deme_id`,
  scope.sessionId, scope.missionId);
}

async function canonicalState(db, scope) {
  const events = await readEvents(db, scope.sessionId, scope.revision);
  if (events.status !== 'read') return events;
  const demes = await readDemes(db, scope.sessionId);
  if (!demes.rows) return demes;
  const migrations = await readMigrations(db, scope.sessionId);
  if (!migrations.rows) return migrations;
  const cycles = await readCycles(db, scope.sessionId);
  if (!cycles.rows) return cycles;
  const fitness = await readFitness(db, scope);
  return result('read', null, { events: events.events, demes: demes.rows,
    migrations: migrations.rows, cycles: cycles.rows, fitness });
}

async function read(input = {}) {
  if (!input.db || !input.missionId) {
    return result('partial', 'metapopulation_completion_scope_missing');
  }
  try {
    const row = await locateSession(input.db, input.missionId, input.context || {});
    const issue = sessionIssue(row);
    if (issue) return issue;
    if (row.mission_id !== input.missionId) {
      return result('failed', 'metapopulation_mission_scope_mismatch', { sessionId: row.id });
    }
    const state = await canonicalState(input.db, { sessionId: row.id,
      missionId: input.missionId, revision: Number(row.revision) });
    if (state.status !== 'read') return { ...state, sessionId: row.id };
    return { ...state, session: row, sessionId: row.id,
      revision: Number(row.revision) };
  } catch (_) {
    return result('partial', 'metapopulation_canonical_state_unavailable');
  }
}

module.exports = { read };
