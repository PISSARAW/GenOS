'use strict';

function runEvidenceStageStep1(context) {
if (!context.ctx.codeWorker && context.evidenceReport.outcome === 'unresolved') {
    return { value: ( { consumed: context.consumed, proposal: context.proposal, evidenceReport: context.evidenceReport,
      proof: null, noAnswer: false, unresolved: true }) };
  }
}

function runGenerationStage(context) {
if (context.codeWorker && context.codeRepairPlans) {
    context.result.text = context.workerCodeTestRepair.applyRepairPlan(context.result.text, context.codeRepairPlans);
  }
}

function runEvidenceStageStep3(context) {
if (context.allocationValidation && !context.allocationValidation.passed) {
    throw context.require('./morphogenesis/biomeAllocationFeedback')
      .allocationFailure(context.evidenceReport.claims?.[0]?.statement, context.allocationValidation.issues);
  }
}

module.exports = { runEvidenceStageStep1, runGenerationStage, runEvidenceStageStep3 };
