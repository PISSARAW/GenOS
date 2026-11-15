'use strict';

function planContinuationStep1(context) {
if (context.admission.status !== 'admitted' && context.admission.status !== 'not_applicable') {
    return { value: ( { ...context.result, adapted: false, reason: `strategy_admission_denied:${context.admission.reason}`, admission: context.admission }) };
  }
}

function planContinuationStep2(context) {
if (context.result.receipt) context.result.receipt.strategyAdmission = context.admission;
}

function planContinuationStep3(context) {
if (context.admission.status === 'admitted') context.result.plan = context.admission.actualPlan;
}

module.exports = { planContinuationStep1, planContinuationStep2, planContinuationStep3 };
