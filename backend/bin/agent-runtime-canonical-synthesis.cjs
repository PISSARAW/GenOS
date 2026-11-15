'use strict';

async function complete(state) {
  state.estimatedTokens = 0;
  state.exactTokens = 0;
  state.observedCostUsd = 0;
  state.tokenUsageObserved = true;
  state.costUsageObserved = true;
  state.emit({ eventType: 'AGENT_PLAN_CREATED', action: 'CANONICAL_SYNTHESIS',
    detail: 'Deterministic canonical synthesis accepted the completed worker dossiers.', status: 'running' });
  const ctx = require('./agent-runtime-close-context.cjs').buildCloseContext(state, 0, null);
  return require('./agent-runtime-close.cjs').handleRuntimeClose(ctx);
}

module.exports = { complete };
