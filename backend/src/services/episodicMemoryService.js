/**
 * Episodic Memory Service
 * Handles structured episodic experience recording, retrieval, and hippocampal consolidation.
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const DEFAULT_MAX_EPISODE_FIELD_BYTES = 1024 * 1024;
const DEFAULT_MAX_EPISODE_BYTES = 4 * 1024 * 1024;

function positiveLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function episodeLimits() {
  return {
    maxFieldBytes: positiveLimit('GENOS_MAX_EPISODE_FIELD_BYTES', DEFAULT_MAX_EPISODE_FIELD_BYTES),
    maxBytes: positiveLimit('GENOS_MAX_EPISODE_BYTES', DEFAULT_MAX_EPISODE_BYTES)
  };
}

function normalizeStringField(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function parseJsonField(val, defaultVal = {}) {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return defaultVal;
  }
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return values[values.length - 1];
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return values[values.length - 1];
}

function defaultEpisodeId(episode) {
  return episode.id || crypto.randomUUID();
}

function normalizeTurnNumber(episode) {
  const value = firstNonNull(episode.turn_number, episode.turnNumber);
  return Number.isInteger(value) ? value : 0;
}

function normalizeRewardScore(episode) {
  return Number(firstNonNull(episode.reward_score, episode.rewardScore, 0));
}

function defaultCreatedAt(episode) {
  return episode.created_at || episode.createdAt || new Date().toISOString();
}

function normalizeEpisodeFields(episode) {
  return {
    id: defaultEpisodeId(episode),
    agentId: firstTruthy(episode.agent_id, episode.agentId, 'unknown'),
    sessionId: firstTruthy(episode.session_id, episode.sessionId, null),
    taskId: firstTruthy(episode.task_id, episode.taskId, null),
    turnNumber: normalizeTurnNumber(episode),
    actionType: firstTruthy(episode.action_type, episode.actionType, 'step'),
    contextState: normalizeStringField(firstTruthy(episode.context_state, episode.contextState, {})),
    actionInput: normalizeStringField(firstTruthy(episode.action_input, episode.actionInput, '')),
    observationOutput: normalizeStringField(firstTruthy(episode.observation_output, episode.observationOutput, '')),
    rewardScore: normalizeRewardScore(episode)
  };
}

function totalFieldBytes(fields) {
  return [fields.contextState, fields.actionInput, fields.observationOutput]
    .reduce((total, value) => total + Buffer.byteLength(value, 'utf8'), 0);
}

function isValidReward(rewardScore) {
  return Number.isFinite(rewardScore) && rewardScore >= 0 && rewardScore <= 1;
}

function validateEpisodeFields(fields) {
  const limits = episodeLimits();
  const entries = [
    ['context_state', fields.contextState],
    ['action_input', fields.actionInput],
    ['observation_output', fields.observationOutput]
  ];
  for (const entry of entries) {
    if (Buffer.byteLength(entry[1], 'utf8') > limits.maxFieldBytes) {
      throw new Error(`Episode ${entry[0]} exceeds the ${limits.maxFieldBytes}-byte limit.`);
    }
  }
  if (totalFieldBytes(fields) > limits.maxBytes) {
    throw new Error(`Episode exceeds the ${limits.maxBytes}-byte limit.`);
  }
  if (!isValidReward(fields.rewardScore)) {
    throw new Error('rewardScore must be a finite number between 0 and 1.');
  }
}

/**
 * Record a structured episodic experience turn
 * @param {object} episode
 * @param {object} [dbOverride]
 * @returns {Promise<object>}
 */
