'use strict';

// Consolidation: raw episodes -> conditional, falsifiable lessons.
// Deterministic v1 (per plan step 10): group by (kind, strategy/tool), split
// success vs failure, and only emit a lesson when repetition supports it —
// a single anecdote is not a lesson, it stays an episode.

const crypto = require('crypto');
const { getDatabase } = require('../../db');
const episodeStore = require('./episodeStore');

const MIN_SUPPORT_FOR_LESSON = 2;
const MAX_CONFIDENCE = 0.95;

function clusterKeyFor(episode) {
  const strategy = episode.decision?.selectedStrategy || episode.action?.tool || 'unspecified';
  return `${episode.kind}::${strategy}`;
}

function isSuccess(episode) {
  return episode.outcome?.status === 'success';
}

function isFailure(episode) {
  return episode.outcome?.status === 'failed' || episode.outcome?.status === 'failure';
}

function groupByCluster(episodes) {
  const clusters = new Map();
  for (const episode of episodes) {
    const key = JSON.stringify([episode.organizationId || null, episode.projectId || null, clusterKeyFor(episode)]);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(episode);
  }
  return clusters;
}

function reuseConditionsFor(episode) {
  const conditions = [episode.kind];
  if (episode.situation?.goal) conditions.push(String(episode.situation.goal).slice(0, 60));
  return [...new Set(conditions)];
}

function claimFor(key, successCount, failureCount) {
  const [kind, strategy] = key.split('::');
  if (failureCount >= successCount) {
    return `Avoid "${strategy}" for ${kind}: it failed ${failureCount}/${failureCount + successCount} observed times.`;
  }
  return `Prefer "${strategy}" for ${kind}: it succeeded with evidence ${successCount}/${successCount + failureCount} observed times.`;
}

function recommendedActionFor(failureCount, successCount) {
  return failureCount >= successCount ? 'avoid_strategy_before_retry' : 'reuse_strategy_first';
}

function lessonIdFor(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `lesson_${hash}`;
}

function buildLessonFromCluster(key, episodes) {
  const [organizationId, projectId, clusterKey] = JSON.parse(key);
  const successes = episodes.filter(isSuccess);
  const failures = episodes.filter(isFailure);
  const support = successes.length + failures.length;
  if (support < MIN_SUPPORT_FOR_LESSON) return null;
  const claim = claimFor(clusterKey, successes.length, failures.length);
  const dominant = failures.length >= successes.length ? failures : successes;
  const counter = failures.length >= successes.length ? successes : failures;
  const supportConfidence = 0.5 + (0.45 * (support / (support + 4)) * (Math.abs(successes.length - failures.length) / support));
  return {
    id: lessonIdFor(key),
    organizationId,
    projectId,
    scope: clusterKey.split('::')[0],
    claim,
    confidence: Math.min(MAX_CONFIDENCE, supportConfidence),
    supportingEpisodes: dominant.map((episode) => episode.id),
    counterExamples: counter.map((episode) => episode.id),
    reuseConditions: reuseConditionsFor(dominant[0]),
    avoidConditions: failures.length >= successes.length ? reuseConditionsFor(dominant[0]) : [],
    recommendedAction: recommendedActionFor(failures.length, successes.length)
  };
}

async function upsertLesson(lesson, dbOverride) {
  const db = dbOverride || await getDatabase();
  await db.run(
    `INSERT INTO autobiographical_lessons (
      id, scope, organization_id, project_id, active, claim, confidence, supporting_episodes_json, counter_examples_json,
      reuse_conditions_json, avoid_conditions_json, recommended_action, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      claim = excluded.claim,
      organization_id = excluded.organization_id,
      project_id = excluded.project_id,
      active = 1,
      confidence = excluded.confidence,
      supporting_episodes_json = excluded.supporting_episodes_json,
      counter_examples_json = excluded.counter_examples_json,
      updated_at = CURRENT_TIMESTAMP`,
    lesson.id, lesson.scope, lesson.organizationId, lesson.projectId, lesson.claim, lesson.confidence,
    JSON.stringify(lesson.supportingEpisodes), JSON.stringify(lesson.counterExamples),
    JSON.stringify(lesson.reuseConditions), JSON.stringify(lesson.avoidConditions), lesson.recommendedAction
  );
  return lesson;
}

async function consolidateLessons(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const episodes = await episodeStore.getRecentEpisodes({ ...options, allTenants: true, limit: options.limit || 500 }, db);
  const clusters = groupByCluster(episodes);
  const produced = [];
  for (const [key, clusterEpisodes] of clusters) {
    const lesson = buildLessonFromCluster(key, clusterEpisodes);
    if (lesson) produced.push(await upsertLesson(lesson, db));
  }
  return produced;
}

function rowToLesson(row) {
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id || null,
    projectId: row.project_id || null,
    claim: row.claim,
    confidence: row.confidence,
    supportingEpisodes: JSON.parse(row.supporting_episodes_json || '[]'),
    counterExamples: JSON.parse(row.counter_examples_json || '[]'),
    reuseConditions: JSON.parse(row.reuse_conditions_json || '[]'),
    avoidConditions: JSON.parse(row.avoid_conditions_json || '[]'),
    recommendedAction: row.recommended_action,
    updatedAt: row.updated_at
  };
}

async function getLessons(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  if (Boolean(options.organizationId) !== Boolean(options.projectId)) throw new Error('Organization and project scope must be provided together.');
  const clauses = [];
  const params = [];
  if (options.scope) { clauses.push('scope = ?'); params.push(options.scope); }
  if (options.organizationId) { clauses.push('organization_id = ?'); params.push(options.organizationId); }
  else { clauses.push('organization_id IS NULL'); }
  if (options.projectId) { clauses.push('project_id = ?'); params.push(options.projectId); }
  else { clauses.push('project_id IS NULL'); }
  clauses.push('active = 1');
  if (Number.isFinite(options.minConfidence)) { clauses.push('confidence >= ?'); params.push(options.minConfidence); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(1, Number(options.limit) || 20);
  const rows = await db.all(`SELECT * FROM autobiographical_lessons ${where} ORDER BY confidence DESC, updated_at DESC LIMIT ?`, ...params, limit);
  return rows.map(rowToLesson);
}

module.exports = { consolidateLessons, getLessons, clusterKeyFor, MIN_SUPPORT_FOR_LESSON };
