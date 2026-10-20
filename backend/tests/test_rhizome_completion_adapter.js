'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const adapter = require('../src/services/topologyCompletionAdapters/rhizomeAdapter');
const { closureInput } = require('../src/services/topologyCompletionAdapters/dossier');
const { closeMission } = require('../src/services/missionClosureService');
const topologyStore = require('../src/services/topologySessionStore');
const workerStore = require('../src/services/biologicalWorkerStore');
const rhizomeStore = require('../src/services/rhizome/rhizomeStore');
const { normalizeCapabilityNode } = require('../src/services/rhizome/contracts/capabilityNode');
const { normalizeCapabilityEdge } = require('../src/services/rhizome/contracts/capabilityEdge');
const { digest } = require('../src/services/evidenceContractService');
const biological = require('../src/services/biologicalIntegrity');

const MISSION = 'mission-rhizome-closure';
const SESSION = 'rhizome-closure-session';
const WORKER = 'rhizome-worker-1';
const RUN = 'run-rhizome-worker-1';
const EVENT = 'worker-event-rhizome-1';

function node(nodeId, provenance = []) {
  return normalizeCapabilityNode({ nodeId, kind: 'AGENT', capabilities: [nodeId],
    inputs: [], outputs: [], evidenceRequirements: [], state: 'ACTIVE',
    reliability: 0.9, cost: 0, latency: 1, provenance });
}

function edge() {
  return normalizeCapabilityEdge({ edgeId: 'analysis-depends-on-source',
    from: 'source', to: 'analysis', relation: 'DEPENDS_ON', status: 'ACTIVE',
    compatibility: 1, conductivity: 0.8, successRate: 1,
    evidenceQuality: 1, reliability: 0.9, cost: 0, latency: 1,
    trailState: { positive: 1, negative: 0, verifiedFlow: 1 } });
}

function sessionState() {
  return { rhizomeId: SESSION, missionId: MISSION, scope: 'mission', graphVersion: 3,
    activeNeeds: [], openGaps: [], coordinationLoci: [], leases: [], repairScars: [],
    routeLineage: [], routeResults: [], growthLimits: {}, budgets: { growth: 1 },
    status: 'ACTIVE', variant: 'routing' };
}

function nativeOracle(overrides = {}) {
  return { schema: 'genos.native-oracle-receipt-reference/v1', eventId: 'oracle-event-1',
    hash: 'a'.repeat(64), acceptanceHash: 'b'.repeat(64),
    budgetAssessment: { satisfied: true }, ...overrides };
}

function receipt(options = {}) {
  const value = { schema: 'genos.worker-biological-execution-receipt/v1',
    receiptId: 'receipt-rhizome-worker-1', missionId: MISSION, runId: RUN,
    workerId: WORKER, result: { status: 'completed', verified: true } };
  if (options.oracle !== null) value.semanticVerification = options.oracle || nativeOracle();
  return value;
}

function branch() {
  return { workerId: WORKER, role: 'capability_offshoot', status: 'completed',
    answer: 'Capability analysis is complete.', evidenceEventId: EVENT };
}

function output(graph) {
  const branches = [branch()];
  return { status: 'completed', complete: true, sessionId: SESSION,
    graphVersion: graph.graphVersion, graph, branches, unexploredDependencies: [],
    answer: branches.map((item) => `## ${item.role}\n${item.answer}`).join('\n\n') };
}

async function seedTopology(db) {
  await topologyStore.ensureTable(db);
  await rhizomeStore.ensureGraphTables(db);
  const graph = { graphVersion: 3,
    nodes: [node('source'), node('analysis', [`telemetry-event:${EVENT}`])],
    edges: [edge()] };
  await db.run(`INSERT INTO topology_sessions
    (id, topology, variant_id, state_json, revision) VALUES (?, 'rhizome', 'routing', ?, 4)`,
  SESSION, JSON.stringify(sessionState()));
  for (const item of graph.nodes) {
    await db.run(`INSERT INTO rhizome_nodes
      (session_id, node_id, graph_version, node_json) VALUES (?, ?, 3, ?)`,
    SESSION, item.nodeId, JSON.stringify(item));
  }
  for (const item of graph.edges) {
    await db.run(`INSERT INTO rhizome_edges
      (session_id, edge_id, graph_version, edge_json) VALUES (?, ?, 3, ?)`,
    SESSION, item.edgeId, JSON.stringify(item));
  }
  const events = [
    ['SESSION_CREATED', { missionId: MISSION }],
    ['NODE_DISCOVERED', { nodeId: 'source' }],
    ['NODE_DISCOVERED', { nodeId: 'analysis' }],
    ['EDGE_CREATED', { edgeId: graph.edges[0].edgeId }]
  ];
  for (const [index, event] of events.entries()) {
    await db.run(`INSERT INTO topology_session_events
      (session_id, topology, revision, event_type, payload_json)
      VALUES (?, 'rhizome', ?, ?, ?)`, SESSION, index + 1, event[0],
    JSON.stringify(event[1]));
  }
  return graph;
}

