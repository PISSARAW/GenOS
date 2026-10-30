'use strict';

function revalidateToolCallValue1(__genosValueScope1) {
  return __genosValueScope1.scopedReplay
    ? (0, __genosValueScope1.validateScopedReplayArguments)(__genosValueScope1.args || {})
    : (0, __genosValueScope1.validateToolArguments)(__genosValueScope1.toolName, __genosValueScope1.args || {});
}

module.exports = { revalidateToolCallValue1 };
