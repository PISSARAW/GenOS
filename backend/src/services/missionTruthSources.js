'use strict';

const store = require('./biologicalWorkerStore');
const provenance = require('./gvxMissionProvenance');

async function events(db, agentId, settings) {
  const missionId = settings.missionId || null;
  if (missionId && !await db.get('SELECT 1 FROM mission_agents WHERE mission_id = ? AND agent_id = ?', missionId, agentId)) {
    throw new Error('TRUTH_GRAPH_MISSION_SCOPE_MISMATCH');
  }
  const filter = missionId ? 'agent_id IN (SELECT agent_id FROM mission_agents WHERE mission_id = ?)' : 'agent_id = ?';
  const rows = await db.all(`SELECT id, agent_id, event_type, payload_json, created_at FROM telemetry_events
    WHERE ${filter} AND event_type IN ('ORCHESTRATION_ACTION_EXECUTED','ORCHESTRATION_ACTION_FAILED','EVIDENCE_REPORT')
    AND created_at >= ? ORDER BY created_at DESC LIMIT 200`, missionId || agentId, settings.since);
  if (!missionId) return rows;
  return missionEvents(db, rows, missionId);
}

async function missionEvents(db, rows, missionId) {
  const selected = [];
  const cache = new Map();
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json || '{}');
    const runId = payload.executionRunId;
    if (!runId) continue;
    const key = `${row.agent_id}:${runId}`;
    if (!cache.has(key)) cache.set(key, await provenance.readRun(db, {
      runId, scope: await provenance.agentScope(db, row.agent_id) }));
    if (cache.get(key)?.mission.id === missionId) selected.push(row);
  }
  return selected;
}

async function appendReceipts(db, request, graph) {
  const exists = await db.get("SELECT name FROM sqlite_master WHERE name='biological_worker_bindings'");
  if (!exists) return;
  const filter = request.missionId ? 'mission_id = ?' : 'agent_id = ?';
  const rows = await db.all(`SELECT run_id FROM biological_worker_bindings WHERE ${filter}
    ORDER BY rowid DESC LIMIT 200`, request.missionId || request.agentId);
  for (const row of rows) await appendReceipt(db, row.run_id, graph);
}

async function appendReceipt(db, runId, graph) {
  const binding = await store.binding(db, runId);
  const scope = await provenance.agentScope(db, binding.workerId);
  const run = await provenance.readRun(db, { runId, scope });
  if (!run || run.workerBindingHash !== require('./biologicalIntegrity').digest(binding)) {
    throw new Error('TRUTH_GRAPH_RECEIPT_BINDING_MISMATCH');
  }
  const receipt = await store.receipt(db, runId);
  if (!receipt) return;
  const inspection = await require('./epistemic/nativeOracleInspection').inspect(db, { runId, agentId: binding.workerId });
  const verified = receipt.result.verified === true && inspection.status === 'accepted_at_decision';
  const id = `receipt_${runId}`;
  const statement = verified ? `Worker ${binding.workerId}: bounded postconditions verified.`
    : `Worker ${binding.workerId}: completion unverified; ${receipt.result.reason || receipt.result.status}.`;
  graph.nodes.push({ id, kind: 'execution_receipt', runId, workerId: binding.workerId,
    payloadHash: receipt.payloadHash, verified, oracleStatus: inspection.status });
  graph.nodes.push({ id: `receipt_claim_${runId}`, kind: 'claim', proposition: statement,
    outcome: verified ? 'success' : 'failure', sources: [id], evidence: 1, evidenceTexts: [statement] });
  graph.edges.push({ from: id, to: `receipt_claim_${runId}`, kind: 'supports' });
  if (verified) supportSealedReport(graph, receipt, id);
}

function supportSealedReport(graph, receipt, id) {
  const reportHash = require('./biologicalIntegrity').digest(receipt.evidence.report);
  for (const node of graph.nodes) {
    if (node.kind !== 'claim' || node.executionRunId !== receipt.runId || node.reportHash !== reportHash) continue;
    node.sources.push(id);
    graph.edges.push({ from: id, to: node.id, kind: 'supports' });
  }
}

module.exports = { events, appendReceipts };
