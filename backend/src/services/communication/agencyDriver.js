'use strict';

/**
 * Agency Driver — decides whether an agent should act autonomously
 * based on communication outcomes and expertise (P3 audit conscience).
 *
 * Rule: autonomous if expertise >= 0.7 and wasteRate < 0.3.
 */

const { getDatabase } = require('../../db');
const { getExpertise } = require('./transactiveMemoryService');
const { getOutcomeRates } = require('./communicationMetricsService');

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function getAgentWasteRate(db, agentId) {
  const rows = await db.all(
    `SELECT outcome, COUNT(*) AS n FROM communication_outcomes
     WHERE sender_id = ? GROUP BY outcome`,
    [agentId]
  );
  const byOutcome = {};
  let total = 0;
  for (const row of rows) {
    byOutcome[row.outcome] = Number(row.n);
    total += Number(row.n);
  }
  if (total === 0) return 0;
  const wasted = (byOutcome.no_effect || 0) + (byOutcome.ignored || 0);
  return wasted / total;
}

async function getAgentActionRate(db, agentId) {
  const rows = await db.all(
    `SELECT outcome, COUNT(*) AS n FROM communication_outcomes
     WHERE sender_id = ? GROUP BY outcome`,
    [agentId]
  );
  const byOutcome = {};
  let total = 0;
  for (const row of rows) {
    byOutcome[row.outcome] = Number(row.n);
    total += Number(row.n);
  }
  if (total === 0) return 0;
  return (byOutcome.action_taken || 0) / total;
}

/**
 * Assess whether an agent should act autonomously.
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} params.domain
 * @param {object} [params.outcomes] — optional pre-fetched outcomes { wasteRate, actionRate, total }
 * @param {object} [params.db] — optional db handle
 * @returns {Promise<{ autonomous: boolean, reason: string, expertise: number, wasteRate: number }>}
 */
async function assessAgency({ agentId, domain, outcomes, db }) {
  if (!agentId) throw new Error('assessAgency: agentId is required.');
  if (!domain) throw new Error('assessAgency: domain is required.');

  const resolvedDb = await resolveDb(db);
  const expertiseRow = await getExpertise({ db: resolvedDb, agentId, domain });
  const expertise = expertiseRow ? Number(expertiseRow.competence || 0) : 0;

  let wasteRate = 0;
  if (outcomes && typeof outcomes.wasteRate === 'number') {
    wasteRate = outcomes.wasteRate;
  } else {
    wasteRate = await getAgentWasteRate(resolvedDb, agentId);
  }

  const autonomous = expertise >= 0.7 && wasteRate < 0.3;
  const reason = autonomous
    ? `Agency granted: expertise=${expertise.toFixed(2)} >= 0.7, wasteRate=${wasteRate.toFixed(2)} < 0.3`
    : `Agency denied: expertise=${expertise.toFixed(2)} (need >= 0.7), wasteRate=${wasteRate.toFixed(2)} (need < 0.3)`;

  return { autonomous, reason, expertise, wasteRate };
}

/**
 * Batch assessment for multiple agents.
 * @param {Array<{ agentId: string, domain: string }>} agents
 * @param {object} [opts] — { db }
 * @returns {Promise<Array<{ agentId: string, autonomous: boolean, reason: string }>>}
 */
async function assessAgencyBatch(agents, opts = {}) {
  const results = [];
  for (const a of agents) {
    const result = await assessAgency({ agentId: a.agentId, domain: a.domain, db: opts.db });
    results.push({ agentId: a.agentId, autonomous: result.autonomous, reason: result.reason });
  }
  return results;
}

module.exports = { assessAgency, assessAgencyBatch };
