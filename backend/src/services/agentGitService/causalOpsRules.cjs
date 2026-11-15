'use strict';

function checkOutcomeInvariantsRule1(context) {
  return context.ids.size === context.state.relations.length && context.state.relations.every((row) =>
      row.source_agent_id !== row.target_agent_id && context.Number.isFinite(context.Number(row.authority))
      && context.Number(row.authority) >= 0 && context.Number(row.authority) <= 1);
}

function buildCausalBlame(context) {
  return context.current && context.current.parentIds && context.current.parentIds.length > 0;
}

function checkOutcomeInvariantsRule3(context) {
  return context.state.epistemicClaims.every((row) => {
      const derived = context.calibrate(row);
      if (!derived) return false;
      try {
        const claim = context.JSON.parse(row.claim_json || '{}');
        return claim.confidence == null && context.Number(row.quality) === derived.quality;
      } catch (_) { return false; }
    });
}

module.exports = { checkOutcomeInvariantsRule1, buildCausalBlame, checkOutcomeInvariantsRule3 };
