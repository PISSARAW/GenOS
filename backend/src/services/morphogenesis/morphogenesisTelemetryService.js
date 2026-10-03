'use strict';

function transitionCommitted(result) {
  return result?.applied === true || result?.committed === true || result?.receipt?.committed === true;
}

function buildMorphogenesisEvent(result, orchestratorId) {
  const committed = transitionCommitted(result);
  const topology = result?.topology || null;
  const transitionId = result?.transitionId || result?.receipt?.transitionId || null;
  return {
    eventType: committed ? 'MORPHOGENESIS_COMPLETED' : 'MORPHOGENESIS_PROPOSED',
    agentId: orchestratorId,
    action: committed ? 'MORPHO_COMMITTED' : 'MORPHO_PROPOSED',
    detail: committed
      ? `Committed ${topology || 'unresolved'} morphology with ${result?.agents?.length || 0} agents`
      : `Morphology ${topology || 'unresolved'} evaluated without a commit receipt`,
    payload: { topology, committed, transitionId, commitId: result?.commitId || null },
    severity: committed ? 'info' : 'warning'
  };
}

module.exports = { buildMorphogenesisEvent, transitionCommitted };
