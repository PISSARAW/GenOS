'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.decision.scope === 'GLOBAL_BROADCAST'
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.recipients) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED.recipients)
      && !__genosValueScope1.observed.recipients.includes('agent-d')
      && new __genosValueScope1.Set(__genosValueScope1.observed.recipients).size === __genosValueScope1.observed.recipients.length
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.acknowledgements) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED.recipients)
      && __genosValueScope1.outcome.grounding.satisfied
      && __genosValueScope1.JSON.stringify(__genosValueScope1.observed.semanticRefs) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED.semanticRefs);
}

module.exports = { mainValue1 };
