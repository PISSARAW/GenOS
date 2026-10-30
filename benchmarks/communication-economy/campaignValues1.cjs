'use strict';

function assertMatchedValue1(__genosValueScope1) {
  return __genosValueScope1.trial.model !== __genosValueScope1.reference.model || __genosValueScope1.trial.provider !== __genosValueScope1.reference.provider
        || __genosValueScope1.JSON.stringify((0, __genosValueScope1.taskIds)(__genosValueScope1.trial)) !== __genosValueScope1.JSON.stringify((0, __genosValueScope1.taskIds)(__genosValueScope1.reference));
}

module.exports = { assertMatchedValue1 };
