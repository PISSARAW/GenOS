/**
 * Driver HCL pour l'exécuteur `codex` existant.
 * Normalise le runtime historique sans changer son comportement.
 */
const path = require('path');

function capabilities() {
  return { provides: ['cognitive-generation', 'tool-execution', 'local-supervision'], kind: 'bundled-runtime' };
}

function runtimePath() {
  return path.resolve(__dirname, '../../../bin/genos-agent-runtime.cjs');
}

function createRequest(mission) {
  const source = mission || {};
  return {
    harness: 'codex',
    mission: source.mission || source.prompt || '',
    agentId: source.agentId || source.id || '',
    provider: source.provider || 'codex',
  };
}

function isAvailable(environment) {
  const env = environment || process.env;
  return Boolean(runtimePath() || env);
}

module.exports = { capabilities, runtimePath, createRequest, isAvailable };
