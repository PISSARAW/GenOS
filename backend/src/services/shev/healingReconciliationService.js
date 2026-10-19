'use strict';

const { getResponsibility } = require('./responsibilityService');
const { openEpisode, transitionEpisode } = require('./healingEpisodeService');
const { isTerminal } = require('./healingStateMachine');

function parsedRefs(row) {
  try { return JSON.parse(row?.evidence_json || '[]'); } catch (_) { return []; }
}

function refs(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean))];
}

async function contextFor(db, episode) {
  const initiative = await db.get(`SELECT * FROM shev_initiatives
    WHERE project_id = ? AND observation_id = ?`, [episode.project_id, episode.source_observation_id]);
  const task = initiative?.task_id && await db.get(`SELECT * FROM ontogenesis_backlog
    WHERE project_id = ? AND id = ?`, [episode.project_id, initiative.task_id]);
  const effect = initiative && await db.get('SELECT * FROM shev_effects WHERE initiative_id = ?', [initiative.id]);
  const monitoring = initiative && await db.all(`SELECT * FROM shev_monitoring
    WHERE initiative_id = ? ORDER BY assessed_at, id`, [initiative.id]);
  return { initiative, task, effect, monitoring: monitoring || [] };
}

function lesionDecision(context) {
  if (!context.initiative) return null;
  return { toPhase: 'hemostasis', reason: 'perimetre-delegue-fige',
    evidenceRefs: [`shev:initiative:${context.initiative.id}`] };
}

function hemostasisDecision(context) {
  if (context.initiative?.status === 'rejected') return { toPhase: 'scarred',
    reason: 'abstention-conservee', evidenceRefs: [`shev:initiative:${context.initiative.id}`] };
  if (context.initiative?.status !== 'queued' || !context.task) return null;
  return { toPhase: 'inflammation', reason: 'diagnostic-admis-par-ontogenese',
    evidenceRefs: [`shev:initiative:${context.initiative.id}`, `ontogenesis:task:${context.task.id}`] };
}

function inflammationDecision(context) {
  if (!context.task) return null;
  if (context.task.attempt >= 3 && context.task.status !== 'done') return { toPhase: 'scarred',
    reason: 'tentatives-ontogenese-epuisees', evidenceRefs: [`ontogenesis:task:${context.task.id}`] };
  if (!['doing', 'done'].includes(context.task.status)) return null;
  return { toPhase: 'proliferation', reason: 'reparation-isolee-engagee',
    evidenceRefs: [`ontogenesis:task:${context.task.id}`] };
}

function proliferationDecision(context) {
  if (!context.effect || context.effect.project_result === 'inconclusive') return null;
  if (context.effect.project_result === 'regressed') return { toPhase: 'scarred',
    reason: 'effet-initial-refute', evidenceRefs: refs(`shev:effect:${context.initiative.id}`, parsedRefs(context.effect)) };
  return { toPhase: 'remodeling', reason: 'effet-initial-verifie',
    evidenceRefs: refs(`shev:effect:${context.initiative.id}`, parsedRefs(context.effect)) };
}

function remodelingDecision(context) {
  const regressed = context.monitoring.find(row => row.result === 'regressed');
  if (regressed) return { toPhase: 'relapsed', reason: 'regression-longitudinale-observee',
    evidenceRefs: refs(`shev:monitoring:${regressed.id}`, parsedRefs(regressed)) };
  const confirmed = context.monitoring.filter(row => row.result === 'confirmed');
  if (confirmed.length < 2) return null;
  return { toPhase: 'healed', reason: 'deux-fenetres-longitudinales-confirmees',
    evidenceRefs: refs(confirmed.map(row => `shev:monitoring:${row.id}`), confirmed.map(parsedRefs)) };
}

function decisionFor(episode, context) {
  const decisions = { lesion: lesionDecision, hemostasis: hemostasisDecision,
    inflammation: inflammationDecision, proliferation: proliferationDecision,
    remodeling: remodelingDecision };
  return decisions[episode.current_phase]?.(context) || null;
}

async function advanceEpisode(db, episode) {
  let current = episode;
  let transitions = 0;
  while (!isTerminal(current.current_phase) && transitions < 5) {
    const decision = decisionFor(current, await contextFor(db, current));
    if (!decision) break;
    current = await transitionEpisode(db, { episodeId: current.id, ...decision });
    transitions += 1;
  }
  return transitions;
}

async function openPending(db, input) {
  const responsibility = await getResponsibility(db, input.projectId);
  if (responsibility?.status !== 'active') return 0;
  const rows = await db.all(`SELECT o.id FROM shev_observations o
    JOIN shev_initiatives i ON i.project_id = o.project_id AND i.observation_id = o.id
    LEFT JOIN shev_healing_episodes h ON h.project_id = o.project_id
      AND h.source_observation_id = o.id
    WHERE o.project_id = ? AND o.kind = 'degradation' AND o.epistemic_status = 'observed'
      AND i.mandate_version = ? AND h.id IS NULL ORDER BY o.created_at, o.id LIMIT 20`,
  [input.projectId, responsibility.mandateVersion]);
  for (const row of rows) await openEpisode(db, { projectId: input.projectId, observationId: row.id });
  return rows.length;
}

async function reconcileProject(db, input) {
  const opened = await openPending(db, input);
  const episodes = await db.all(`SELECT * FROM shev_healing_episodes
    WHERE project_id = ? AND current_phase NOT IN ('healed', 'relapsed', 'scarred')
    ORDER BY opened_at, id LIMIT 20`, [input.projectId]);
  let transitioned = 0;
  for (const episode of episodes) transitioned += await advanceEpisode(db, episode);
  return { opened, transitioned };
}

module.exports = { decisionFor, reconcileProject };
