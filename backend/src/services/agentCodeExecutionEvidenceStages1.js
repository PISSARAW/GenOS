'use strict';

function attestCodeTestResultsStage1(__genosStageScope1) {
for (const claim of __genosStageScope1.report.claims || []) {
      const evidence = __genosStageScope1.Array.isArray(claim?.evidence) ? claim.evidence : [];
      const testEvidence = __genosStageScope1.Array.isArray(__genosStageScope1.test.evidenceRefs) ? __genosStageScope1.test.evidenceRefs : [];
      const citesTest = testEvidence.some((reference) => evidence.includes(reference));
      const describesTest = (0, __genosStageScope1.String)(claim?.statement || '').toLowerCase().includes(__genosStageScope1.expected);
      if ((0, __genosStageScope1.require)('./agentCodeExecutionEvidenceValues1.js').attestCodeTestResultsValue1({ citesTest, describesTest, get evidence() { return evidence; }, receiptRef: __genosStageScope1.receiptRef })) {
        claim.evidence = [...evidence, __genosStageScope1.receiptRef];
      }
    }
}

module.exports = { attestCodeTestResultsStage1 };
