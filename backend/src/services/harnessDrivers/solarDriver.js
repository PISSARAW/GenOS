/**
 * Driver HCL pour l'exécuteur `solar-direct` existant.
 * Normalise le runtime historique sans changer son comportement.
 */
const path = require('path');

function capabilities() {
  return { provides: ['cognitive-generation', 'tool-execution', 'direct-channel'], kind: 'bundled-runtime' };
}

function runtimePath() {
  return path.resolve(__dirname, '../../../bin/solar-direct-runtime-v2.cjs');
}

function createRequest(mission) {
  const source = mission || {};
  return {
    harness: 'solar-direct',
    mission: source.mission || source.prompt || '',
    agentId: source.agentId || source.id || '',
    provider: source.provider || 'solar',
  };
}

function isAvailable(environment) {
  const env = environment || process.env;
  return Boolean(runtimePath() || env);
}

module.exports = { capabilities, runtimePath, createRequest, isAvailable };
