'use strict';

const { digest } = require('./trinityProvenanceValues');

function build({ mission, proposal }) {
  const tests = proposal.tests || [];
  if (proposal.testStatus !== 'passed' || !tests.length || tests.some(test => test.exitCode !== 0)
    || !proposal.testExecutionReceipt?.receiptHash || proposal.changedFiles.length) {
    throw Object.assign(new Error('Review requires passing executed tests, an execution receipt and zero changes.'), {
      code: 'WORKER_CODE_EVIDENCE_INCOMPLETE' });
  }
  const evidence = tests.map(test => `genos://code-test/${digest(test)}`);
  evidence.push(`genos://code-test-execution/${proposal.testExecutionReceipt.receiptHash}`);
  const content = { testedClaim: 'The delegated snapshot passes the executed test commands.',
    verificationMethod: 'executed_read_only_snapshot_tests', verdict: 'accept',
    reproductionSteps: tests.map(test => test.command), evidence,
    snapshot: mission.delegatedReviewSnapshot || null };
  return { outcome: 'success', claims: [{ statement: content.testedClaim, evidence }], uncertainties: [], tests,
    workerArtifact: { type: 'verification_report', content, provenance: { sourceRefs: evidence } } };
}

module.exports = { build };
