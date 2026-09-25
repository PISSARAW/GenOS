'use strict';

const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const topology = require('../../backend/src/services/topologyMcpTools');

async function operate(sessionId, operation, args = {}) {
  const result = await topology.operateTopologySession({ session_id: sessionId, operation, ...args });
  if (!result.success) throw new Error(`${operation}: ${result.error || 'operation refused'}`);
  return result;
}

function allocatedBudget(allocations) {
  let total = 0;
  for (const allocation of allocations || []) total += allocation.budget;
  return total;
}

function syncValuesVerified(fields) {
  return fields['tasks.t1.status'] === 'done'
    && fields['tasks.t2.status'] === 'open'
    && fields['tasks.t2.assignee'] === 'worker-two'
    && fields['tasks.t3.status'] === 'open'
    && fields['tasks.t4.status'] === 'open';
}

function syncProbeVerified(input) {
  return input.valuesVerified && input.invariantEvidence
    && input.ids.has('tm-finish-t1') && input.ids.has('tm-assign-t2')
    && input.writeCount === 6;
}

function hasPassingInvariantReceipt(writes) {
  return writes.some((write) => (write.invariants || []).some((receipt) =>
    receipt.invariantId === 'task_status_is_present' && receipt.passed === true));
}

function refreshSyncReceipt(receipt) {
  if (!receipt?.after) return receipt;
  const fields = receipt.after.shared?.sharedFields || {};
  const ids = new Set((receipt.history?.operations || []).map((item) => item.opId));
  receipt.valuesVerified = syncValuesVerified(fields);
  receipt.invariantEvidence = Object.hasOwn(receipt.invariants?.definitions || {}, 'task_status_is_present')
    && hasPassingInvariantReceipt(receipt.writes || []);
  receipt.verified = syncProbeVerified({ valuesVerified: receipt.valuesVerified,
    invariantEvidence: receipt.invariantEvidence, ids, writeCount: receipt.writes?.length || 0 });
  return receipt;
}

async function probeBiome(sessionId) {
  const before = await operate(sessionId, 'snapshot');
  const allocation = await operate(sessionId, 'allocate', {
    populations: [{ id: 'niche-biome', demand: 2, priority: 1 },
      { id: 'niche-niche', demand: 2, priority: 1 },
      { id: 'niche-espece', demand: 2, priority: 1 }], total_budget: 6
  });
  const forage = await operate(sessionId, 'forage', {
    patch_history: [{ patchId: 'niche-biome', return: 2 }],
    current_patch_id: 'niche-biome', current_marginal_return: 0.2,
    alternative_patch: 'niche-niche'
  });
  const after = await operate(sessionId, 'snapshot');
  return { before, allocation, forage, after,
    verified: allocatedBudget(allocation.allocations) === 6
      && after.version > before.version };
}

async function probeSyncytium(sessionId) {
  const before = await operate(sessionId, 'snapshot');
  const writes = [];
  for (const task of ['t1', 't2', 't3', 't4']) {
    writes.push(await operate(sessionId, 'apply', { op: {
      opId: `tm-open-${task}`, actorId: 'campaign-setup',
      kind: { type: 'set_field', key: `tasks.${task}.status`, value: 'open' }
    } }));
  }
  for (const [opId, actorId, key, value] of [
    ['tm-finish-t1', 'worker-one', 'tasks.t1.status', 'done'],
    ['tm-assign-t2', 'worker-two', 'tasks.t2.assignee', 'worker-two']
  ]) {
    writes.push(await operate(sessionId, 'apply', { op: {
      opId, actorId, kind: { type: 'set_field', key, value }
    } }));
  }
  const after = await operate(sessionId, 'snapshot');
  const history = await operate(sessionId, 'history');
  const invariants = await operate(sessionId, 'invariants');
  const ids = new Set((history.operations || []).map((item) => item.opId));
  const fields = after.shared?.sharedFields || {};
  const valuesVerified = syncValuesVerified(fields);
  const invariantEvidence = Object.hasOwn(invariants.definitions || {}, 'task_status_is_present')
    && hasPassingInvariantReceipt(writes);
  return { before, writes, after, history, invariants,
    valuesVerified, invariantEvidence,
    verified: syncProbeVerified({ valuesVerified, invariantEvidence, ids, writeCount: writes.length }) };
}

