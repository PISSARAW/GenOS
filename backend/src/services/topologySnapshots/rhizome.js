'use strict';

const { digest, refusal } = require('../topologySnapshotContract');
const variants = require('../rhizome/variants/variantPolicyService');

const POLICY_VERSION = 1;
const QUIESCENT = new Set(['DORMANT', 'QUARANTINED']);
const VARIANT_FIELDS = Object.freeze({
  exploratory: ['activeNeeds', 'openGaps', 'trails'],
  routing: ['routeLineage', 'routeResults', 'trails'],
  growth: ['growthLimits', 'budgets', 'openGaps'],
  resilient: ['repairScars', 'routeLineage', 'budgets'],
  sparse: ['growthLimits', 'budgets', 'routeLineage'],
  persistent: ['leases', 'scope', 'routeLineage'],
  ephemeral: ['scope', 'trails', 'oscillators'],
  small_world: ['routeLineage', 'growthLimits', 'repairScars'],
  private: ['scope', 'routeLineage', 'repairScars'],
  cross_representation: ['routeLineage', 'routeResults', 'openGaps'],
  procedural: ['routeLineage', 'routeResults', 'activeNeeds'],
  self_healing: ['repairScars', 'routeLineage', 'budgets']
});

function fail(code, message) { throw refusal(code, message); }

function parse(value, label) {
  try {
    const result = JSON.parse(value);
    if (result && typeof result === 'object' && !Array.isArray(result)) return result;
  } catch (_) { /* malformed persisted state */ }
  fail('RHIZOME_SNAPSHOT_CORRUPT', `${label} is not a JSON object.`);
}

function tenantScope(scope) {
  const tenant = scope?.clause === 'w.organization_id = ? AND w.project_id = ?'
    && Array.isArray(scope.params) && scope.params.length === 2
    && scope.params.every((value) => typeof value === 'string' && value.length > 0);
  const local = scope?.clause === 'w.organization_id IS NULL AND w.project_id IS NULL'
    && Array.isArray(scope.params) && scope.params.length === 0;
  if (!tenant && !local) fail('RHIZOME_SNAPSHOT_SCOPE_INVALID', 'Workspace tenant scope is invalid.');
  return scope;
}

async function boundSession(context) {
  const { db, agentId, workspaceId, sessionId } = context;
  const scope = tenantScope(context.scope);
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  const workspace = await db.get(`SELECT id FROM workspaces w WHERE w.id = ? AND ${scope.clause}`,
    workspaceId, ...scope.params);
  const row = await db.get("SELECT state_json, revision FROM topology_sessions WHERE id = ? AND topology = 'rhizome'", sessionId);
  if (!agent || !workspace || agent.workspace_id !== workspaceId || !row) {
    fail('RHIZOME_SNAPSHOT_OWNER_MISMATCH', 'Rhizome session, agent and scoped workspace are not bound.');
  }
  const state = parse(row.state_json, 'Rhizome session');
  if (state.rhizomeId !== sessionId || !state.missionId || !state.variant) {
    fail('RHIZOME_SNAPSHOT_CORRUPT', 'Rhizome identity or variant is missing from persisted state.');
  }
  const participant = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?',
    state.missionId, agentId);
  if (!participant) fail('RHIZOME_SNAPSHOT_OWNER_MISMATCH', 'Agent is not attached to the Rhizome mission.');
  return { row, state };
}

function selectedVariant(context, state) {
  const selected = state.variant;
  if (!Object.hasOwn(VARIANT_FIELDS, selected) || !variants.list().includes(selected)) {
    fail('RHIZOME_SNAPSHOT_VARIANT_UNKNOWN', 'Persisted Rhizome variant is unknown.');
  }
  if (context.variantId !== 'default' && context.variantId !== selected) {
    fail('RHIZOME_SNAPSHOT_VARIANT_MISMATCH', 'Persisted Rhizome variant differs from request.');
  }
  return selected;
}

function graphRows(rows, state) {
  const version = state.graphVersion;
  validateGraphVersion(rows, version);
  const ids = new Set();
  const graph = rows.map((row) => {
    if (row.graph_version !== version) fail('RHIZOME_SNAPSHOT_GRAPH_CONFLICT', 'Graph row version differs from session.');
    const item = parse(row.payload, 'Rhizome graph row');
    if (item[row.key] !== row.id || ids.has(`${row.key}:${row.id}`)) {
      fail('RHIZOME_SNAPSHOT_GRAPH_CONFLICT', 'Graph row identity differs from its index.');
    }
    ids.add(`${row.key}:${row.id}`);
    return item;
  });
  validateGraphEndpoints(graph);
  return graph;
}

function validateGraphVersion(rows, version) {
  if (!Number.isSafeInteger(version) || version < 0) {
    fail('RHIZOME_SNAPSHOT_GRAPH_CONFLICT', 'Rhizome graph version is invalid.');
  }
  if (!rows.length && version !== 0) {
    fail('RHIZOME_SNAPSHOT_GRAPH_CONFLICT', 'Graph version cannot be verified without graph rows.');
  }
}

