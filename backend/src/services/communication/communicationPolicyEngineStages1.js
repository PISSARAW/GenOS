'use strict';

async function decideCommunicationStage1(__genosStageScope1) {
if (__genosStageScope1.informed.length === 0 && (0, __genosStageScope1.stigmergyEligible)(__genosStageScope1.intent, __genosStageScope1.input)) {
    return { value: ( (0, __genosStageScope1.logAndDecide)(__genosStageScope1.input, await (0, __genosStageScope1.decideStigmergy)(__genosStageScope1.input, __genosStageScope1.intent, __genosStageScope1.refs))) };
  }
}

module.exports = { decideCommunicationStage1 };
