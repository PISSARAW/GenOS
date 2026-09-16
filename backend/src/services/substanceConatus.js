'use strict';

/**
 * Substance Conatus — Spinozist Conatus (effort to persevere).
 */

const { getDatabase } = require('../db');
const { setAttribute } = require('./ontologyService');

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

async function evaluateConatus(agentId) {
  const db = await getDb();
  const agent = await db.get('SELECT cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, dissonance_level, is_apoptotic FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const budgetRatio = agent.cognitive_budget / agent.cognitive_baseline_budget;
  const dissonanceRatio = agent.dissonance_level / agent.cognitive_max_dissonance;

  let conatusState = 'flourishing';
  if (agent.is_apoptotic) conatusState = 'ceased';
  else if (budgetRatio < 0.2 || dissonanceRatio > 0.8) conatusState = 'striving';
  else if (budgetRatio < 0.5 || dissonanceRatio > 0.5) conatusState = 'stressed';

  await setAttribute({ agentId, key: 'conatusState', value: conatusState, modality: 'accidental' });
  await setAttribute({ agentId, key: 'conatusBudgetRatio', value: budgetRatio, modality: 'accidental' });
  await setAttribute({ agentId, key: 'conatusDissonanceRatio', value: dissonanceRatio, modality: 'accidental' });

  return {
    agentId,
    conatusState,
    budgetRatio: Math.round(budgetRatio * 100) / 100,
    dissonanceRatio: Math.round(dissonanceRatio * 100) / 100,
    striving: conatusState !== 'flourishing' && conatusState !== 'ceased'
  };
}

async function getConatusState(agentId) {
  const attrs = await require('./ontologyService').getAttributes(agentId);
  return {
    agentId,
    conatusState: attrs.conatusState?.value,
    budgetRatio: attrs.conatusBudgetRatio?.value,
    dissonanceRatio: attrs.conatusDissonanceRatio?.value
  };
}

async function triggerConatusResponse(agentId, threatLevel) {
  const conatus = await evaluateConatus(agentId);

  let response = 'maintain';
  if (threatLevel > 0.8) response = 'emergency_preservation';
  else if (threatLevel > 0.5) response = 'heightened_striving';
  else if (conatus.striving) response = 'active_striving';

  await setAttribute({ agentId, key: 'conatusResponse', value: response, modality: 'accidental' });

  return { agentId, conatusState: conatus.conatusState, response, threatLevel };
}

module.exports = {
  evaluateConatus,
  getConatusState,
  triggerConatusResponse
};