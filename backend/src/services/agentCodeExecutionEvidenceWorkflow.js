'use strict';

function attestCodeTestResults(context) {
for (const claim of context.report.claims || []) {
      const evidence = context.Array.isArray(claim?.evidence) ? claim.evidence : [];
      const testEvidence = context.Array.isArray(context.test.evidenceRefs) ? context.test.evidenceRefs : [];
      const declaredRef = `genos://code-test/${context.require('./trinityProvenanceValues').digest(context.test)}`;
      const citesTest = testEvidence.some((reference) => evidence.includes(reference)) || evidence.includes(declaredRef);
      const describesTest = context.String(claim?.statement || '').toLowerCase().includes(context.expected);
      if (context.require('./agentCodeExecutionEvidenceRules.js').shouldAttachTestReceipt({ citesTest, describesTest, get evidence() { return evidence; }, receiptRef: context.receiptRef })) {
        claim.evidence = [...evidence, context.receiptRef];
      }
    }
}

module.exports = { attestCodeTestResults };
