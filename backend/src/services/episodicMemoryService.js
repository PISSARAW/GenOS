/**
 * Episodic Memory Service
 * Handles structured episodic experience recording, retrieval, and hippocampal consolidation.
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');

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

/**
 * Record a structured episodic experience turn
 * @param {object} episode
 * @param {object} [dbOverride]
 * @returns {Promise<object>}
 */
async function recordEpisode(episode = {}, dbOverride = null) {
  const db = dbOverride || await getDatabase();
  const id = episode.id || crypto.randomUUID();
  const agentId = episode.agent_id || episode.agentId || 'unknown';
  const sessionId = episode.session_id || episode.sessionId || null;
  const taskId = episode.task_id || episode.taskId || null;
  const turnNumber = Number.isInteger(episode.turn_number ?? episode.turnNumber) ? (episode.turn_number ?? episode.turnNumber) : 0;
  const actionType = episode.action_type || episode.actionType || 'step';
  const contextState = normalizeStringField(episode.context_state || episode.contextState || {});
  const actionInput = normalizeStringField(episode.action_input || episode.actionInput || '');
  const observationOutput = normalizeStringField(episode.observation_output || episode.observationOutput || '');
  const rewardScore = typeof (episode.reward_score ?? episode.rewardScore) === 'number'
    ? (episode.reward_score ?? episode.rewardScore)
    : 0.0;
  const isConsolidated = (episode.is_consolidated ?? episode.isConsolidated) ? 1 : 0;
  const createdAt = episode.created_at || episode.createdAt || new Date().toISOString();

  await db.run(
    `INSERT INTO episodic_memories (
      id, agent_id, session_id, task_id, turn_number,
      action_type, context_state, action_input, observation_output,
      reward_score, is_consolidated, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, agentId, sessionId, taskId, turnNumber,
    actionType, contextState, actionInput, observationOutput,
    rewardScore, isConsolidated, createdAt
  );

  return {
    id,
    agentId,
    sessionId,
    taskId,
    turnNumber,
    actionType,
    contextState: parseJsonField(contextState),
    actionInput,
    observationOutput,
    rewardScore,
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

  let query = 'SELECT * FROM episodic_memories WHERE 1=1';
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

  const unconsolidated = await db.all(query, ...params);

  const consolidatedIds = [];
  const purgedIds = [];

  for (const ep of unconsolidated) {
    if (ep.reward_score >= scoreThreshold) {
      consolidatedIds.push(ep.id);
    } else if (purgeBelowThreshold) {
      purgedIds.push(ep.id);
    }
  }

  if (consolidatedIds.length > 0) {
    const placeholders = consolidatedIds.map(() => '?').join(',');
    await db.run(
      `UPDATE episodic_memories SET is_consolidated = 1 WHERE id IN (${placeholders})`,
      ...consolidatedIds
    );
  }

  if (purgedIds.length > 0) {
    const placeholders = purgedIds.map(() => '?').join(',');
    await db.run(
      `DELETE FROM episodic_memories WHERE id IN (${placeholders})`,
      ...purgedIds
    );
  }

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
