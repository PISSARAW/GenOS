'use strict';

async function replaceStateStage1(__genosStageScope1) {
if (!__genosStageScope1.inTransaction) { await __genosStageScope1.db.exec('ROLLBACK').catch(() => {}); }
}

async function replaceStateStage2(__genosStageScope2) {
if (!__genosStageScope2.inTransaction) await __genosStageScope2.db.exec('COMMIT');
}

async function replaceStateStage3(__genosStageScope3) {
if (!__genosStageScope3.inTransaction) await __genosStageScope3.db.exec('BEGIN IMMEDIATE');
}

async function replaceStateStage4(__genosStageScope4) {
if (__genosStageScope4.selected.has('runs')) await (0, __genosStageScope4.replaceRunState)(__genosStageScope4.ctx, __genosStageScope4.targetAgentId, __genosStageScope4.state.runs);
}

async function replaceStateStage5(__genosStageScope5) {
try {
    if (__genosStageScope5.selected.has('agent')) await (0, __genosStageScope5.replaceAgentState)(__genosStageScope5.ctx, __genosStageScope5.targetAgentId, __genosStageScope5.state.agent);
    if (__genosStageScope5.selected.has('decisions')) await (0, __genosStageScope5.replaceDecisionState)(__genosStageScope5.ctx, __genosStageScope5.targetAgentId, __genosStageScope5.state.decisions);
    if (__genosStageScope5.selected.has('memories')) await (0, __genosStageScope5.replaceMemoryState)(__genosStageScope5.ctx, __genosStageScope5.targetAgentId, __genosStageScope5.state.memories);
    await (0, __genosStageScope5.require)('./dagOperationsStages1.js').replaceStateStage4({ ctx: __genosStageScope5.ctx, replaceRunState: __genosStageScope5.replaceRunState, selected: __genosStageScope5.selected, get state() { return __genosStageScope5.state; }, set state(__genosNextStageValue) { __genosStageScope5.state = __genosNextStageValue; }, targetAgentId: __genosStageScope5.targetAgentId });
    if (__genosStageScope5.selected.has('plasmids')) await (0, __genosStageScope5.replacePlasmidState)(__genosStageScope5.ctx, __genosStageScope5.targetAgentId, __genosStageScope5.state.plasmids);
    if (__genosStageScope5.selected.has('permissions')) await (0, __genosStageScope5.replacePermissionState)(__genosStageScope5.ctx, __genosStageScope5.targetAgentId, __genosStageScope5.state.permissions);
    if (__genosStageScope5.selected.has('relations')) await (0, __genosStageScope5.require)('./institutionalRelations.cjs').replaceRelations({ db: __genosStageScope5.db, req: __genosStageScope5.req, targetAgentId: __genosStageScope5.targetAgentId }, __genosStageScope5.state.relations);
    if (__genosStageScope5.selected.has('epistemicClaims')) await (0, __genosStageScope5.require)('./epistemicClaimMerge.cjs').replaceClaims({ db: __genosStageScope5.db, req: __genosStageScope5.req, targetAgentId: __genosStageScope5.targetAgentId, state: __genosStageScope5.state });
    await (0, __genosStageScope5.require)('./dagOperationsStages1.js').replaceStateStage2({ db: __genosStageScope5.db, inTransaction: __genosStageScope5.inTransaction });
  } catch (err) {
    await (0, __genosStageScope5.require)('./dagOperationsStages1.js').replaceStateStage1({ db: __genosStageScope5.db, inTransaction: __genosStageScope5.inTransaction });
    throw err;
  }
}

module.exports = { replaceStateStage1, replaceStateStage2, replaceStateStage3, replaceStateStage4, replaceStateStage5 };
