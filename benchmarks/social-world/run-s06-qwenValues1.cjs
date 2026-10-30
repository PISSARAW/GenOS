'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.JSON.stringify(__genosValueScope1.observed) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED)
      && __genosValueScope1.controlError?.code === 'AGENT_CONTROL_FORBIDDEN' && __genosValueScope1.bridgeTest.exitCode === 0;
}

module.exports = { mainValue1 };