async function recordEpisode(episode = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const fields = normalizeEpisodeFields(episode);
  validateEpisodeFields(fields);
  const isConsolidated = firstNonNull(episode.is_consolidated, episode.isConsolidated) ? 1 : 0;
  const createdAt = defaultCreatedAt(episode);

  await db.run(
    `INSERT INTO episodic_memories (
      id, agent_id, session_id, task_id, turn_number,
      action_type, context_state, action_input, observation_output,
      reward_score, is_consolidated, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fields.id, fields.agentId, fields.sessionId, fields.taskId, fields.turnNumber,
    fields.actionType, fields.contextState, fields.actionInput, fields.observationOutput,
    fields.rewardScore, isConsolidated, createdAt
  );

  return {
    id: fields.id,
    agentId: fields.agentId,
    sessionId: fields.sessionId,
    taskId: fields.taskId,
    turnNumber: fields.turnNumber,
    actionType: fields.actionType,
    contextState: parseJsonField(fields.contextState),
    actionInput: fields.actionInput,
    observationOutput: fields.observationOutput,
    rewardScore: fields.rewardScore,
    isConsolidated,
    createdAt
  };
}

/**
 * Query recent episodic experiences
 * @param {object} options
 * @param {object} [dbOverride]
 * @returns {Promise<Array>}
 */
async function getRecentEpisodes(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const { agentId, sessionId, taskId, unconsolidatedOnly = false, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM episodic_memories WHERE is_purged = 0';
  const params = [];

  if (agentId) {
    query += ' AND agent_id = ?';
    params.push(agentId);
  }
  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (taskId) {
    query += ' AND task_id = ?';
    params.push(taskId);
  }
  if (unconsolidatedOnly) {
    query += ' AND is_consolidated = 0';
  }

  query += ' ORDER BY created_at DESC, turn_number DESC LIMIT ? OFFSET ?';
  params.push(Math.max(1, limit), Math.max(0, offset));

  const rows = await db.all(query, ...params);
  return rows.map(r => ({
    id: r.id,
    agentId: r.agent_id,
    sessionId: r.session_id,
    taskId: r.task_id,
    turnNumber: r.turn_number,
    actionType: r.action_type,
    contextState: parseJsonField(r.context_state),
    actionInput: r.action_input,
    observationOutput: r.observation_output,
    rewardScore: r.reward_score,
    isConsolidated: r.is_consolidated,
    createdAt: r.created_at
  }));
}

function normalizeThreshold(scoreThreshold) {
  const threshold = Number(scoreThreshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('scoreThreshold must be a finite number between 0 and 1.');
  }
  return threshold;
}

function consolidationFilter(agentId, sessionId) {
  let query = 'SELECT id, reward_score FROM episodic_memories WHERE is_consolidated = 0';
  const params = [];
  if (agentId) {
    query += ' AND agent_id = ?';
    params.push(agentId);
  }
  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }
  return { query, params };
}

function classifyEpisodes(episodes, threshold, purgeBelowThreshold) {
  const consolidatedIds = [];
  const purgedIds = [];
  for (const ep of episodes) {
    if (ep.reward_score >= threshold) {
      consolidatedIds.push(ep.id);
    } else if (purgeBelowThreshold) {
      purgedIds.push(ep.id);
    }
  }
  return { consolidatedIds, purgedIds };
}

function consolidateStatement(placeholders) {
  return `UPDATE episodic_memories SET is_consolidated = 1 WHERE id IN (${placeholders})`;
}

function purgeStatement(placeholders) {
  return `UPDATE episodic_memories SET is_purged = 1, purged_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
}

async function runIdBatches(db, ids, buildStatement) {
  const BATCH_SIZE = 200;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    await db.run(buildStatement(placeholders), ...batch);
  }
}

/**
 * Perform hippocampal consolidation on episodic memories
 * Promotes high-reward episodes to consolidated status, and purges lower-reward episodes if requested.
 * @param {object} options
 * @param {object} [dbOverride]
 * @returns {Promise<object>}
 */
async function consolidateEpisodes(options = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const { agentId, sessionId, scoreThreshold = 0.7, purgeBelowThreshold = true } = options;
  const threshold = normalizeThreshold(scoreThreshold);
  const { query, params } = consolidationFilter(agentId, sessionId);
  const unconsolidated = await db.all(query, ...params);
  const { consolidatedIds, purgedIds } = classifyEpisodes(unconsolidated, threshold, purgeBelowThreshold);

  await runIdBatches(db, consolidatedIds, consolidateStatement);
  await runIdBatches(db, purgedIds, purgeStatement);

  return {
    consolidatedCount: consolidatedIds.length,
    purgedCount: purgedIds.length,
    totalProcessed: unconsolidated.length,
    consolidatedIds,
    purgedIds
  };
}

/**
 * Retrieve a specific episode by id
 * @param {string} id
 * @param {object} [dbOverride]
 * @returns {Promise<object|null>}
 */
async function getEpisodeById(id, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const r = await db.get('SELECT * FROM episodic_memories WHERE id = ?', id);
  if (!r) return null;
  return {
    id: r.id,
    agentId: r.agent_id,
    sessionId: r.session_id,
    taskId: r.task_id,
    turnNumber: r.turn_number,
    actionType: r.action_type,
    contextState: parseJsonField(r.context_state),
    actionInput: r.action_input,
    observationOutput: r.observation_output,
    rewardScore: r.reward_score,
    isConsolidated: r.is_consolidated,
    createdAt: r.created_at
  };
}

module.exports = {
  recordEpisode,
  getRecentEpisodes,
  consolidateEpisodes,
  getEpisodeById
};
