'use strict';

const workerStore = require('../biologicalWorkerStore');
const { digest } = require('../evidenceContractService');
const { normalizeRhizomeSession } = require('../rhizome/contracts/rhizomeSession');

function result(status, reason, extra = {}) {
  return { status, ...(reason ? { reason } : {}), ...extra };
}

function requestedSessionId(context = {}) {
  return context.sessionId || context.rhizomeId
    || context.output?.sessionId || context.output?.rhizomeId || null;
}

function parse(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}

async function sessionRow(db, sessionId) {
  const row = await db.get(`SELECT topology, state_json, revision
    FROM topology_sessions WHERE id = ?`, sessionId);
  if (!row) return result('partial', 'rhizome_session_missing');
  if (row.topology !== 'rhizome') return result('failed', 'rhizome_topology_scope_mismatch');
  const state = parse(row.state_json);
  if (!state) return result('failed', 'rhizome_session_state_invalid');
  return result('loaded', null, { state, revision: Number(row.revision) });
}

function identityIssue(loaded, input) {
  if (loaded.state.rhizomeId !== input.sessionId) {
    return result('failed', 'rhizome_session_identity_mismatch');
  }
  if (loaded.state.missionId !== input.missionId) {
    return result('failed', 'rhizome_mission_scope_mismatch');
  }
  if (!Number.isSafeInteger(loaded.revision) || loaded.revision < 1) {
    return result('failed', 'rhizome_session_revision_invalid');
  }
  return null;
}

function graphRowsIssue(rows, state) {
  if (!rows.nodes.length) return result('partial', 'rhizome_graph_missing');
  const all = [...rows.nodes, ...rows.edges];
  if (all.some((row) => Number(row.graph_version) !== state.graphVersion)) {
    return result('failed', 'rhizome_graph_version_mismatch');
  }
  const nodes = rows.nodes.map((row) => parse(row.node_json));
  const edges = rows.edges.map((row) => parse(row.edge_json));
  if (nodes.some((node) => !node) || edges.some((edge) => !edge)) {
    return result('failed', 'rhizome_graph_state_invalid');
  }
  try {
    const session = normalizeRhizomeSession({ ...state, nodes, edges });
    return result('read', null, { session,
      graph: { nodes: session.nodes, edges: session.edges,
        graphVersion: session.graphVersion } });
  } catch (_) { return result('failed', 'rhizome_graph_state_invalid'); }
}

async function graphState(db, sessionId, state) {
  const nodes = await db.all(`SELECT node_id, graph_version, node_json
    FROM rhizome_nodes WHERE session_id = ? ORDER BY node_id`, sessionId);
  const edges = await db.all(`SELECT edge_id, graph_version, edge_json
    FROM rhizome_edges WHERE session_id = ? ORDER BY edge_id`, sessionId);
  return graphRowsIssue({ nodes, edges }, state);
}

function journalIssue(rows, revision) {
  if (rows.length !== revision) return result('failed', 'rhizome_event_journal_gap');
  const events = [];
  for (const [index, row] of rows.entries()) {
    const payload = parse(row.payload_json);
    if (Number(row.revision) !== index + 1 || !payload) {
      return result('failed', 'rhizome_event_journal_integrity_failed');
    }
    events.push({ revision: Number(row.revision), type: row.event_type, payload });
  }
  return result('read', null, { events });
}

async function journal(db, sessionId, revision) {
  const rows = await db.all(`SELECT revision, event_type, payload_json
    FROM topology_session_events WHERE session_id = ? AND topology = 'rhizome'
    ORDER BY revision`, sessionId);
  return journalIssue(rows, revision);
}

function proofRunId(proof) {
  return proof?.content?.runId || proof?.content?.executionRunId
    || proof?.content?.correlation?.runId || null;
}

function correlatedRun(binding, receipt, runId) {
  return binding.runId === runId && receipt.runId === runId
    && binding.missionId === receipt.missionId
    && binding.workerId === receipt.workerId;
}

function proofMatchesReceipt(proof, receipt) {
  return digest(receipt) === proof.reference
    && digest(proof.content) === proof.reference;
}

async function persistedRun(db, proof) {
  const runId = proofRunId(proof);
  if (!runId) return result('failed', 'rhizome_worker_run_proof_invalid');
  const bindingRow = await db.get(
    'SELECT * FROM biological_worker_bindings WHERE run_id = ?', runId);
  const receiptRow = await db.get(
    'SELECT * FROM biological_worker_receipts WHERE run_id = ?', runId);
  if (!bindingRow || !receiptRow) {
    return result('failed', 'rhizome_worker_run_scope_mismatch');
  }
  try {
    const binding = workerStore.verifiedJson(bindingRow, 'binding_json');
    const receipt = workerStore.verifiedJson(receiptRow, 'receipt_json');
    if (!correlatedRun(binding, receipt, runId)
        || !proofMatchesReceipt(proof, receipt)) {
      return result('failed', 'rhizome_worker_run_proof_invalid');
    }
    return result('read', null, { run: { binding, receipt } });
  } catch (_) { return result('failed', 'rhizome_worker_run_proof_invalid'); }
}

async function runRecords(db, evidence = {}) {
  const proofs = Array.isArray(evidence.evidenceProofs) ? evidence.evidenceProofs : [];
  if (!proofs.length) return result('read', null, { runs: [] });
  await workerStore.ensure(db);
  const runs = [];
  for (const proof of proofs) {
    const loaded = await persistedRun(db, proof);
    if (loaded.status !== 'read') return loaded;
    runs.push(loaded.run);
  }
  return result('read', null, { runs });
}

async function read(input = {}) {
  const { db, missionId, context = {}, evidence = {} } = input;
  const sessionId = requestedSessionId(context);
  if (!db || !missionId || !sessionId) return result('partial', 'rhizome_scope_missing');
  const loaded = await sessionRow(db, sessionId);
  if (loaded.status !== 'loaded') return loaded;
  const identity = identityIssue(loaded, { sessionId, missionId });
  if (identity) return identity;
  const graph = await graphState(db, sessionId, loaded.state);
  if (graph.status !== 'read') return graph;
  const events = await journal(db, sessionId, loaded.revision);
  if (events.status !== 'read') return events;
  const runs = await runRecords(db, evidence);
  if (runs.status !== 'read') return runs;
  return result('read', null, { sessionId, revision: loaded.revision,
    session: graph.session, graph: graph.graph, events: events.events,
    runs: runs.runs, output: context.output || {} });
}

module.exports = { read, requestedSessionId };
