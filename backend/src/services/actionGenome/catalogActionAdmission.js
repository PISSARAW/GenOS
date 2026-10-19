const { getDatabase } = require('../../db');
const topologyStore = require('../topologySessionStore');
const { getActionGenome } = require('./actionGenomeCatalog');
const { evaluateInvocation } = require('./actionInvocation');

async function defaultStateLoader(input) {
  const db = await getDatabase();
  const record = await topologyStore.load(db, input.session_id);
  if (!record || record.topology !== 'syncytium') {
    const error = new Error(`Unknown Syncytium session '${input.session_id}'.`);
    error.code = 'SYNCYTIUM_SESSION_UNKNOWN';
    error.status = 404;
    throw error;
  }
  return { version: `revision:${record.revision}`, snapshot: { revision: record.revision, topology: record.topology } };
}

async function admitCatalogAction(request, dependencies = {}) {
  const genome = getActionGenome(request.id, request.version);
  const loadState = dependencies.loadState || defaultStateLoader;
  const state = await loadState(request.input);
  return evaluateInvocation({
    genome,
    invocation: {
      actor: { id: request.actorId },
      permissions: request.permissions,
      leases: request.leases,
      budget: request.budget,
      observedStateVersion: request.observedStateVersion,
      input: request.input
    },
    state
  });
}

module.exports = { admitCatalogAction };
