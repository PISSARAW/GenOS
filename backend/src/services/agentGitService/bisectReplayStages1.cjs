'use strict';

function bisectReplayStage1(__genosStageScope1) {
if (!__genosStageScope1.baseline.pass || __genosStageScope1.terminal.pass) {
    return { value: ( { success: false, error: 'Good checkpoint must pass and bad checkpoint must fail.', probes: __genosStageScope1.probes }) };
  }
}

module.exports = { bisectReplayStage1 };
