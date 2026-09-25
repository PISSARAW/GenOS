'use strict';

// Episode persistence: `AutobiographicalEpisode` records (situation, decision,
// action, outcome, lesson) plus temporal forgetting. We keep the causal
// structure (kind, salience, lesson summary) and let raw detail decay: old,
// low-salience episodes are marked forgotten rather than hoarded forever.

const crypto = require('crypto');
const { getDatabase } = require('../../db');

const DEFAULT_FORGET_AFTER_DAYS = 90;
const DEFAULT_FORGET_SALIENCE_CEILING = 0.5;

function toJson(value, fallback) {
  try {
    return JSON.stringify(value === undefined ? fallback : value);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToEpisode(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    missionId: row.mission_id,
    kind: row.kind,
    salience: row.salience,
    situation: parseJson(row.situation_json, {}),
    decision: parseJson(row.decision_json, {}),
    action: parseJson(row.action_json, {}),
    outcome: parseJson(row.outcome_json, {}),
    lesson: parseJson(row.lesson_json, {}),
    isForgotten: Boolean(row.is_forgotten),
    createdAt: row.created_at
  };
}

function episodeToRow(episode, id, createdAt) {
  return {
    id,
    agent_id: episode.agentId || 'orchestrator',
    mission_id: episode.missionId || null,
    kind: episode.kind || 'event',
    salience: Number(episode.salience) || 0,
    situation_json: toJson(episode.situation, {}),
    decision_json: toJson(episode.decision, {}),
    action_json: toJson(episode.action, {}),
    outcome_json: toJson(episode.outcome, {}),
    lesson_json: toJson(episode.lesson, {}),
    is_forgotten: 0,
    created_at: createdAt
  };
}

async function recordEpisode(episode = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const id = episode.id || `episode_${crypto.randomUUID()}`;
  const createdAt = episode.timestamp || new Date().toISOString();
  const row = episodeToRow(episode, id, createdAt);
  await db.run(
    `INSERT INTO autobiographical_episodes (
      id, agent_id, mission_id, kind, salience,
      situation_json, decision_json, action_json, outcome_json, lesson_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.agent_id, row.mission_id, row.kind, row.salience,
    row.situation_json, row.decision_json, row.action_json, row.outcome_json, row.lesson_json, row.created_at
  );
  return rowToEpisode(row);
}

function buildRecentQuery(options) {
  const clauses = ['is_forgotten = 0'];
  const params = [];
  if (options.agentId) { clauses.push('agent_id = ?'); params.push(options.agentId); }
  if (options.missionId) { clauses.push('mission_id = ?'); params.push(options.missionId); }
  if (options.kind) { clauses.push('kind = ?'); params.push(options.kind); }
  if (Number.isFinite(options.minSalience)) { clauses.push('salience >= ?'); params.push(options.minSalience); }
  return { where: clauses.join(' AND '), params };
}

async function getRecentEpisodes(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const { where, params } = buildRecentQuery(options);
  const limit = Math.max(1, Number(options.limit) || 20);
  const rows = await db.all(
    `SELECT * FROM autobiographical_episodes WHERE ${where} ORDER BY salience DESC, created_at DESC LIMIT ?`,
    ...params, limit
  );
  return rows.map(rowToEpisode);
}

async function getEpisodeById(id, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const row = await db.get('SELECT * FROM autobiographical_episodes WHERE id = ?', id);
  return rowToEpisode(row);
}

function forgetCutoffIso(afterDays) {
  return new Date(Date.now() - afterDays * 24 * 3600 * 1000).toISOString();
}

// Compression, not deletion: rows are kept (audit trail) but flagged
// forgotten so recall/lesson-extraction stop surfacing their raw detail.
async function forgetStaleEpisodes(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const afterDays = Number(options.afterDays) || DEFAULT_FORGET_AFTER_DAYS;
  const salienceCeiling = Number.isFinite(options.salienceCeiling) ? options.salienceCeiling : DEFAULT_FORGET_SALIENCE_CEILING;
  const cutoff = forgetCutoffIso(afterDays);
  const result = await db.run(
    `UPDATE autobiographical_episodes SET is_forgotten = 1
     WHERE is_forgotten = 0 AND created_at < ? AND salience < ?`,
    cutoff, salienceCeiling
  );
  return { forgottenCount: result?.changes || 0, cutoff, salienceCeiling };
}

module.exports = { recordEpisode, getRecentEpisodes, getEpisodeById, forgetStaleEpisodes, DEFAULT_FORGET_AFTER_DAYS };
