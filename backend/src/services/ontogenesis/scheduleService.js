'use strict';

const crypto = require('crypto');
const chronotaxis = require('../morphogenesis/capabilities/chronotaxis');

/**
 * Échéances et intervalles de l'Ontogenèse (roadmap §P1).
 * Persistés en UTC ; le runner les convertit en événements.
 * Arrêt fin : pause de schedule, blocage de tâche en cours.
 */

const KINDS = ['interval', 'once', 'deadline'];

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function scheduleSpec(input, nowMs) {
  if (input.kind === 'interval' && input.spec?.policy === 'chronotaxis') {
    return { ...input.spec, anchorMs: input.spec.anchorMs ?? nowMs, index: input.spec.index ?? 0 };
  }
  return input.spec || {};
}

function nextRunAfter(kind, spec, fromMs) {
  if (kind === 'interval' && spec?.policy === 'chronotaxis') {
    return chronotaxis.nextObservation(spec, fromMs).scheduledAt;
  }
  if (kind === 'interval') {
    const every = Number((spec && spec.everyMinutes) || 0);
    if (!(every > 0)) throw new Error('intervalle-invalide');
    return new Date(fromMs + every * 60000).toISOString();
  }
  const at = Date.parse((spec && spec.at) || '');
  if (Number.isNaN(at)) throw new Error('echeance-invalide');
  return new Date(at).toISOString();
}

async function createSchedule(db, input) {
  if (!KINDS.includes(input.kind)) throw new Error('schedule-kind-inconnu');
  validateProbeContract(input);
  const nowMs = input.nowMs ?? Date.now();
  const id = input.id || newId('sched');
  const spec = scheduleSpec(input, nowMs);
  const next = nextRunAfter(input.kind, spec, nowMs);
  if (spec.policy === 'chronotaxis') spec.index = chronotaxis.nextObservation(spec, nowMs).index;
  await db.run(
    `INSERT INTO ontogenesis_schedules
       (id, project_id, kind, spec_json, timezone, next_run_at, status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, input.projectId, input.kind, JSON.stringify(spec),
      input.timezone || 'UTC', next, JSON.stringify(input.payload || {})]
  );
  return id;
}

async function dueSchedules(db, input) {
  const now = input.nowIso || new Date().toISOString();
  if (input.projectId) {
    return db.all(
      `SELECT * FROM ontogenesis_schedules
       WHERE project_id = ? AND status = 'active' AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
      [input.projectId, now]
    );
  }
  return db.all(
    `SELECT * FROM ontogenesis_schedules
     WHERE status = 'active' AND next_run_at <= ?
     ORDER BY next_run_at ASC`,
    [now]
  );
}

function parseSpec(row) {
  try {
    return JSON.parse(row.spec_json || '{}');
  } catch (_) {
    return {};
  }
}

