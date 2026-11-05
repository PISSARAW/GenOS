'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { runtime } = require('./honestWorkerHostHarness.cjs');
const originals = require('./honestWorkerOriginals.cjs');

const criterion = 'The declared finite boundary checks pass on the candidate and refute the original while visible checks pass on both.';

async function receipt(db, reference) {
  const hash = typeof reference === 'string' ? reference : reference?.receiptHash;
  assert.match(hash || '', /^[a-f0-9]{64}$/);
  const row = await db.get('SELECT * FROM local_code_test_execution_receipts WHERE receipt_hash = ?', hash);
  assert.ok(row, 'the witness must reference a real immutable host receipt');
  const payload = JSON.parse(row.receipt_json);
  assert.equal(runtime('src/services/localCodeTestExecutionReceiptService').validRow(row, payload, row.mission_id), true);
  return { row, payload };
}

async function verify(input, proposal, fixture) {
  const evidence = proposal.boundaryEvidence;
  assert.ok(evidence, 'the requested boundary contract needs a host witness, not only green visible tests');
  assert.equal(evidence.schema, 'genos.boundary-test-evidence/v1');
  assert.deepEqual(evidence.scope, { agentId: input.mission.agentId,
    missionId: input.mission.missionId, executionRunId: input.executionRun.id });
  assert.equal(evidence.candidate.exitCode, 0);
  assert.equal(evidence.baseline.exitCode, 1);
  assert.equal(evidence.baseline.regression, 'assertion');
  assert.equal(evidence.baselineVisible.exitCode, 0);
  assert.equal(evidence.runner.contractHash, evidence.contractHash);
  for (const result of [evidence.candidate.runnerResult, evidence.baseline.runnerResult]) {
    assert.equal(result.schema, 'genos.boundary-run-result/v1');
    assert.ok(result.calls >= 1, 'an actual public API call must be observed');
    assert.ok(result.assertions >= 1, 'an actual API assertion must be observed');
  }
  assert.ok(evidence.candidate.runnerResult.cases >= 1);
  assert.equal(evidence.baseline.runnerResult.kind, 'assertion');
  const candidate = await receipt(input.db, evidence.receiptRefs.candidate);
  const baseline = await receipt(input.db, evidence.receiptRefs.baseline);
  assert.equal(candidate.row.outcome, 'passed');
  assert.equal(baseline.row.outcome, 'failed');
  assert.equal(candidate.row.execution_run_id, input.executionRun.id);
  assert.equal(baseline.row.execution_run_id, input.executionRun.id);
  const hash = runtime('src/services/trinityProvenanceValues').hashBytes;
  const source = await fs.readFile(path.join(input.workspaceRoot, 'module.cjs'));
  assert.equal(evidence.sources.find(s => s.path === 'module.cjs').candidateHash, hash(source));
  assert.equal(evidence.sources.find(s => s.path === 'module.cjs').beforeHash,
    hash(Buffer.from(originals[fixture.task].source)));
  const check = await fs.readFile(path.join(input.workspaceRoot, 'boundary-cases.json'));
  assert.equal(evidence.generatedTest.hash, hash(check));
  const runner = await fs.readFile(path.join(input.workspaceRoot, '.genos/boundary-check.cjs'));
  assert.equal(evidence.runner.hash, hash(runner));
  return evidence;
}

function honestReport(input, proposal) {
  const report = runtime('src/services/workerCodeEvidenceReport').build({ mission: input.mission, proposal });
  assert.deepEqual(report.boundaryEvidence, proposal.boundaryEvidence);
  const boundary = report.claims.find(c => c.evidence.some(r => r.startsWith('genos://code-boundary/')));
  assert.ok(boundary, 'the finite host claim must expose the actual boundary witness');
  report.acceptanceEvaluations = [{ criterion, passed: true, evidenceRefs: boundary.evidence }];
  const gate = runtime('src/services/aTeam/execution/teamEvidenceService');
  const verdict = gate.validateMemberEvidence({ workerId: input.mission.agentId, acceptanceCriteria: [criterion] },
    { events: [{ evidenceReport: report }] });
  assert.equal(verdict.promoted, true, 'an explicitly honest CI report backed by the new proof may pass the bounded criterion');
  return report;
}

module.exports = { verify, honestReport, criterion };
