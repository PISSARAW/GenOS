'use strict';

const defaultReader = require('./workerResultReader.cjs');

function evidenceError(workerId) {
  return Object.assign(new Error(`Topology worker '${workerId}' has no validated persisted evidence.`), {
    code: 'TOPOLOGY_WORKER_EVIDENCE_REQUIRED', workerId
  });
}

function reportFrom(evidence) {
  return evidence.receipt?.evidence?.report || null;
}

function completedReceipt(evidence, workerId) {
  const receipt = evidence.receipt;
  return evidence.valid === true && receipt?.workerId === workerId
    && receipt?.result?.status === 'completed'
    && receipt?.result?.verified === true;
}

function validatedResult(member, evidence) {
  const report = reportFrom(evidence);
  const workerId = String(member?.workerId || '').trim();
  const completed = completedReceipt(evidence, workerId)
    && report?.outcome === 'success';
  if (!completed) throw evidenceError(workerId);
  return { workerId, role: member.role || null, workerKind: member.workerKind || null,
    executionRunId: evidence.receipt.runId, terminalEvent: evidence.event?.event || null,
    nativeOracleRef: report.nativeOracleRef || null,
    workerResultSource: 'biological_worker_receipts', evidenceReport: report };
}

async function readValidatedWorkerResults(input, reader = defaultReader) {
  const members = Array.isArray(input?.members) ? input.members : [];
  const results = [];
  for (const member of members) {
    const evidence = await reader.readEvidence(input.db, {
      member, missionId: input.missionId
    });
    results.push(validatedResult(member, evidence));
  }
  return results;
}

module.exports = { readValidatedWorkerResults, validatedResult };
