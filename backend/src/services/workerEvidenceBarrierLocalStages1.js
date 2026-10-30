'use strict';

function runEvidenceStageStage1(__genosStageScope1) {
if (!__genosStageScope1.ctx.codeWorker && __genosStageScope1.evidenceReport.outcome === 'unresolved') {
    return { value: ( { consumed: __genosStageScope1.consumed, proposal: __genosStageScope1.proposal, evidenceReport: __genosStageScope1.evidenceReport,
      proof: null, noAnswer: false, unresolved: true }) };
  }
}

function runGenerationStageStage2(__genosStageScope2) {
if (__genosStageScope2.codeWorker && __genosStageScope2.codeRepairPlans) {
    __genosStageScope2.result.text = __genosStageScope2.workerCodeTestRepair.applyRepairPlan(__genosStageScope2.result.text, __genosStageScope2.codeRepairPlans);
  }
}

function runEvidenceStageStage3(__genosStageScope3) {
if (__genosStageScope3.allocationValidation && !__genosStageScope3.allocationValidation.passed) {
    throw (0, __genosStageScope3.require)('./morphogenesis/biomeAllocationFeedback')
      .allocationFailure(__genosStageScope3.evidenceReport.claims?.[0]?.statement, __genosStageScope3.allocationValidation.issues);
  }
}

module.exports = { runEvidenceStageStage1, runGenerationStageStage2, runEvidenceStageStage3 };