async function seedRun(db, workerReceipt) {
  await workerStore.ensure(db);
  const binding = { schema: 'genos.worker-biological-binding/v1', runId: RUN,
    missionId: MISSION, workerId: WORKER };
  await db.run(`INSERT INTO biological_worker_bindings
    (run_id, mission_id, agent_id, binding_hash, binding_json) VALUES (?, ?, ?, ?, ?)`,
  RUN, MISSION, WORKER, biological.digest(binding), biological.encode(binding));
  await db.run(`INSERT INTO biological_worker_receipts
    (receipt_id, run_id, mission_id, payload_hash, receipt_json) VALUES (?, ?, ?, ?, ?)`,
  workerReceipt.receiptId, RUN, MISSION, biological.digest(workerReceipt),
  biological.encode(workerReceipt));
}

function adapterInput(db, graph, options = {}) {
  const workerReceipt = options.workerReceipt;
  const proof = workerReceipt && { reference: digest(workerReceipt), content: workerReceipt,
    source: 'biological_worker_receipts' };
  const member = { ...branch(), memberId: WORKER,
    evidenceRefs: proof ? [proof.reference] : [] };
  return { context: { db, mode: 'rhizome', missionId: options.missionId || MISSION,
    sessionId: SESSION, output: options.output || output(graph) },
  evidence: { members: [member], evidenceProofs: proof ? [proof] : [] } };
}

async function createFixture(options = {}) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const graph = await seedTopology(db);
  const workerReceipt = receipt(options);
  await seedRun(db, workerReceipt);
  return { db, graph, workerReceipt };
}

async function withFixture(test, options = {}) {
  const fixture = await createFixture(options);
  try { await test(fixture); } finally { await fixture.db.close(); }
}

async function nominal(fixture) {
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt }));
  assert.equal(dossier.topologyValidation.status, 'verified');
  assert.deepEqual(dossier.oracle.receipt.runIds, [RUN]);
  assert.equal(dossier.oracle.receipt.graphVersion, 3);
  const closed = closeMission(closureInput(dossier));
  assert.equal(closed.verdict, 'succeeded', JSON.stringify(closed));
}

async function foreignMissionFails(fixture) {
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt, missionId: 'mission-foreign' }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'failed', reasons: ['rhizome_mission_scope_mismatch'] });
}

async function missingStateIsPartial(fixture) {
  await fixture.db.run('DELETE FROM topology_sessions WHERE id = ?', SESSION);
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'partial', reasons: ['rhizome_session_missing'] });
}

async function missingPhaseIsPartial(fixture) {
  await fixture.db.run(`UPDATE topology_session_events SET event_type = 'TRAIL_DEPOSITED'
    WHERE session_id = ? AND event_type = 'NODE_DISCOVERED'`, SESSION);
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'partial', reasons: ['rhizome_discovery_phase_missing'] });
}

async function failedPhaseFails(fixture) {
  const failed = output(fixture.graph);
  failed.status = 'failed';
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt, output: failed }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'failed', reasons: ['rhizome_terminal_phase_failed'] });
}

async function missingProofIsPartial(fixture) {
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'partial', reasons: ['rhizome_worker_run_proof_missing'] });
}

async function alteredRunFails(fixture) {
  const altered = structuredClone(fixture.workerReceipt);
  altered.runId = 'run-foreign';
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: altered }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'failed', reasons: ['rhizome_worker_run_scope_mismatch'] });
}

async function alteredGraphFails(fixture) {
  const changed = output(structuredClone(fixture.graph));
  changed.graph.nodes[0].localContext = { altered: true };
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt, output: changed }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'failed', reasons: ['rhizome_graph_projection_mismatch'] });
}

async function missingOracleIsPartial(fixture) {
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'partial', reasons: ['rhizome_independent_oracle_missing'] });
}

async function alteredOracleFails(fixture) {
  const dossier = await adapter.build(adapterInput(fixture.db, fixture.graph, {
    workerReceipt: fixture.workerReceipt }));
  assert.deepEqual(dossier.topologyValidation,
    { status: 'failed', reasons: ['rhizome_independent_oracle_invalid'] });
}

async function run() {
  await withFixture(nominal);
  await withFixture(foreignMissionFails);
  await withFixture(missingStateIsPartial);
  await withFixture(missingPhaseIsPartial);
  await withFixture(failedPhaseFails);
  await withFixture(missingProofIsPartial);
  await withFixture(alteredRunFails);
  await withFixture(alteredGraphFails);
  await withFixture(missingOracleIsPartial, { oracle: null });
  await withFixture(alteredOracleFails, { oracle: nativeOracle({ hash: 'altered' }) });
  console.log('Rhizome completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
