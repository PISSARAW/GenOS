'use strict';

function revalidateToolCall(context) {
  return context.scopedReplay
    ? context.validateScopedReplayArguments(context.args || {})
    : context.validateToolArguments(context.toolName, context.args || {});
}

module.exports = { revalidateToolCall };