async function markScheduleRan(db, input) {
  const row = await db.get('SELECT * FROM ontogenesis_schedules WHERE id = ?', [input.id]);
  if (!row) throw new Error('schedule-introuvable');
  if (row.kind === 'interval' && parseSpec(row).policy === 'chronotaxis') {
    const spec = parseSpec(row);
    const fired = { index: spec.index };
    const nowMs = input.nowMs ?? Date.now();
    const binCounts = await temporalBinCounts(db, row.id, spec);
    const nextSpec = { ...spec, index: fired.index + 1, lastObservedMs: nowMs, binCounts };
    const nextObservation = chronotaxis.nextObservation(nextSpec, nowMs);
    nextSpec.index = nextObservation.index;
    const next = nextObservation.scheduledAt;
    await db.run(`UPDATE ontogenesis_schedules
      SET spec_json = ?, next_run_at = ?, last_run_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(nextSpec), next, row.id]);
    return { id: row.id, status: 'active', nextRunAt: next, firedWindowIndex: fired.index };
  }
  if (row.kind === 'interval') {
    const next = nextRunAfter(row.kind, parseSpec(row), input.nowMs || Date.now());
    await db.run(`UPDATE ontogenesis_schedules SET next_run_at = ?, last_run_at = datetime('now') WHERE id = ?`, [next, row.id]);
    return { id: row.id, status: 'active', nextRunAt: next };
  }
  await db.run(`UPDATE ontogenesis_schedules SET status = 'done', last_run_at = datetime('now') WHERE id = ?`, [row.id]);
  return { id: row.id, status: 'done' };
}

async function recordTemporalObservation(db, input) {
  requireTemporalInput(input);
  const observedAt = input.observedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('Invalid observation time');
  const spec = await chronotaxisSpec(db, input.scheduleId);
  await validateTemporalEvidence(input, observedAt, spec);
  await db.run(`INSERT INTO morph_temporal_observations
    (observation_id, schedule_id, window_index, observed_at, status, evidence_ref)
    VALUES (?, ?, ?, ?, ?, ?)`, [input.observationId, input.scheduleId, input.windowIndex,
    observedAt, input.status, input.evidenceRef || null]);
  return { observationId: input.observationId, status: input.status };
}

function requireTemporalInput(input) {
  if (!input?.observationId || !input.scheduleId || !Number.isInteger(input.windowIndex)
    || !['OBSERVED', 'MISSED'].includes(input.status)) throw new Error('Invalid temporal observation');
}

async function chronotaxisSpec(db, scheduleId) {
  const row = await db.get('SELECT kind, spec_json FROM ontogenesis_schedules WHERE id = ?', [scheduleId]);
  if (!row || row.kind !== 'interval' || parseSpec(row).policy !== 'chronotaxis') {
    throw new Error('Chronotaxis schedule required');
  }
  return parseSpec(row);
}

async function validateTemporalEvidence(input, observedAt, spec) {
  const { startMs, endMs } = chronotaxis.windowBounds(spec, input.windowIndex);
  const eventMs = Date.parse(observedAt);
  if (input.status === 'MISSED') {
    if (input.evidenceRef || eventMs < Math.min(endMs, startMs + (spec.maximumLatencyMs ?? spec.periodMs))) throw new Error('Missed window requires elapsed window without evidence');
    return;
  }
  if (eventMs < startMs || eventMs >= endMs || !input.evidenceRef
    || typeof input.resolveArtifact !== 'function' || !await input.resolveArtifact(input.evidenceRef)) {
    throw new Error('Observed window requires resolvable in-window evidence');
  }
}

async function temporalCoverage(db, input) {
  const row = await db.get('SELECT spec_json FROM ontogenesis_schedules WHERE id = ?', [input.scheduleId]);
  if (!row) throw new Error('schedule-introuvable');
  const spec = JSON.parse(row.spec_json);
  const observations = await usableTemporalObservations(db, input);
  const coverage = chronotaxis.coverage(observations.map((item) => ({ status: item.status, observedAt: item.observed_at })),
    { periodMs: spec.periodMs, anchorMs: spec.anchorMs, bins: input.bins || 12 });
  const ranges = await missedRangeCount(db, input.scheduleId);
  return { ...coverage, missedWindows: observations.filter((item) => item.status === 'MISSED').length + ranges };
}

async function pauseSchedule(db, scheduleId) {
  await db.run(`UPDATE ontogenesis_schedules SET status = 'paused' WHERE id = ?`, [scheduleId]);
}

async function usableTemporalObservations(db, input) {
  const rows = await db.all('SELECT * FROM morph_temporal_observations WHERE schedule_id = ?', [input.scheduleId]);
  if (!input.resolveArtifact) return rows;
  const active = [];
  for (const row of rows) {
    if (row.status === 'MISSED' || await input.resolveArtifact(row.evidence_ref)) active.push(row);
  }
  return active;
}

async function temporalBinCounts(db, scheduleId, spec) {
  const bins = spec.bins ?? 12;
  if (!Number.isInteger(bins) || bins < 2 || bins > 512) throw new Error('Invalid temporal bins');
  const counts = Array(bins).fill(0);
  const rows = await db.all("SELECT observed_at FROM morph_temporal_observations WHERE schedule_id = ? AND status = 'OBSERVED'", [scheduleId]);
  for (const row of rows) {
    const delta = Date.parse(row.observed_at) - spec.anchorMs;
    const value = ((delta % spec.periodMs) + spec.periodMs) % spec.periodMs;
    counts[Math.floor(value / spec.periodMs * bins)]++;
  }
  return counts;
}

async function stopTask(db, input) {
  const row = await db.get('SELECT * FROM ontogenesis_backlog WHERE id = ?', [input.taskId]);
  if (!row) throw new Error('tache-introuvable');
  if (row.status !== 'doing') return { taskId: row.id, stopped: false, status: row.status };
  await db.run(`UPDATE ontogenesis_backlog SET status = 'blocked', updated_at = datetime('now') WHERE id = ?`, [row.id]);
  return { taskId: row.id, stopped: true, status: 'blocked', reason: input.reason || '' };
}

module.exports = { KINDS, nextRunAfter, createSchedule, dueSchedules, markScheduleRan,
  recordTemporalObservation, temporalCoverage, pauseSchedule, stopTask };

async function missedRangeCount(db, scheduleId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name = 'morph_temporal_missed_ranges'");
  if (!table) return 0;
  const row = await db.get('SELECT COALESCE(SUM(last_window - first_window + 1), 0) AS n FROM morph_temporal_missed_ranges WHERE schedule_id = ?', [scheduleId]);
  return row.n;
}
function validateProbeContract(input) {
  if (input.spec?.policy !== 'chronotaxis') return;
  const probeId = input.payload?.probeId;
  if (probeId && !require('../morphogenesis/capabilities/residentProbeRuntime').PROBE_IDS.includes(probeId)) {
    throw new Error('REGISTERED_READ_ONLY_PROBE_REQUIRED');
  }
}
