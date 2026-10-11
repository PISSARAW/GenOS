'use strict';

const { createHash } = require('node:crypto');
const { createSyncytiumCrdt } = require('../syncytiumCrdtService');
const { getPolicy } = require('./variants/variantPolicyRegistry');

const FIELD_REQUIREMENTS = Object.freeze({
  hard: [], soft: ['antiEntropyLog', 'queuedDeltas'],
  code: ['files', 'tests', 'builds'],
  document: ['sections', 'comments', 'document_undo'],
  graph: ['graph_nodes', 'graph_edges'],
  transactional: ['budget', 'inventory', 'capacity', 'reservations'],
  epistemic: ['claims', 'evidence', 'refutations'],
  blackboard: ['events'],
  localFirst: ['offlineQueue', 'syncState', 'deviceReplicas'],
  speculative: ['branchRegistry', 'promotionLog', 'discardLog'],
  hierarchical: [], realtimeControl: ['controls'],
  humanAi: ['human.approvals', 'human.control', 'human.consent', 'human.audit']
});

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function conflict(reason) {
  return { components: [{ id: 'syncytium.shared-state', status: 'conflict', reason }],
    boundary: { restorable: false, reason } };
}

function denied(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_SNAPSHOT_BOUNDARY_INVALID' });
}

function sessionIdOf(context) {
  const sessionId = context.sessionId || context.topologySessionId;
  if (typeof sessionId !== 'string' || !sessionId) throw denied('A Syncytium session ID is required.');
  return sessionId;
}

async function linkedAgent(context, sessionId) {
  if (!context.db || typeof context.db.get !== 'function' || !context.agentId) {
    throw denied('A persisted agent and database are required to prove session ownership.');
  }
  if (typeof context.scope?.clause !== 'string' || !Array.isArray(context.scope.params)) {
    throw denied('A tenant workspace scope is required.');
  }
  const agent = await context.db.get(`SELECT a.workspace_id, a.metadata_json FROM agents a
    JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND ${context.scope.clause}`,
  context.agentId, ...context.scope.params);
  return assertAgentBinding(agent, context, sessionId);
}

function assertAgentBinding(agent, context, sessionId) {
  if (!agent) throw denied('Unknown agent.');
  let metadata;
  try { metadata = JSON.parse(agent.metadata_json || '{}'); } catch { throw denied('Invalid agent metadata.'); }
  if (metadata.topologySessionId !== sessionId) throw denied('Agent is not linked to this Syncytium session.');
  if (context.workspaceId && agent.workspace_id !== context.workspaceId) {
    throw denied('Agent workspace does not match the requested workspace.');
  }
  return agent;
}

async function readState(context) {
  const sessionId = sessionIdOf(context);
  await linkedAgent(context, sessionId);
  const row = await context.db.get(`SELECT s.state_json, r.revision FROM topology_sessions s
    JOIN syncytium_session_revisions r ON r.session_id = s.id
    WHERE s.id = ? AND s.topology = 'syncytium'`, sessionId);
  if (!row || !Number.isSafeInteger(row.revision)) throw denied('Persisted Syncytium state is unavailable.');
  let state;
  try { state = JSON.parse(row.state_json); } catch { throw denied('Persisted Syncytium state is invalid.'); }
  return { sessionId, revision: row.revision, state };
}

function variantOf(context, state) {
  const variantId = state.variantPolicy?.id;
  if (!variantId || (context.variantId && getPolicy(context.variantId).id !== getPolicy(variantId).id)) {
    throw denied('Persisted Syncytium variant is missing or mismatched.');
  }
  return getPolicy(variantId).id;
}

function assertVariantSchema(state, variantId) {
  assertBaseSchema(state);
  const required = FIELD_REQUIREMENTS[variantId];
  if (!required || required.some((field) => !state.schema.fields[field])) {
    throw denied(`Required ${variantId} shared fields are absent from the schema.`);
  }
  assertSpecialSchema(state, variantId);
}

function assertBaseSchema(state) {
  if (!state.crdtState || !Array.isArray(state.snapshots) || !state.schema?.fields) {
    throw denied('CRDT, schema or materialized snapshots are unavailable.');
  }
}

function assertSpecialSchema(state, variantId) {
  if (variantId === 'hard' && !Object.keys(state.schema.fields).length
    && !Object.keys(state.schema.invariants || {}).length) {
    throw denied('Hard Syncytium has no fields or invariants.');
  }
  if (variantId === 'hierarchical' && !Object.keys(state.domains || {}).length) {
    throw denied('Hierarchical Syncytium has no persisted domains.');
  }
}

