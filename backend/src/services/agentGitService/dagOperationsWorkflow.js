'use strict';

async function rollbackStandaloneTransaction(context) {
if (!context.inTransaction) { await context.db.exec('ROLLBACK').catch(() => {}); }
}

async function commitStandaloneTransaction(context) {
if (!context.inTransaction) await context.db.exec('COMMIT');
}

async function beginStandaloneTransaction(context) {
if (!context.inTransaction) await context.db.exec('BEGIN IMMEDIATE');
}

async function replaceRunSection(context) {
if (context.selected.has('runs')) await context.replaceRunState(context.ctx, context.targetAgentId, context.state.runs);
}

async function replaceSelectedState(context) {
try {
    if (context.selected.has('agent')) await context.replaceAgentState(context.ctx, context.targetAgentId, context.state.agent);
    if (context.selected.has('decisions')) await context.replaceDecisionState(context.ctx, context.targetAgentId, context.state.decisions);
    if (context.selected.has('memories')) await context.replaceMemoryState(context.ctx, context.targetAgentId, context.state.memories);
    await context.require('./dagOperationsWorkflow.js').replaceRunSection({ ctx: context.ctx, replaceRunState: context.replaceRunState, selected: context.selected, get state() { return context.state; }, set state(nextValue) { context.state = nextValue; }, targetAgentId: context.targetAgentId });
    if (context.selected.has('plasmids')) await context.replacePlasmidState(context.ctx, context.targetAgentId, context.state.plasmids);
    if (context.selected.has('permissions')) await context.replacePermissionState(context.ctx, context.targetAgentId, context.state.permissions);
    if (context.selected.has('relations')) await context.require('./institutionalRelations.cjs').replaceRelations({ db: context.db, req: context.req, targetAgentId: context.targetAgentId }, context.state.relations);
    if (context.selected.has('epistemicClaims')) await context.require('./epistemicClaimMerge.cjs').replaceClaims({ db: context.db, req: context.req, targetAgentId: context.targetAgentId, state: context.state });
    await context.require('./dagOperationsWorkflow.js').commitStandaloneTransaction({ db: context.db, inTransaction: context.inTransaction });
  } catch (err) {
    await context.require('./dagOperationsWorkflow.js').rollbackStandaloneTransaction({ db: context.db, inTransaction: context.inTransaction });
    throw err;
  }
}

module.exports = { rollbackStandaloneTransaction, commitStandaloneTransaction, beginStandaloneTransaction, replaceRunSection, replaceSelectedState };