async function probeRhizome(sessionId) {
  const before = await operate(sessionId, 'snapshot');
  const nodes = [
    { nodeId: 'json-parser', kind: 'AGENT', capabilities: ['json_parse'], state: 'ACTIVE' },
    { nodeId: 'schema-validator', kind: 'AGENT', capabilities: ['json_schema_validate'], state: 'ACTIVE' },
    { nodeId: 'error-explainer', kind: 'AGENT', capabilities: ['json_error_explain'], state: 'ACTIVE' }
  ];
  const edges = [
    { edgeId: 'parser-validator', from: 'json-parser', to: 'schema-validator', relation: 'ROUTES_TO', status: 'ACTIVE' },
    { edgeId: 'validator-explainer', from: 'schema-validator', to: 'error-explainer', relation: 'ROUTES_TO', status: 'ACTIVE' }
  ];
  for (const node of nodes) await operate(sessionId, 'add_node', { node });
  for (const edge of edges) await operate(sessionId, 'add_edge', { edge });
  const deposit = await operate(sessionId, 'deposit', {
    marker: 'route:capability/json_schema_validate', amount: 2,
    capability: 'json_schema_validate'
  });
  const route = await operate(sessionId, 'route', {
    need: { needId: 'tm-route-1', capability: 'json_schema_validate', input: { ok: true } }
  });
  const after = await operate(sessionId, 'snapshot');
  return { before, nodes, edges, deposit, route, after,
    verified: route.selected === true && route.route?.nodeIds?.includes('schema-validator')
      && route.route?.edgeIds?.length > 0 && after.graph?.nodes?.length >= 3 };
}

function loadEnvironment() {
  try { process.loadEnvFile(path.resolve(__dirname, '../../.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function findSessionId(db, name) {
  const topology = name.replace('topologie-', '');
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topology_sessions'");
  if (!table) return null;
  const row = await db.get(
    'SELECT id FROM topology_sessions WHERE topology = ? ORDER BY updated_at DESC LIMIT 1',
    topology
  );
  return row?.id || null;
}

async function probeMission({ name, probe, results, receipts, db }) {
  const mission = results.missions.find((item) => item.name === name);
  const sessionId = mission?.sessionId || await findSessionId(db, name);
  if (!sessionId) return { verified: false, error: 'session_id missing', blockedBy: mission?.lifecycle || 'mission_receipt_missing' };
  if (receipts[name]) {
    if (name === 'topologie-syncytium') refreshSyncReceipt(receipts[name]);
    return receipts[name];
  }
  try { return await probe(sessionId); }
  catch (error) { return { verified: false, error: error.message }; }
}

async function refreshWorkers(db, results, receipts) {
  for (const mission of results.missions) {
    if (!mission.orchestratorId) continue;
    mission.workers = await db.all(
      "SELECT id, status FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' ORDER BY id",
      mission.orchestratorId
    );
    mission.sessionProbeVerified = receipts[mission.name]?.verified ?? null;
  }
}

async function main() {
  loadEnvironment();
  const output = path.resolve(process.argv[2] || '');
  const results = JSON.parse(fs.readFileSync(path.join(output, 'campaign-results.json'), 'utf8'));
  const probes = [
    ['topologie-biome', probeBiome],
    ['topologie-syncytium', probeSyncytium],
    ['topologie-rhizome', probeRhizome]
  ];
  const receiptPath = path.join(output, 'session-probes.json');
  const receipts = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : {};
  const db = await getDatabase();
  try {
    for (const [name, probe] of probes) {
      receipts[name] = await probeMission({ name, probe, results, receipts, db });
      fs.writeFileSync(receiptPath, JSON.stringify(receipts, null, 2));
      process.stdout.write(`${name}: ${receipts[name].verified ? 'verified' : 'unverified'}\n`);
    }
    await refreshWorkers(db, results, receipts);
    results.qualification = 'experimental';
    fs.writeFileSync(path.join(output, 'campaign-results.json'), JSON.stringify(results, null, 2));
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
