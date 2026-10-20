'use strict';

const assert = require('node:assert/strict');
const evidence = require('../src/services/topology/topologyWorkerEvidence.cjs');

function persisted(workerId, overrides = {}) {
  return { valid: true, receipt: { workerId, runId: `run-${workerId}`,
    result: { status: 'completed', verified: true }, evidence: {
      report: { outcome: 'success', workerArtifact: { type: 'dossier',
        content: { claims: [{ statement: 'result', evidence: ['receipt:test'] }] },
        provenance: { sourceRefs: ['receipt:test'] } } }
    } }, event: { event: { id: `event-${workerId}` } }, ...overrides };
}

async function readsPersistedEvidence() {
  const reader = { async readEvidence(_db, input) { return persisted(input.member.workerId); } };
  const results = await evidence.readValidatedWorkerResults({ db: {}, missionId: 'mission-1',
    members: [{ workerId: 'worker-1', role: 'solver', workerKind: 'bounded_worker' }] }, reader);
  assert.equal(results.length, 1);
  assert.equal(results[0].executionRunId, 'run-worker-1');
  assert.equal(results[0].workerResultSource, 'biological_worker_receipts');
  assert.equal(results[0].evidenceReport.outcome, 'success');
}

async function rejectsUnverifiedEvidence() {
  const reader = { async readEvidence() {
    return persisted('worker-1', { receipt: { workerId: 'worker-1',
      result: { status: 'completed', verified: false }, evidence: {
        report: { outcome: 'success' }
      } } });
  } };
  await assert.rejects(() => evidence.readValidatedWorkerResults({ db: {},
    missionId: 'mission-1', members: [{ workerId: 'worker-1' }] }, reader),
  (error) => error.code === 'TOPOLOGY_WORKER_EVIDENCE_REQUIRED');
}

async function main() {
  await readsPersistedEvidence();
  await rejectsUnverifiedEvidence();
  process.stdout.write('Topology worker evidence: PASS\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
