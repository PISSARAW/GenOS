'use strict';

function transitionCommitted(result) {
  return result?.applied === true || result?.committed === true || result?.receipt?.committed === true;
}

function buildMorphogenesisEvent(result, orchestratorId) {
  const committed = transitionCommitted(result);
  const topology = result?.topology || null;
  const transitionId = result?.transitionId || result?.receipt?.transitionId || null;
  const payload = { topology, committed, transitionId, commitId: result?.commitId || null };
  if (result?.variantId) payload.variantId = result.variantId;
  return {
    eventType: committed ? 'MORPHOGENESIS_COMPLETED' : 'MORPHOGENESIS_PROPOSED',
    agentId: orchestratorId,
    action: committed ? 'MORPHO_COMMITTED' : 'MORPHO_PROPOSED',
    detail: committed
      ? `Committed ${topology || 'unresolved'} morphology with ${result?.agents?.length || 0} agents`
      : `Morphology ${topology || 'unresolved'} evaluated without a commit receipt`,
    payload,
    severity: committed ? 'info' : 'warning'
  };
}

module.exports = { buildMorphogenesisEvent, transitionCommitted };
