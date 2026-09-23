/**
 * Driver HCL pour l'exécuteur `local` existant (Ollama / runtime local).
 * Normalise le runtime historique sans changer son comportement.
 */
const path = require('path');

function capabilities() {
  return { provides: ['cognitive-generation', 'tool-execution', 'offline-capable'], kind: 'local-runtime' };
}

function runtimePath() {
  return path.resolve(__dirname, '../../../bin/local-codex-runtime.cjs');
}

function createRequest(mission) {
  const source = mission || {};
  return {
    harness: 'local',
    mission: source.mission || source.prompt || '',
    agentId: source.agentId || source.id || '',
    provider: source.provider || 'local',
  };
}

function isAvailable(environment) {
  const env = environment || process.env;
  return Boolean(String(env.GENOS_LOCAL_MODEL || '').trim() || true);
}

module.exports = { capabilities, runtimePath, createRequest, isAvailable };
