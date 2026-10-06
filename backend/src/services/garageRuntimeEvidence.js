'use strict';

const { hash } = require('./garageRequests');

async function receipt(db, row) {
  await require('./garageRequests').scope(db, JSON.parse(row.request_json));
  const binding = JSON.parse(row.result_json || '{}');
  if (!binding.runId) return null;
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ? AND agent_id = ?', binding.runId, row.worker_id);
  if (!run || run.status !== 'completed') return null;
  const events = await db.all(`SELECT payload_json FROM telemetry_events WHERE agent_id = ?
    AND event_type = 'AGENT_COMPLETED' AND json_extract(payload_json, '$.executionRunId') = ?
    ORDER BY id DESC LIMIT 10`, row.worker_id, run.id);
  const worker = await db.get('SELECT metadata_json, status FROM agents WHERE id = ?', row.worker_id);
  if (worker.status === 'quarantined') return null;
  const mission = JSON.parse(row.request_json);
  const workerContract = JSON.parse(worker.metadata_json || '{}').workerContract || mission.workerContract;
  for (const event of events) {
    const payload = JSON.parse(event.payload_json);
    try {
      require('./agents/workerArtifactContract').validateWorkerArtifact({ events: [{ evidenceReport: payload.evidenceReport }] },
        { ...mission, agentId: row.worker_id, workerContract });
      return resultReceipt(run, payload);
    } catch (_) { /* An invalid artifact cannot satisfy the receipt. */ }
  }
  return null;
}

module.exports = { receipt };
function resultReceipt(run, payload) {
  return { verified: true, runId: run.id, artifactHash: hash(payload.evidenceReport.workerArtifact),
    metrics: JSON.parse(run.metrics_json || '{}'), promotion: 'runtime_gate_passed' };
}