function validateGraphEndpoints(graph) {
  const nodes = new Set(graph.filter((item) => item.nodeId).map((item) => item.nodeId));
  if (graph.some((item) => item.edgeId && (!nodes.has(item.from) || !nodes.has(item.to)))) {
    fail('RHIZOME_SNAPSHOT_GRAPH_CONFLICT', 'Graph edge has an unknown endpoint.');
  }
}

async function persistedGraph(db, sessionId, state) {
  const nodes = await db.all('SELECT node_id, graph_version, node_json FROM rhizome_nodes WHERE session_id = ? ORDER BY node_id', sessionId);
  const edges = await db.all('SELECT edge_id, graph_version, edge_json FROM rhizome_edges WHERE session_id = ? ORDER BY edge_id', sessionId);
  const rows = [
    ...nodes.map((row) => ({ id: row.node_id, key: 'nodeId', graph_version: row.graph_version, payload: row.node_json })),
    ...edges.map((row) => ({ id: row.edge_id, key: 'edgeId', graph_version: row.graph_version, payload: row.edge_json }))
  ];
  return { nodes, edges, graph: graphRows(rows, state) };
}

async function journal(db, sessionId, revision) {
  const rows = await db.all(`SELECT revision, event_type, payload_json FROM topology_session_events
    WHERE session_id = ? AND topology = 'rhizome' ORDER BY revision`, sessionId);
  if (!Number.isSafeInteger(revision) || revision < 1 || rows.length !== revision
    || rows.some((row, index) => row.revision !== index + 1)) {
    fail('RHIZOME_SNAPSHOT_JOURNAL_GAP', 'Rhizome revision journal is incomplete.');
  }
  for (const row of rows) parse(row.payload_json, 'Rhizome event');
  return rows;
}

function variantEvidence(input) {
  const { variant, state, graph, events } = input;
  const fields = VARIANT_FIELDS[variant];
  const stateHashes = Object.fromEntries(fields.map((field) => [field, digest(state[field] ?? null)]));
  const eventTypes = [...new Set(events.map((event) => event.event_type))].sort();
  const kinds = {
    exploratory: ['NEED_REGISTERED', 'NODE_ADDED'], routing: ['ROUTE_OUTCOME_RECORDED'],
    growth: ['NODE_ADDED', 'EDGE_ADDED'], resilient: ['ROUTE_REPAIRED'],
    sparse: ['STRUCTURE_PRUNED'], persistent: ['BRANCH_LEASE_ACQUIRE', 'BRANCH_LEASE_RENEW'],
    ephemeral: ['SESSION_CLOSED'], small_world: ['SMALL_WORLD_SHORTCUT_ADMITTED'],
    private: ['ROUTE_QUARANTINED'], cross_representation: ['BRIDGE_INTEGRATED'],
    procedural: ['PROCEDURE_PROPAGATED'], self_healing: ['ROUTE_REPAIRED']
  };
  return { variant, selectionHash: digest(state.variantSelection ?? null), stateHashes,
    graphHash: digest(graph), relevantEvents: eventTypes.filter((type) => kinds[variant].includes(type)) };
}

async function capture(context) {
  const { row, state } = await boundSession(context);
  const variant = selectedVariant(context, state);
  const { nodes, edges, graph } = await persistedGraph(context.db, context.sessionId, state);
  const events = await journal(context.db, context.sessionId, row.revision);
  const current = await context.db.get("SELECT state_json, revision FROM topology_sessions WHERE id = ? AND topology = 'rhizome'", context.sessionId);
  if (!current || current.revision !== row.revision || current.state_json !== row.state_json) {
    fail('RHIZOME_SNAPSHOT_CONCURRENT_CHANGE', 'Rhizome session changed during capture.');
  }
  const boundary = { revision: row.revision, graphVersion: state.graphVersion, status: state.status,
    missionIdHash: digest(state.missionId), variant };
  const components = [
    { id: 'session-state', status: 'reference-only', reference: { sha256: digest(state), revision: row.revision } },
    { id: 'graph', status: 'reference-only', reference: { sha256: digest(graph), version: state.graphVersion,
      nodeCount: nodes.length, edgeCount: edges.length } },
    { id: 'event-journal', status: 'reference-only', reference: { sha256: digest(events), count: events.length } },
    { id: 'variant-policy', status: 'captured', payload: variantEvidence({ variant, state, graph, events }) }
  ];
  return { policyVersion: POLICY_VERSION, boundary, components };
}

async function preflightRestore(context, manifest) {
  const { state } = await boundSession(context);
  const activeLease = (state.leases || []).some((lease) => Date.parse(lease.expiresAt) > Date.now());
  if (!QUIESCENT.has(state.status) || activeLease) {
    return { ok: false, reasons: ['Rhizome session must be dormant or quarantined without active branch leases.'] };
  }
  return { ok: true, plan: { type: 'verify-only', variant: manifest.boundary.variant,
    graphVersion: manifest.boundary.graphVersion, journalRevision: manifest.boundary.revision,
    note: 'Collective graph, routing, leases and external capabilities are verified, not rolled back.' } };
}

module.exports = { capture, preflightRestore };
