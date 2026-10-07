'use strict';

function start(ctx) {
  if (!ctx.normalizedMission.executionAuthorityRef) return null;
  let pending = false;
  let closed = false;
  const timer = setInterval(async () => {
    if (pending || closed || ctx.state.termination) return;
    pending = true;
    try {
      await require('./missionEnvelopeAuthority').assertRun(ctx.db, {
        agentId: ctx.agentId, runId: ctx.executionRun.id, mission: ctx.normalizedMission });
    } catch (failure) {
      if (!closed) ctx.haltRuntime(ctx, 'authority_revoked', failure.code || failure.message,
        'Runtime stopped after execution authority expired or changed.');
    } finally { pending = false; }
  }, 1000);
  timer.unref();
  ctx.child.once('close', () => { closed = true; clearInterval(timer); });
  return timer;
}

function assertEvent(ctx, decision) {
  if (!decision?.authorityRefusal) return;
  ctx.state.missionDomainState.hasDomainFailure = true;
  ctx.state.missionDomainState.domainVerdict = 'failed';
  ctx.haltRuntime(ctx, 'authority_revoked', decision.reason, 'Runtime event effects refused after authority changed.');
  throw Object.assign(new Error(decision.reason), { code: decision.authorityRefusal.code });
}

module.exports = { start, assertEvent };
