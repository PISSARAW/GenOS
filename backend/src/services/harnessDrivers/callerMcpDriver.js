/**
 * Driver HCL pour l'exécuteur `caller_mcp` existant.
 * La cognition vient du client MCP ; GenOS garde l'autorité
 * sur l'identité, les budgets, les leases et la promotion.
 */
const path = require('path');

function capabilities() {
  return { provides: ['cognitive-generation', 'mcp-sampling', 'human-in-loop'], kind: 'external-cognitive' };
}

function runtimePath() {
  return path.resolve(__dirname, '../../../bin/caller-mcp-runtime.cjs');
}

function createRequest(mission) {
  const source = mission || {};
  return {
    harness: 'caller_mcp',
    mission: source.mission || source.prompt || '',
    agentId: source.agentId || source.id || '',
    provider: source.provider || 'mcp-host',
  };
}

function isAvailable(environment) {
  const env = environment || process.env;
  return Boolean(String(env.GENOS_MCP_SAMPLING_URL || '').trim());
}

module.exports = { capabilities, runtimePath, createRequest, isAvailable };
