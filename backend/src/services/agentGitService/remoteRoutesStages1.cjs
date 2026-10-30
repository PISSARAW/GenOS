'use strict';

function pullStage1(__genosStageScope1) {
if (!__genosStageScope1.agentId || __genosStageScope1.req.body?.sections) return { value: ( { success: false, error: 'A target agent and full-state pull are required.' }) };
}

function pullStage2(__genosStageScope2) {
if (!__genosStageScope2.tracked?.object_id || __genosStageScope2.objectId !== __genosStageScope2.tracked.object_id) {
    return { value: ( { success: false, error: 'Pull requires the current tracked remote tip.' }) };
  }
}

module.exports = { pullStage1, pullStage2 };
