'use strict';

function mainValue1(__genosValueScope1) {
  return (0, __genosValueScope1.Boolean)(__genosValueScope1.observed) && __genosValueScope1.JSON.stringify({ type: __genosValueScope1.observed.type, locus: __genosValueScope1.observed.locus,
      senderAgentId: __genosValueScope1.observed.senderAgentId, semanticRefs: __genosValueScope1.observed.semanticRefs }) === __genosValueScope1.JSON.stringify(__genosValueScope1.EXPECTED)
      && __genosValueScope1.observed.localOnly === false && __genosValueScope1.observed.isRepellent === true;
}

module.exports = { mainValue1 };
