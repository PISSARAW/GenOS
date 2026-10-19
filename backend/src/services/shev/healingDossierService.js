'use strict';

const { createHash } = require('node:crypto');

function parsed(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function eventView(row) {
  return { sequence: row.sequence, fromPhase: row.from_phase, toPhase: row.to_phase,
    reason: row.reason, evidenceRefs: parsed(row.evidence_json, []), occurredAt: row.occurred_at };
}

function assertContinuity(episode, events) {
  if (!events.length || events[0].sequence !== 1 || events[0].from_phase !== null) {
    throw new Error('SHEV healing dossier has an incomplete origin.');
  }
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].sequence !== index + 1 || events[index].from_phase !== events[index - 1].to_phase) {
      throw new Error('SHEV healing dossier chronology is inconsistent.');
    }
  }
  if (events.at(-1).to_phase !== episode.current_phase) {
    throw new Error('SHEV healing dossier projection is inconsistent.');
  }
}

async function loadContext(db, episode) {
  const observation = await db.get(`SELECT * FROM shev_observations
    WHERE project_id = ? AND id = ?`, [episode.project_id, episode.source_observation_id]);
  const initiative = await db.get(`SELECT * FROM shev_initiatives
    WHERE project_id = ? AND observation_id = ?`, [episode.project_id, episode.source_observation_id]);
  const task = initiative?.task_id && await db.get(`SELECT id, status, attempt FROM ontogenesis_backlog
    WHERE project_id = ? AND id = ?`, [episode.project_id, initiative.task_id]);
  const effect = initiative && await db.get('SELECT * FROM shev_effects WHERE initiative_id = ?', [initiative.id]);
  const monitoring = initiative && await db.all(`SELECT * FROM shev_monitoring
    WHERE initiative_id = ? ORDER BY assessed_at, id`, [initiative.id]);
  return { observation, initiative, task: task || null, effect: effect || null,
    monitoring: monitoring || [] };
}

function evidenceOf(events) {
  const refs = events.flatMap(row => parsed(row.evidence_json, []));
  return [...new Set(refs)].sort();
}

function projectContext(context) {
  return { sourceObservation: { id: context.observation.id, kind: context.observation.kind,
    observedAt: context.observation.observed_at, source: context.observation.source,
    evidenceRefs: parsed(context.observation.evidence_json, []) },
  initiative: context.initiative && { id: context.initiative.id, kind: context.initiative.kind,
    status: context.initiative.status, taskId: context.initiative.task_id },
  task: context.task,
  effect: context.effect && { result: context.effect.project_result,
    verifierRef: context.effect.verifier_ref, evidenceRefs: parsed(context.effect.evidence_json, []) },
  monitoring: context.monitoring.map(row => ({ id: row.id, result: row.result,
    verifierRef: row.verifier_ref, evidenceRefs: parsed(row.evidence_json, []), assessedAt: row.assessed_at })) };
}

async function getHealingDossier(db, input) {
  const episode = await db.get(`SELECT * FROM shev_healing_episodes
    WHERE id = ? AND project_id = ?`, [input.episodeId, input.projectId]);
  if (!episode) throw new Error('SHEV healing episode was not found in this project.');
  const events = await db.all(`SELECT * FROM shev_healing_events
    WHERE episode_id = ? ORDER BY sequence`, [episode.id]);
  assertContinuity(episode, events);
  const context = await loadContext(db, episode);
  const dossier = { schema: 'genos.shev-healing-dossier/v1', episodeId: episode.id,
    projectId: episode.project_id, mandateVersion: episode.mandate_version,
    phase: episode.current_phase, openedAt: episode.opened_at, closedAt: episode.closed_at,
    timeline: events.map(eventView), evidenceRefs: evidenceOf(events),
    context: projectContext(context), claims: {
      projectEffect: context.effect?.project_result || 'not_assessed',
      longitudinalOutcome: episode.current_phase,
      causalAttribution: 'not_claimed', fieldQualification: 'not_established'
    },
    protocol: { minimumConfirmedMonitoringWindows: 2, source: 'local-runtime-contract' } };
  return { ...dossier, digest: createHash('sha256').update(JSON.stringify(dossier)).digest('hex') };
}

module.exports = { getHealingDossier };
