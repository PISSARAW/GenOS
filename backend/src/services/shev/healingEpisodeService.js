'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { getResponsibility } = require('./responsibilityService');
const { evidenceRefs } = require('./runtimeGuard');
const { assertTransition, isTerminal } = require('./healingStateMachine');

function episodeId(projectId, observationId) {
  const hash = createHash('sha256').update(`${projectId}\0${observationId}`).digest('hex');
  return `shev_healing_${hash}`;
}

function validReason(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
}

async function sourceObservation(db, input) {
  return db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, input.observationId]);
}

async function openEpisode(db, input) {
  const observation = await sourceObservation(db, input);
  const responsibility = await getResponsibility(db, input.projectId);
  if (responsibility?.status !== 'active') throw new Error('SHEV responsibility is not active.');
  if (observation?.kind !== 'degradation' || observation.epistemic_status !== 'observed') {
    throw new Error('SHEV healing requires an observed degradation.');
  }
  const id = episodeId(input.projectId, input.observationId);
  const occurredAt = new Date().toISOString();
  return withTransaction(db, async () => {
    await db.run(`INSERT OR IGNORE INTO shev_healing_episodes
      (id, project_id, source_observation_id, mandate_version, current_phase, opened_at)
      VALUES (?, ?, ?, ?, 'lesion', ?)`, [id, input.projectId, input.observationId,
      responsibility.mandateVersion, occurredAt]);
    await db.run(`INSERT OR IGNORE INTO shev_healing_events
      (id, episode_id, sequence, from_phase, to_phase, reason, evidence_json, occurred_at)
      VALUES (?, ?, 1, NULL, 'lesion', 'degradation-observee', ?, ?)`,
    [`${id}:1`, id, observation.evidence_json, occurredAt]);
    return db.get('SELECT * FROM shev_healing_episodes WHERE id = ?', [id]);
  });
}

async function transitionEpisode(db, input) {
  if (!validReason(input?.reason) || !evidenceRefs(input?.evidenceRefs)) {
    throw new TypeError('SHEV healing transition requires a reason and evidence.');
  }
  return withTransaction(db, async () => {
    const episode = await db.get('SELECT * FROM shev_healing_episodes WHERE id = ?', [input.episodeId]);
    if (!episode) throw new Error('SHEV healing episode was not found.');
    assertTransition(episode.current_phase, input.toPhase);
    const sequence = (await db.get(`SELECT COALESCE(MAX(sequence), 0) + 1 AS value
      FROM shev_healing_events WHERE episode_id = ?`, [episode.id])).value;
    const occurredAt = new Date().toISOString();
    const closedAt = isTerminal(input.toPhase) ? occurredAt : null;
    const updated = await db.run(`UPDATE shev_healing_episodes
      SET current_phase = ?, closed_at = ? WHERE id = ? AND current_phase = ?`,
    [input.toPhase, closedAt, episode.id, episode.current_phase]);
    if (updated.changes !== 1) throw new Error('SHEV healing episode changed concurrently.');
    await db.run(`INSERT INTO shev_healing_events
      (id, episode_id, sequence, from_phase, to_phase, reason, evidence_json, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [`${episode.id}:${sequence}`, episode.id,
      sequence, episode.current_phase, input.toPhase, input.reason,
      JSON.stringify(input.evidenceRefs), occurredAt]);
    return db.get('SELECT * FROM shev_healing_episodes WHERE id = ?', [episode.id]);
  });
}

async function listEpisodeEvents(db, episodeIdValue) {
  return db.all(`SELECT * FROM shev_healing_events WHERE episode_id = ?
    ORDER BY sequence`, [episodeIdValue]);
}

module.exports = { episodeId, openEpisode, transitionEpisode, listEpisodeEvents };
