'use strict';

const { withTransaction } = require('../../../db');
const artifacts = require('./runtimeArtifacts');
const chronotaxis = require('./chronotaxis');
const schedules = require('../../ontogenesis/scheduleService');

const PROBES = Object.freeze({
  'database-health': async (db) => ({ healthy: (await db.get('SELECT 1 AS ok')).ok === 1 }),
  'project-backlog': async (db, projectId) => db.all(`SELECT status, COUNT(*) AS count
    FROM ontogenesis_backlog WHERE project_id = ? GROUP BY status`, [projectId]),
  'resident-agents': async (db) => db.all('SELECT status, COUNT(*) AS count FROM agents GROUP BY status')
});

function contract(row) {
  const spec = JSON.parse(row.spec_json);
  const payload = JSON.parse(row.payload_json || '{}');
  if (!PROBES[payload.probeId]) throw new Error('REGISTERED_READ_ONLY_PROBE_REQUIRED');
  return { spec, probeId: payload.probeId, environmentId: payload.environmentId || row.project_id,
    hostId: payload.hostId || row.project_id, scopeId: `PROJECT:${row.project_id}` };
}

async function dispatch(db, input) {
  return withTransaction(db, async (tx) => {
    const row = await tx.get("SELECT * FROM ontogenesis_schedules WHERE id = ? AND status = 'active'", [input.row.id]);
    if (!row || row.next_run_at !== input.row.next_run_at) return { skipped: true };
    let config;
    try { config = contract(row); }
    catch (error) { return pauseInvalid(tx, { row, error }); }
    const window = chronotaxis.windowBounds(config.spec, config.spec.index);
    if (input.nowMs < Date.parse(row.next_run_at)) return { skipped: true };
    const prior = await tx.get('SELECT observation_id FROM morph_temporal_observations WHERE schedule_id = ? AND window_index = ?', [row.id, config.spec.index]);
    if (prior) return { skipped: true };
    const deadlineMs = Math.min(window.endMs - 1, window.startMs + (config.spec.maximumLatencyMs ?? config.spec.periodMs));
    if (input.nowMs <= deadlineMs && await tooClose(tx, { config, nowMs: input.nowMs })) return { deferred: true };
    const receipt = input.nowMs > deadlineMs
      ? await missed(tx, { row, config, nowMs: input.nowMs })
      : await guardedObservation(tx, { row, config, nowMs: input.nowMs });
    await schedules.markScheduleRan(tx, { id: row.id, nowMs: input.nowMs });
    return receipt;
  });
}

async function missed(db, input) {
  const elapsed = Math.floor((input.nowMs - input.config.spec.anchorMs) / input.config.spec.periodMs) - 1;
  const firstWindow = input.config.spec.index + 1;
  if (elapsed >= firstWindow) await db.run('INSERT INTO morph_temporal_missed_ranges (schedule_id, first_window, last_window) VALUES (?, ?, ?)', [input.row.id, firstWindow, elapsed]);
  return schedules.recordTemporalObservation(db, {
    observationId: `${input.row.id}:${input.config.spec.index}`, scheduleId: input.row.id,
    windowIndex: input.config.spec.index, status: 'MISSED', observedAt: new Date(input.nowMs).toISOString()
  });
}

async function observe(db, input) {
  const { config, row } = input;
  const observedAt = new Date(input.nowMs).toISOString();
  const content = { scheduleId: row.id, windowIndex: config.spec.index, observedAt,
    probeId: config.probeId, hostId: config.hostId, environmentId: config.environmentId,
    result: await PROBES[config.probeId](db, row.project_id) };
  const evidenceRef = await artifacts.put(db, { scopeId: config.scopeId, kind: 'resident-observation', content });
  return schedules.recordTemporalObservation(db, { observationId: `${row.id}:${config.spec.index}`,
    scheduleId: row.id, windowIndex: config.spec.index, status: 'OBSERVED', observedAt, evidenceRef,
    resolveArtifact: artifacts.resolver(db, config.scopeId) });
}

async function aggregate(db, input) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1000) throw new Error('BOUNDED_OBSERVATION_AGGREGATION_REQUIRED');
  const rows = await db.all(`SELECT artifact_ref FROM morph_capability_artifacts
    WHERE scope_id = ? AND kind = 'resident-observation' AND created_at >= ?
    ORDER BY created_at, artifact_ref LIMIT ?`, [input.scopeId, input.since, input.limit]);
  const observations = [];
  for (const row of rows) observations.push(await artifacts.get(db, { scopeId: input.scopeId, ref: row.artifact_ref }));
  return { observations: observations.filter(Boolean), limit: input.limit };
}

module.exports = { dispatch, aggregate, PROBE_IDS: Object.keys(PROBES) };

async function tooClose(db, input) {
  const previous = await db.get(`SELECT content_json FROM morph_capability_artifacts
    WHERE scope_id = ? AND kind = 'resident-observation' AND json_extract(content_json, '$.hostId') = ?
    ORDER BY json_extract(content_json, '$.observedAt') DESC LIMIT 1`, [input.config.scopeId, input.config.hostId]);
  if (!previous) return false;
  const observedMs = Date.parse(JSON.parse(previous.content_json).observedAt);
  return input.nowMs - observedMs < input.config.spec.minimumSpacingMs;
}
async function guardedObservation(db, input) {
  try { return await observe(db, input); }
  catch (error) {
    const artifactRef = await artifacts.put(db, { scopeId: input.config.scopeId, kind: 'resident-probe-error', content: {
      scheduleId: input.row.id, windowIndex: input.config.spec.index, error: error.message,
      observedAt: new Date(input.nowMs).toISOString(), hostId: input.config.hostId
    } });
    return { status: 'FAILED', artifactRef };
  }
}
async function pauseInvalid(db, input) {
  const artifactRef = await artifacts.put(db, { scopeId: `PROJECT:${input.row.project_id}`,
    kind: 'resident-probe-error', content: { scheduleId: input.row.id, error: input.error.message } });
  await schedules.pauseSchedule(db, input.row.id);
  return { status: 'FAILED', paused: true, artifactRef };
}
