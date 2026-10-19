'use strict';

const { createHash } = require('node:crypto');
const { recordObservation } = require('../observationService');

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeRhythmConfig(config) {
  const valid = config && SAFE_ID.test(config.scheduleId)
    && Number.isSafeInteger(config.lookbackWindows) && config.lookbackWindows >= 2
    && config.lookbackWindows <= 100
    && Number.isSafeInteger(config.minimumObservedWindows) && config.minimumObservedWindows >= 1
    && config.minimumObservedWindows <= config.lookbackWindows
    && Number.isFinite(config.maxMissedRatio) && config.maxMissedRatio >= 0
    && config.maxMissedRatio <= 1
    && Number.isSafeInteger(config.maxObservationAgeMs) && config.maxObservationAgeMs >= 1000
    && config.maxObservationAgeMs <= 2592000000;
  if (!valid) throw new TypeError('SHEV project rhythm configuration is invalid.');
  return { scheduleId: config.scheduleId, lookbackWindows: config.lookbackWindows,
    minimumObservedWindows: config.minimumObservedWindows,
    maxMissedRatio: config.maxMissedRatio,
    maxObservationAgeMs: config.maxObservationAgeMs };
}

async function requireSchedule(db, input) {
  const row = await db.get(`SELECT project_id, kind, spec_json FROM ontogenesis_schedules
    WHERE id = ?`, [input.scheduleId]);
  let spec;
  try { spec = JSON.parse(row?.spec_json || '{}'); } catch (_) { spec = {}; }
  if (!row || row.project_id !== input.projectId || row.kind !== 'interval'
    || spec.policy !== 'chronotaxis') throw new Error('SHEV project rhythm requires a scoped chronotaxis schedule.');
}

async function recentWindows(db, config) {
  return db.all(`SELECT observation_id, window_index, observed_at, status, evidence_ref
    FROM morph_temporal_observations WHERE schedule_id = ?
    ORDER BY window_index DESC LIMIT ?`, [config.scheduleId, config.lookbackWindows]);
}

function insufficient(rows, config) {
  return rows.length < config.minimumObservedWindows;
}

function latestAt(rows) {
  return rows.reduce((latest, row) => Math.max(latest, Date.parse(row.observed_at)), 0);
}

function classify(rows, config, nowMs) {
  if (insufficient(rows, config)) return { kind: 'blind_spot', epistemicStatus: 'unknown',
    summary: `Le rythme du projet ne dispose que de ${rows.length} fenetre(s) sur ${config.minimumObservedWindows} requise(s).`,
    validUntil: null };
  const newest = latestAt(rows);
  if (!Number.isFinite(newest) || nowMs - newest > config.maxObservationAgeMs) {
    return { kind: 'blind_spot', epistemicStatus: 'stale',
      summary: 'Les observations du rythme du projet sont perimees.', validUntil: null };
  }
  const missed = rows.filter(row => row.status === 'MISSED').length;
  const ratio = missed / rows.length;
  const drifted = ratio > config.maxMissedRatio;
  return { kind: drifted ? 'degradation' : 'state', epistemicStatus: 'observed',
    summary: drifted
      ? `Derive chronobiologique observee: ${missed}/${rows.length} fenetres manquees.`
      : `Rythme observe dans le seuil: ${missed}/${rows.length} fenetres manquees.`,
    validUntil: new Date(newest + config.maxObservationAgeMs).toISOString() };
}

function evidenceFor(rows) {
  if (!rows.length) return [];
  const evidence = rows.map(row => [row.observation_id, row.window_index,
    row.observed_at, row.status, row.evidence_ref || null]);
  return [`chronotaxis:sha256:${digest(evidence)}`];
}

async function inspectProjectRhythm(db, input) {
  const config = normalizeRhythmConfig(input);
  if (!input.projectId || !input.dimension) throw new TypeError('SHEV project rhythm identity is invalid.');
  await requireSchedule(db, { projectId: input.projectId, scheduleId: config.scheduleId });
  const rows = await recentWindows(db, config);
  const nowMs = input.nowMs ?? Date.now();
  const classification = classify(rows, config, nowMs);
  const evidenceRefs = evidenceFor(rows);
  const fingerprint = digest([config, rows, classification]);
  const id = `project_rhythm_${digest([input.projectId, input.dimension,
    input.sampleRef || 'state', fingerprint])}`;
  const existing = await db.get(`SELECT observed_at FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, id]);
  if (existing) return { id, replayed: true, observedAt: existing.observed_at,
    evidenceRefs, ...classification };
  return recordObservation(db, { id, projectId: input.projectId,
    domain: 'project-chronobiology', dimension: input.dimension,
    source: `chronotaxis:${config.scheduleId}`, observedAt: new Date(nowMs).toISOString(),
    evidenceRefs, ...classification });
}

module.exports = { normalizeRhythmConfig, inspectProjectRhythm };
