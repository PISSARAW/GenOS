'use strict';

const service = require('../../services/topologySnapshotService');

const ADAPTERS = Object.freeze({
  trinity: '../../services/topologySnapshots/trinity',
  a_team: '../../services/topologySnapshots/aTeam',
  biocenose: '../../services/topologySnapshots/biocenose',
  holobionte: '../../services/topologySnapshots/holobionte',
  syncytium: '../../services/syncytium/topologySnapshotAdapter',
  rhizome: '../../services/topologySnapshots/rhizome',
  metapopulation: '../../services/topologySnapshots/metapopulation',
  biome: '../../services/topologySnapshots/biome'
});
const registered = new Set();

function refusal(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function register(topologyId) {
  const modulePath = ADAPTERS[topologyId];
  if (!modulePath) throw refusal('TOPOLOGY_SNAPSHOT_UNKNOWN', 'Unknown topology snapshot adapter.');
  if (registered.has(topologyId)) return;
  service.registerAdapter(topologyId, require(modulePath));
  registered.add(topologyId);
}

function requested(req) {
  const input = req.body?.topologySnapshot;
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['topologyId', 'variantId', 'sessionId'].includes(key))) {
    throw refusal('TOPOLOGY_SNAPSHOT_REQUEST_INVALID', 'Expected topologyId, variantId and sessionId only.');
  }
  for (const field of ['topologyId', 'variantId', 'sessionId']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      throw refusal('TOPOLOGY_SNAPSHOT_REQUEST_INVALID', `Missing ${field}.`);
    }
  }
  return input;
}

async function capture({ db, scope, agent, req }) {
  const selection = requested(req);
  if (!selection) return null;
  if (!agent.workspace_id) throw refusal('TOPOLOGY_SNAPSHOT_WORKSPACE_REQUIRED', 'Agent workspace required.', 409);
  register(selection.topologyId);
  return service.capture({ db, scope, ...selection, agentId: agent.id,
    workspaceId: agent.workspace_id, workerKind: workerKind(agent) });
}

async function preflight({ db, scope, agent, state }) {
  const manifest = state?._genosSnapshot?.topologySnapshot;
  if (!manifest) return null;
  const bindings = manifest.bindings || {};
  register(bindings.topologyId);
  return service.preflightRestore({ db, scope, manifest, topologyId: bindings.topologyId,
    variantId: bindings.variantId, sessionId: bindings.sessionId,
    agentId: agent.id, workspaceId: agent.workspace_id, workerKind: workerKind(agent) });
}

function workerKind(agent) {
  let metadata = {};
  try { metadata = JSON.parse(agent.metadata_json || '{}'); } catch (_) {}
  const value = metadata.workerKind || agent.workerKind
    || (agent.execution_mode === 'orchestrator' ? 'orchestrator' : agent.role);
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/i.test(value)) {
    throw refusal('TOPOLOGY_SNAPSHOT_WORKER_KIND_REQUIRED', 'Agent worker kind is required.', 409);
  }
  return value;
}

module.exports = { capture, preflight };
