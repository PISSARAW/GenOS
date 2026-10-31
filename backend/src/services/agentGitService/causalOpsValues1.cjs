'use strict';

function checkOutcomeInvariantsValue1(__genosValueScope1) {
  return __genosValueScope1.ids.size === __genosValueScope1.state.relations.length && __genosValueScope1.state.relations.every((row) =>
      row.source_agent_id !== row.target_agent_id && __genosValueScope1.Number.isFinite((0, __genosValueScope1.Number)(row.authority))
      && (0, __genosValueScope1.Number)(row.authority) >= 0 && (0, __genosValueScope1.Number)(row.authority) <= 1);
}

function buildCausalBlameValue2(__genosValueScope2) {
  return __genosValueScope2.current && __genosValueScope2.current.parentIds && __genosValueScope2.current.parentIds.length > 0;
}

function checkOutcomeInvariantsValue3(__genosValueScope3) {
  return __genosValueScope3.state.epistemicClaims.every((row) => {
      const derived = (0, __genosValueScope3.calibrate)(row);
      if (!derived) return false;
      try {
        const claim = __genosValueScope3.JSON.parse(row.claim_json || '{}');
        return claim.confidence == null && (0, __genosValueScope3.Number)(row.quality) === derived.quality;
      } catch (_) { return false; }
    });
}

module.exports = { checkOutcomeInvariantsValue1, buildCausalBlameValue2, checkOutcomeInvariantsValue3 };
