'use strict';

const fs = require('node:fs');

async function runs(db, mission) {
  const provenance = require('../../backend/src/services/gvxMissionProvenance');
  const all = await db.all('SELECT * FROM strategy_execution_runs ORDER BY rowid');
  const records = [];
  for (const run of all) {
    const scope = await provenance.requireAgentScope(db, run.agent_id);
    const binding = await provenance.readRun(db, {runId: run.id, scope});
    if (binding?.mission.id !== mission.mission_id) continue;
    const receipt = await require('../../backend/src/services/biologicalWorkerStore').receipt(db, run.id);
    const oracle = await require('../../backend/src/services/epistemic/nativeOracleInspection')
      .inspect(db, {runId: run.id, agentId: run.agent_id}).catch(error => ({status: 'unavailable', error: error.message}));
    const observations = await require('../../backend/src/services/biologicalWorkerStore').observations(db, run.id);
    const reports = observations.filter(row => row.applied && row.event?.eventType === 'EVIDENCE_REPORT')
      .map(row => row.event.payload?.evidenceReport || row.event.evidenceReport || row.event.payload);
    const protocol = await require('../../backend/src/services/missionProtocols/context').load(db, run.id)
      .then(value => ({runId: value.runId, missionId: value.missionId, scope: value.scope,
        directory: value.directory, synapse: value.mission?.synapseContext || null}))
      .catch(error => ({error: error.message}));
    records.push({run, binding, receipt, oracle, reports, protocol});
  }
  return records;
}

async function collect(db, options) {
  const identity = JSON.parse(fs.readFileSync(options.directory + '/identity.json', 'utf8'));
  const rootRun = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', identity.agentId);
  const provenance = require('../../backend/src/services/gvxMissionProvenance');
  const binding = rootRun && await provenance.readRun(db, {runId: rootRun.id,
    scope: await provenance.requireAgentScope(db, identity.agentId)});
  if (!binding) return {success: false, reason: 'NO_SEALED_MISSION'};
  const mission = await db.get('SELECT * FROM missions WHERE mission_id=?', binding.mission.id);
  const records = await runs(db, mission);
  const compiler = require('../../backend/src/services/reportCompilerService');
  const graph = await compiler.buildTruthGraph(db, identity.agentId, {missionId: mission.mission_id});
  const workers = [...new Map(records.filter(row => row.run.agent_id !== identity.agentId)
    .map(row => [row.run.agent_id, row])).values()];
  const attempts = await db.all('SELECT * FROM model_attempt_ledger ORDER BY rowid');
  const usage = await db.all("SELECT * FROM usage_ledger WHERE category='model_inference' ORDER BY rowid");
  const protocolReceipts = await nativeProtocolReceipts(db, mission.mission_id);
  const events = await db.all('SELECT id,agent_id,event_type,action,detail,payload_json FROM telemetry_events ORDER BY id');
  const passed = workers.length === 3 && workers.every(row => row.run.status === 'completed'
    && row.receipt?.result.verified === true && row.oracle.status === 'accepted_at_decision'
    && !row.protocol.error) && graph.status === 'measured';
  return {schema: 'genos.full-runtime-receipt-export/v1', success: passed, identity,
    mission, records, attempts, usage, protocolReceipts,
    graph, compiledGraph: compiler.compileReport(graph), events};
}

async function nativeProtocolReceipts(db, missionId) {
  const rows = await db.all(`SELECT p.* FROM mission_protocol_receipts p
    JOIN mission_protocol_runs r ON r.run_id=p.run_id WHERE r.mission_id=? ORDER BY p.rowid`, missionId);
  return rows.map(row => {
    const receipt = JSON.parse(row.receipt_json);
    if (require('../../backend/src/services/evidenceProtocol/canonical').digest(receipt) !== row.receipt_digest) {
      throw Error('NATIVE_PROTOCOL_RECEIPT_DIGEST_MISMATCH');
    }
    return {runId: row.run_id, protocol: row.protocol, point: row.point, receipt, digest: row.receipt_digest};
  });
}

async function main() {
  const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  Object.assign(process.env, options.env, {GENOS_DB_BOOTSTRAP_SKIP: '1'});
  const database = require('../../backend/src/db');
  const db = await database.getDatabase();
  try {
    const result = await collect(db, options);
    fs.writeFileSync(options.directory + '/latest-receipts.json', JSON.stringify(result, null, 2));
  } finally {await database.closeDatabase();}
}

main().catch(error => {console.error(error); process.exitCode = 1;});
