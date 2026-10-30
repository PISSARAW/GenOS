'use strict';

function planContinuationStage1(__genosStageScope1) {
if (__genosStageScope1.admission.status !== 'admitted' && __genosStageScope1.admission.status !== 'not_applicable') {
    return { value: ( { ...__genosStageScope1.result, adapted: false, reason: `strategy_admission_denied:${__genosStageScope1.admission.reason}`, admission: __genosStageScope1.admission }) };
  }
}

function planContinuationStage2(__genosStageScope2) {
if (__genosStageScope2.result.receipt) __genosStageScope2.result.receipt.strategyAdmission = __genosStageScope2.admission;
}

function planContinuationStage3(__genosStageScope3) {
if (__genosStageScope3.admission.status === 'admitted') __genosStageScope3.result.plan = __genosStageScope3.admission.actualPlan;
}

module.exports = { planContinuationStage1, planContinuationStage2, planContinuationStage3 };
