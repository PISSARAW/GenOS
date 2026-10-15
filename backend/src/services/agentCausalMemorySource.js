'use strict';

const { readFailed } = require('./agentMemoryTelemetry');

async function load(agentId, options = {}) {
  try {
    const db = options.db || await require('../db').getDatabase();
    const query = { agentId, organizationId: options.organizationId, projectId: options.projectId,
      limit: options.causalMemoryLimit || 4 };
    const [experiences, pitfalls] = await Promise.all([
      loadSource({ db, query, agentId, source: 'causal-learning-load', load: require('./causalLearningOutbox').recentMemories }),
      loadSource({ db, query, agentId, source: 'negative-outcome-memory-load', load: require('./terminalNegativeOutcomeMemory').recentMemories })
    ]);
    return { experiences, pitfalls };
  } catch (error) {
    readFailed(agentId, error, 'causal-learning-load');
    return { experiences: [], pitfalls: [] };
  }
}

async function loadSource(input) {
  try {
    return await input.load(input.db, input.query);
  } catch (error) {
    readFailed(input.agentId, error, input.source);
    return [];
  }
}

module.exports = { load };
