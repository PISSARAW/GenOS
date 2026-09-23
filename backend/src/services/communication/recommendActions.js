'use strict';

/**
 * Recommend Actions Driver — suggests next communication actions
 * based on policy engine decisions and learning history (P3 audit conscience).
 *
 * Rules:
 *   - SILENCE if wasteRate > 0.5
 *   - SIGNAL if actionRate > 0.6
 *   - Otherwise suggest based on learning context.
 */

const { getDatabase } = require('../../db');
const { getExpertise } = require('./transactiveMemoryService');
const { getOutcomeRates } = require('./communicationMetricsService');
const { getRates } = require('./communicationMetricsService');

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

/**
 * Query recent communication outcomes for an agent.
 * @param {object} db — database handle
 * @param {string} agentId
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ outcome, n }>>}
 */
async function queryRecentOutcomes(db, agentId, limit = 50) {
  return db.all(
    `SELECT outcome, COUNT(*) AS n FROM communication_outcomes
     WHERE sender_id = ?
     AND created_at >= datetime('now', '-1 hour')
     GROUP BY outcome ORDER BY n DESC LIMIT ?`,
    [agentId, limit]
  );
}

/**
 * Get agent-level outcome rates from recent history.
 * @param {object} db — database handle
 * @param {string} agentId
 * @returns {Promise<{ total, actionRate, wasteRate }>}
 */
async function getAgentRates(db, agentId) {
  const rows = await queryRecentOutcomes(db, agentId);
  const byOutcome = {};
  let total = 0;
  for (const row of rows) {
    byOutcome[row.outcome] = Number(row.n);
    total += Number(row.n);
  }
  if (total === 0) return { total: 0, actionRate: 0, wasteRate: 0 };
  const acted = byOutcome.action_taken || 0;
  const wasted = (byOutcome.no_effect || 0) + (byOutcome.ignored || 0);
  return { total, actionRate: acted / total, wasteRate: wasted / total };
}

/**
 * Build a SILENCE recommendation.
 * @param {number} wasteRate
 * @param {string} reason
 * @returns {{ action: string, target: string, reason: string }}
 */
function silenceRecommendation(wasteRate, reason) {
  return { action: 'SILENCE', target: 'SELF', reason };
}

/**
 * Build a SIGNAL recommendation.
 * @param {number} actionRate
 * @param {string} reason
 * @returns {{ action: string, target: string, reason: string }}
 */
function signalRecommendation(actionRate, reason) {
  return { action: 'SIGNAL', target: 'AUDIENCE', reason };
}

/**
 * Recommend next communication actions for an agent.
 * @param {object} params
 * @param {object} params.db — optional database handle
 * @param {string} params.agentId
 * @param {object} [params.context] — { domain, urgency, recentDecision }
 * @returns {Promise<Array<{ action, target, reason }>>}
 */
async function recommendActions({ db, agentId, context = {} }) {
  if (!agentId) throw new Error('recommendActions: agentId is required.');
  const resolvedDb = await resolveDb(db);

  const rates = await getAgentRates(resolvedDb, agentId);
  const recommendations = [];

  if (rates.wasteRate > 0.5) {
    recommendations.push(silenceRecommendation(
      rates.wasteRate,
      `High wasteRate (${rates.wasteRate.toFixed(2)} > 0.5): recommend SILENCE to conserve tokens.`
    ));
    return recommendations;
  }

  if (rates.actionRate > 0.6) {
    recommendations.push(signalRecommendation(
      rates.actionRate,
      `High actionRate (${rates.actionRate.toFixed(2)} > 0.6): agent responds well to signals.`
    ));
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: 'STIGMERGY',
      target: 'ENVIRONMENT',
      reason: `Normal regime: actionRate=${rates.actionRate.toFixed(2)}, wasteRate=${rates.wasteRate.toFixed(2)}. Consider stigmergic encoding.`
    });
  }

  if (context.domain && context.urgency > 0.7) {
    recommendations.push({
      action: 'SIGNAL',
      target: 'HUMAN',
      reason: `Urgency=${context.urgency} > 0.7 with domain=${context.domain}: escalate to human.`
    });
  }

  return recommendations;
}

/**
 * Batch recommendation for multiple agents.
 * @param {Array<{ agentId: string, context?: object }>} agents
 * @param {object} [opts] — { db }
 * @returns {Promise<Array<{ agentId: string, recommendations: Array }>>}
 */
async function recommendActionsBatch(agents, opts = {}) {
  const results = [];
  for (const a of agents) {
    const recs = await recommendActions({ db: opts.db, agentId: a.agentId, context: a.context || {} });
    results.push({ agentId: a.agentId, recommendations: recs });
  }
  return results;
}

module.exports = { recommendActions, recommendActionsBatch, getAgentRates, queryRecentOutcomes };