function assertMaterialization(state) {
  const candidate = state.snapshots.at(-1);
  if (!completeSnapshot(candidate)) {
    throw denied('A complete materialized snapshot is required.');
  }
  if (digest(candidate.crdtState) !== digest(state.crdtState)) throw denied('Materialized CRDT state is stale.');
  const restored = createSyncytiumCrdt();
  try { restored.restore(state.crdtState); } catch { throw denied('Persisted CRDT state cannot be replayed.'); }
  if (!matchesRestored(candidate, restored)) {
    throw denied('Materialized state version or causal frontier is stale.');
  }
  return candidate;
}

function completeSnapshot(candidate) {
  return candidate && Number.isSafeInteger(candidate.stateVersion)
    && candidate.snapshotId && candidate.causalFrontier && candidate.crdtState;
}

function matchesRestored(candidate, restored) {
  return candidate.stateVersion === restored.getSnapshot().totalOps
    && digest(candidate.causalFrontier) === digest(restored.getCausalFrontier())
    && digest(candidate.shared) === digest(restored.getSnapshot());
}

function assertReplicas(state, candidate) {
  const replicas = Object.values(state.replicas || {});
  if (replicas.some((replica) => replicaPending(replica, candidate))) throw denied('Replica reconciliation is pending.');
  return replicas;
}

function replicaPending(replica, candidate) {
  if (!Array.isArray(replica.offlineOperations) || replica.offlineOperations.length) return true;
  if (['PARTITIONED', 'REJOINING'].includes(replica.status)) return true;
  if (replica.status === 'RETIRED') return false;
  return replica.lastSeenVersion !== candidate.stateVersion
    || digest(replica.causalFrontier) !== digest(candidate.causalFrontier);
}

function currentState(record, variantId) {
  assertVariantSchema(record.state, variantId);
  const candidate = assertMaterialization(record.state);
  return { candidate, replicas: assertReplicas(record.state, candidate) };
}

function variantEvidence(state, variantId) {
  const fields = FIELD_REQUIREMENTS[variantId];
  const sharedFields = state.snapshots.at(-1).shared?.sharedFields || {};
  return {
    requiredFields: fields,
    schemaDigest: digest(state.schema),
    fieldDigest: digest(Object.fromEntries(fields.map((field) => [field, sharedFields[field]]))),
    domainsDigest: digest(state.domains || {}),
    branchesDigest: digest(state.speculativeBranches || {}),
    reflexDigest: digest(state.reflexSignals || [])
  };
}

function boundaryFor(record, variantId) {
  const { candidate, replicas } = currentState(record, variantId);
  return {
    sessionId: record.sessionId, variantId, revision: record.revision,
    snapshotId: candidate.snapshotId, stateVersion: candidate.stateVersion,
    causalFrontier: candidate.causalFrontier,
    crdtDigest: digest(candidate.crdtState), replicaDigest: digest(replicas),
    variantEvidence: variantEvidence(record.state, variantId), restorable: false
  };
}

async function capture(context = {}) {
  try {
    const record = await readState(context);
    const boundary = boundaryFor(record, variantOf(context, record.state));
    return { components: [{ id: 'syncytium.shared-state', status: 'reference-only',
      reference: boundary, reason: 'Shared CRDT state requires coordinated replay; workspace restore cannot restore it.' }],
    boundary };
  } catch (error) {
    return conflict(error.code === 'SYNCYTIUM_VARIANT_POLICY_UNKNOWN' ? 'Unknown Syncytium variant.' : error.message);
  }
}

async function preflightRestore(context = {}, manifest = {}) {
  const saved = manifest.boundary;
  if (!saved || saved.restorable !== false) return { ok: false, reasons: ['SYNCYTIUM_BOUNDARY_MISSING'] };
  const fresh = await capture({ ...context, sessionId: saved.sessionId, variantId: saved.variantId });
  if (fresh.components[0].status === 'conflict') {
    return { ok: false, reasons: [fresh.components[0].reason] };
  }
  if (digest(fresh.boundary) !== digest(saved)) {
    return { ok: false, reasons: ['SYNCYTIUM_BOUNDARY_CHANGED'] };
  }
  return { ok: true, plan: { action: 'preserve-live-session', sessionId: saved.sessionId,
    snapshotId: saved.snapshotId, sharedStateRestore: 'unsupported' } };
}

module.exports = { capture, preflightRestore, FIELD_REQUIREMENTS };
