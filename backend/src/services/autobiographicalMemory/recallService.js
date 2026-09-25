'use strict';

// Injection step (plan step 6): before the orchestrator plans, pull the
// handful of past episodes/lessons that actually bear on the current
// situation and turn them into a short, decision-shaping summary. This is
// not decorative — callers are expected to fold `adjustments` into budget,
// risk tolerance and evidence gates.

const episodeStore = require('./episodeStore');
const lessonService = require('./lessonService');

const DEFAULT_TOP_EPISODES = 3;
const DEFAULT_TOP_LESSONS = 3;
const MIN_LESSON_CONFIDENCE = 0.55;

function tokenize(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [];
}

function overlapScore(goalTokens, candidateText) {
  if (!goalTokens.length) return 0;
  const candidateTokens = new Set(tokenize(candidateText));
  const matches = goalTokens.filter((token) => candidateTokens.has(token));
  return matches.length / goalTokens.length;
}

function rankEpisodesByRelevance(episodes, goal) {
  const goalTokens = tokenize(goal);
  return episodes
    .map((episode) => ({ episode, relevance: overlapScore(goalTokens, episode.situation?.goal) }))
    .sort((a, b) => (b.relevance - a.relevance) || (b.episode.salience - a.episode.salience))
    .map((entry) => entry.episode);
}

function lessonAppliesToConditions(lesson, kind, goal) {
  if (lesson.scope && kind && lesson.scope !== kind) return false;
  if (!lesson.reuseConditions?.length) return true;
  const goalTokens = new Set(tokenize(goal));
  return lesson.reuseConditions.some((condition) => tokenize(condition).some((token) => goalTokens.has(token)) || condition === kind);
}

function episodeLine(episode) {
  const outcome = episode.outcome?.status || 'unknown';
  const strategy = episode.decision?.selectedStrategy || episode.action?.tool || 'unspecified';
  return `Similar episode (${episode.kind}, ${outcome}): ${strategy}${episode.lesson?.summary ? ` — ${episode.lesson.summary}` : ''}`;
}

function lessonLine(lesson) {
  return `${lesson.recommendedAction === 'avoid_strategy_before_retry' ? 'Dead-end' : 'Recommended'}: ${lesson.claim} (confidence ${lesson.confidence.toFixed(2)})`;
}

function adjustmentsFromLessons(lessons) {
  const avoidCount = lessons.filter((lesson) => lesson.recommendedAction === 'avoid_strategy_before_retry').length;
  const reuseCount = lessons.filter((lesson) => lesson.recommendedAction === 'reuse_strategy_first').length;
  return {
    riskDelta: avoidCount > 0 ? -0.1 * avoidCount : 0,
    evidenceStrictnessDelta: avoidCount > 0 ? 0.1 * avoidCount : 0,
    confidenceBoost: reuseCount > 0 ? 0.05 * reuseCount : 0
  };
}

function buildSummary(episodes, lessons) {
  if (!episodes.length && !lessons.length) return 'Autobiographical recall: no relevant prior experience found.';
  const lines = ['Autobiographical recall:', ...episodes.map(episodeLine), ...lessons.map(lessonLine)];
  return lines.join('\n');
}

async function recallForSituation(situation = {}, options = {}, dbOverride = null) {
  const { agentId, missionId, kind, goal } = situation;
  const topEpisodes = Math.max(1, Number(options.topEpisodes) || DEFAULT_TOP_EPISODES);
  const topLessons = Math.max(1, Number(options.topLessons) || DEFAULT_TOP_LESSONS);

  const candidateEpisodes = await episodeStore.getRecentEpisodes(
    { agentId, missionId: options.sameMissionOnly ? missionId : undefined, kind: options.sameKindOnly ? kind : undefined, limit: 50 },
    dbOverride
  );
  const episodes = rankEpisodesByRelevance(candidateEpisodes, goal).slice(0, topEpisodes);

  const candidateLessons = await lessonService.getLessons({ minConfidence: MIN_LESSON_CONFIDENCE, limit: 50 }, dbOverride);
  const lessons = candidateLessons.filter((lesson) => lessonAppliesToConditions(lesson, kind, goal)).slice(0, topLessons);

  return {
    episodes,
    lessons,
    summary: buildSummary(episodes, lessons),
    adjustments: adjustmentsFromLessons(lessons)
  };
}

module.exports = { recallForSituation, rankEpisodesByRelevance, lessonAppliesToConditions };
