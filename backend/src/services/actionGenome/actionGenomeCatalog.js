const bindings = require('../../../../shared/actionSurfaceBindings.v1.json');
const syncytiumEvents = require('../../../../shared/actionGenomes/syncytium.session.events.v1.json');
const { assertActionGenome } = require('./actionGenomeValidator');

const ACTIONS = new Map([
  [`${syncytiumEvents.identity.id}@${syncytiumEvents.identity.version}`, syncytiumEvents]
]);

function actionKey(id, version) {
  return `${id}@${version}`;
}

function getActionGenome(id, version) {
  const genome = ACTIONS.get(actionKey(id, version));
  if (!genome) {
    const error = new Error(`Unknown ActionGenome '${actionKey(id, version)}'.`);
    error.code = 'ACTION_GENOME_UNKNOWN';
    error.status = 404;
    throw error;
  }
  return structuredClone(assertActionGenome(genome));
}

function listActionGenomes() {
  return [...ACTIONS.values()].map((genome) => ({ ...genome.identity }));
}

function getSurfaceBindings(genome) {
  return structuredClone(bindings.actions[actionKey(genome.identity.id, genome.identity.version)] || {});
}

module.exports = { getActionGenome, getSurfaceBindings, listActionGenomes };
