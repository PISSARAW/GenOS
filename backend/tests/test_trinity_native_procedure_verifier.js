'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'trinity-native-procedure-test-secret';
const assert = require('node:assert/strict');
const { runProcedure } = require('../src/services/agents/deterministicWorkerProcedures');
const verifier = require('../src/services/trinityNativeProcedureVerifier');
const audit = require('../src/services/trinityEvidenceAudit');

async function main() {
  const procedure = { version: 1, methodId: 'lpt', parameters: {
    jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2
  } };
  const method = { version: 1, methodId: 'scoped_procedure', parameters: { procedure } };
  const computed = runProcedure(procedure);
  const world = { worldNumber: 1, agentId: 'native-lpt-agent', report: {
    workerArtifact: { methodContract: method,
      content: { result: computed.output, procedureReceipt: computed.receipt } },
    evidenceVector: { risk: 0, uncertainty: 0, constraintCoverage: 1, latency: 0.1 },
    evidenceVectorEvidence: { risk: ['worker-risk'], uncertainty: ['worker-uncertainty'],
      constraintCoverage: ['worker-constraint'], latency: ['worker-latency'] }
  } };
  const db = { get: async () => ({ id: 'run-1', status: 'completed', guardrail_reason: null,
    budget_json: JSON.stringify({ tokens: 1000 }), metrics_json: JSON.stringify({ tokens: 10 }),
    started_at: '2026-10-14T10:00:00.000Z', completed_at: '2026-10-14T10:00:01.000Z' }) };
  const [verified] = await verifier.verifyReports(db, [world]);
  const report = verified.report;
  assert.equal(report.nativeProcedureVerification.status, 'verified');
  assert.equal(audit.isVerifiedReceipt(report.evidence.at(-1).verificationReceipt), true);
  assert.deepEqual(Object.keys(report.evidenceVector).sort(), ['correctness', 'reproducibility', 'robustness']);
  assert.equal(report.evidenceVector.correctness, 1);
  assert.equal(report.evidenceVector.robustness, 0.5);
  assert.equal(report.evidenceVector.reproducibility, 1);
  assert.equal(report.evidenceVector.coverage, undefined);
  assert.equal(report.coverageReceipt, undefined);
  assert.equal(report.evidenceVector.risk, undefined);
  assert.equal(report.evidenceVector.uncertainty, undefined);
  assert.equal(report.evidenceVector.constraintCoverage, undefined);
  assert.equal(report.evidenceVector.latency, undefined);
  assert.equal(report.evidenceVectorEvidence.coverage, undefined);
  assert.equal(report.hardConstraintsPassed, undefined);
  for (const item of report.evidence) {
    if (item.verificationReceipt) assert.equal(audit.isVerifiedReceipt(item.verificationReceipt), true);
  }
  process.stdout.write('Trinity native procedure verifier: PASS\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
