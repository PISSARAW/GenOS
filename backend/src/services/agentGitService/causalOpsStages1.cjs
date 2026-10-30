'use strict';

async function buildCausalBlameStage1(__genosStageScope1) {
while ((0, __genosStageScope1.require)('./causalOpsValues1.cjs').buildCausalBlameValue2({ get current() { return __genosStageScope1.current; } })) {
    __genosStageScope1.current = await (0, __genosStageScope1.getCommit)(__genosStageScope1.db, __genosStageScope1.current.parentIds[0]);
    if (!__genosStageScope1.current || __genosStageScope1.visited.has(__genosStageScope1.current.id)) break;
    __genosStageScope1.visited.add(__genosStageScope1.current.id);
    for (const item of (0, __genosStageScope1.sectionItems)(__genosStageScope1.current)) {
      const id = (0, __genosStageScope1.identityOf)(__genosStageScope1.section, item);
      if (id === __genosStageScope1.undefined) continue;
      const existing = __genosStageScope1.attribution.get(id);
      if (existing && existing.value === (0, __genosStageScope1.canonicalize)(item)) {
        __genosStageScope1.attribution.set(id, {
          commitId: __genosStageScope1.current.id,
          item,
          value: existing.value,
          createdAt: __genosStageScope1.current.created_at,
          createdBy: __genosStageScope1.current.created_by || 'unknown'
        });
      }
    }
  }
}

function checkOutcomeInvariantsStage2(__genosStageScope2) {
if (__genosStageScope2.state.runs && __genosStageScope2.Array.isArray(__genosStageScope2.state.runs)) __genosStageScope2.invariants.budgetsConsistent = (0, __genosStageScope2.checkBudgets)(__genosStageScope2.state.runs);
}

module.exports = { buildCausalBlameStage1, checkOutcomeInvariantsStage2 };
