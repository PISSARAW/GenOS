'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { comparable, assessment: validAssessment, requireActive } = require('./runtimeGuard');

async function dueWatches(db, nowMs = Date.now()) {
  return db.all(`SELECT * FROM shev_watches WHERE status = 'active' AND next_due_at <= ?
    ORDER BY next_due_at, initiative_id`, [new Date(nowMs).toISOString()]);
}

async function monitoringContext(db, input) {
  const effect = await db.get(`SELECT e.*, i.project_id, i.observation_id, i.mandate_version
    FROM shev_effects e JOIN shev_initiatives i ON i.id = e.initiative_id
    WHERE e.initiative_id = ? AND i.project_id = ?`, [input.initiativeId, input.projectId]);
  const after = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, input.observationId]);
  const baseline = effect && await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, effect.post_observation_id]);
  if (!effect || !comparable(after, baseline)) throw new Error('SHEV monitoring observation is missing or incomparable.');
  return { effect, baseline, after };
}

async function monitorProjectEffect(db, input) {
  if (typeof input?.verify !== 'function') throw new TypeError('SHEV monitoring requires a verifier.');
  const context = await monitoringContext(db, input);
  const id = `shev_monitor_${createHash('sha256').update(`${input.initiativeId}\0${input.observationId}`).digest('hex')}`;
  const existing = await db.get('SELECT * FROM shev_monitoring WHERE id = ?', [id]);
  if (existing) return { ...existing, replayed: true };
  await requireActive(db, { projectId: input.projectId, expectedVersion: context.effect.mandate_version });
  const assessment = await input.verify(context);
  if (!validAssessment(assessment)) throw new Error('SHEV monitoring verifier lacks evidence.');
  return withTransaction(db, async () => {
    await requireActive(db, { projectId: input.projectId, expectedVersion: context.effect.mandate_version });
    await requireLaterObservation(db, input);
    const inserted = await db.run(`INSERT OR IGNORE INTO shev_monitoring
      (id, initiative_id, observation_id, result, verifier_ref, evidence_json, assessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, input.initiativeId, input.observationId,
      assessment.result, assessment.verifierRef, JSON.stringify(assessment.evidenceRefs), new Date().toISOString()]);
    if (inserted.changes === 1) await updateWatch(db, input.initiativeId, assessment.result);
    return { ...await db.get('SELECT * FROM shev_monitoring WHERE id = ?', [id]), replayed: inserted.changes === 0 };
  });
}

async function requireLaterObservation(db, input) {
  const previous = await db.get(`SELECT o.observed_at FROM shev_monitoring m
    JOIN shev_observations o ON o.id = m.observation_id AND o.project_id = ?
    WHERE m.initiative_id = ? ORDER BY o.observed_at DESC LIMIT 1`, [input.projectId, input.initiativeId]);
  const after = await db.get('SELECT observed_at FROM shev_observations WHERE project_id = ? AND id = ?', [input.projectId, input.observationId]);
  if (previous && Date.parse(after.observed_at) <= Date.parse(previous.observed_at)) throw new Error('SHEV monitoring cannot replace a newer observation.');
}

async function updateWatch(db, initiativeId, result) {
  const watch = await db.get('SELECT interval_ms FROM shev_watches WHERE initiative_id = ?', [initiativeId]);
  if (!watch) throw new Error('SHEV monitoring watch is absent.');
  await db.run(`UPDATE shev_watches SET status = ?, next_due_at = ? WHERE initiative_id = ?`,
  [result === 'regressed' ? 'alert' : 'active', new Date(Date.now() + watch.interval_ms).toISOString(), initiativeId]);
}

module.exports = { dueWatches, monitorProjectEffect, ...require('./recoveryService') };
