'use strict';

function step(context) {
  context.tick += 1;
  const logical = context.input.baseTime + context.tick;
  return context.input.useWallClock ? Math.max(Date.now(), logical) : logical;
}
function executionFinished(context) {
  if (!context.input.useWallClock) return;
  context.input.nowMs = Math.max(context.input.nowMs, Date.now());
  context.timestamp = new Date(context.input.nowMs).toISOString();
}

module.exports = { step, executionFinished };
