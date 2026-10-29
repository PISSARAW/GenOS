'use strict';

const { digest } = require('../../src/services/biologicalIntegrity');

function record(input) {
  const binding = { schema: 'test-binding/v1', runId: input.runId,
    missionId: input.missionId, workerId: input.workerId };
  const event = { id: input.eventId || `event-${input.runId}`, eventType: 'EVIDENCE_REPORT',
    payload: { executionRunId: input.runId, evidenceReport: input.report } };
  const eventHash = digest(event);
  const evidence = { report: input.report, noAnswerProof: null, terminalEvent: 'EVIDENCE_REPORT',
    observations: [eventHash], hash: digest({ report: input.report, proof: null }) };
  const receipt = { schema: 'test-receipt/v1', receiptId: `receipt-${input.runId}`,
    runId: input.runId, missionId: input.missionId, workerId: input.workerId,
    bindingHash: digest(binding), result: { status: 'completed', verified: true }, evidence };
  return {
    bindingRow: { run_id: input.runId, mission_id: input.missionId, agent_id: input.workerId,
      binding_hash: digest(binding), binding_json: JSON.stringify(binding) },
    receiptRow: { receipt_id: receipt.receiptId, run_id: input.runId, mission_id: input.missionId,
      payload_hash: digest(receipt), receipt_json: JSON.stringify(receipt) },
    observationRow: { run_id: input.runId, event_key: event.id, event_hash: eventHash,
      event_json: JSON.stringify(event), applied: 1 }
  };
}

function database(records, statuses = {}) {
  return {
    exec: async () => undefined,
    get: async (query, ...values) => get({ records, statuses, query, values }),
    all: async (query, first, second) => all({ records, query, first, second })
  };
}

function get(input) {
  const { records, statuses, query, values } = input;
  const [value] = values;
  if (query.includes('FROM agents')) return { status: statuses[value] || 'completed' };
  if (query.includes('FROM biological_worker_bindings')) return findBinding(records, values);
  if (query.includes('FROM biological_worker_receipts')) {
    return records.find((item) => item.receiptRow.run_id === value)?.receiptRow || null;
  }
  if (query.includes("name = 'biological_worker_receipts'")) return { name: 'biological_worker_receipts' };
  if (query.includes("name = 'morph_risk_nodes'")) return null;
  if (query.includes('telemetry_events')) throw new Error('UNSCOPED_TELEMETRY_READ');
  return null;
}

function findBinding(records, values) {
  const [missionId, workerId, runId] = values;
  return records.find((item) => item.bindingRow.mission_id === missionId
    && item.bindingRow.agent_id === workerId
    && item.bindingRow.run_id === runId)?.bindingRow || null;
}

function all(input) {
  const { records, query, first, second } = input;
  if (query.includes('FROM biological_worker_bindings')) {
    return records.filter((item) => item.bindingRow.mission_id === first
      && item.bindingRow.agent_id === second).map((item) => item.bindingRow).slice(0, 2);
  }
  if (query.includes('FROM biological_worker_observations')) {
    return records.filter((item) => item.observationRow.run_id === first)
      .map((item) => item.observationRow);
  }
  if (query.includes('telemetry_events')) throw new Error('UNSCOPED_TELEMETRY_READ');
  return [];
}

module.exports = { record, database };
