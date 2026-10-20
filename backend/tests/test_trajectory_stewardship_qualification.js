'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/trajectoryStewardshipQualificationFixture');

async function checkpointRange(ctx, input) {
  const receipts = [];
  for (let sequence = input.first; sequence <= input.last; sequence += 1) {
    receipts.push(await fixture.checkpoint(ctx, { missionId: input.run.mission.id,
      owner: input.run.owner, fence: input.run.fence,
      nowMs: input.run.nowMs + sequence, sequence }));
  }
  return receipts;
}

async function assertSingleExecution(ctx, missionId) {
  const rows = await ctx.db.all(`SELECT step_id, COUNT(*) AS count
    FROM ontogenesis_delegation_checkpoints WHERE mission_id=? GROUP BY step_id`, missionId);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 4);
  assert.equal(rows.find((row) => row.step_id === 'execute_isolated').count, 1);
}

async function qualifyHappyPath(ctx) {
  const started = await fixture.startQualification(ctx, { cycleId: 'happy' });
  assert.equal(started.evidence.decision.decision, 'PROPOSE_ACTION');
  assert.equal(started.selection.decision, 'PROPOSE_GOALS');
  assert.equal(started.evidence.promotionAuthorized, false);
  const lease = await fixture.runtime.claimDelegation(ctx.db, {
    missionId: started.mission.id, owner: 'worker-happy', nowMs: 1000, ttlMs: 1000 });
  const run = { mission: started.mission, owner: 'worker-happy', fence: lease.fence, nowMs: 1100 };
  await checkpointRange(ctx, { run, first: 1, last: 4 });
  const result = await fixture.closeAndLearn(ctx, { missionId: started.mission.id,
    owner: run.owner, fence: run.fence, nowMs: 1200 });
  assert.equal(result.accepted.outcome, 'ACCEPT');
  assert.equal(result.learning.decision, 'LEARN');
  assert.equal(result.promotionAuthorized, false);
  await assertSingleExecution(ctx, started.mission.id);
}

async function qualifyNonActions(ctx) {
  const stable = await fixture.startQualification(ctx, { cycleId: 'stable',
    trajectory: { current: 79 } });
  assert.equal(stable.evidence.decision.decision, 'NO_CHANGE');
  assert.equal(stable.mission, undefined);
  const observe = await fixture.startQualification(ctx, { cycleId: 'observe',
    trajectory: { effectEvidenceRefs: [] } });
  assert.equal(observe.evidence.decision.decision, 'OBSERVE');
  assert.equal(observe.mission, undefined);
  const gvxNoChange = await fixture.startQualification(ctx, { cycleId: 'gvx-no-change',
    noChangeUtility: 2 });
  assert.equal(gvxNoChange.evidence.decision.decision, 'NO_CHANGE');
  assert.equal(gvxNoChange.mission, undefined);
}

async function resumedMission(ctx, cutoff) {
  const started = await fixture.startQualification(ctx, { cycleId: `death-${cutoff}` });
  const first = await fixture.runtime.claimDelegation(ctx.db, {
    missionId: started.mission.id, owner: `worker-old-${cutoff}`, nowMs: 2000, ttlMs: 100 });
  const oldRun = { mission: started.mission, owner: `worker-old-${cutoff}`,
    fence: first.fence, nowMs: 2010 };
  await checkpointRange(ctx, { run: oldRun, first: 1, last: cutoff });
  await fixture.reopen(ctx);
  const resumed = await fixture.runtime.claimDelegation(ctx.db, {
    missionId: started.mission.id, owner: `worker-new-${cutoff}`, nowMs: 2200, ttlMs: 1000 });
  assert.equal(resumed.cursor, cutoff);
  assert.equal(resumed.fence, first.fence + 1);
  await assert.rejects(fixture.checkpoint(ctx, { missionId: started.mission.id,
    owner: oldRun.owner, fence: first.fence, nowMs: 2210,
    sequence: cutoff + 1 }), /fencing-delegation-obsolete/);
  const run = { mission: started.mission, owner: `worker-new-${cutoff}`,
    fence: resumed.fence, nowMs: 2220 };
  const tail = await checkpointRange(ctx, { run, first: cutoff + 1, last: 4 });
  const result = await fixture.closeAndLearn(ctx, { missionId: started.mission.id,
    owner: run.owner, fence: run.fence, nowMs: 2300 });
  assert.equal(result.accepted.outcome, 'ACCEPT');
  await assertSingleExecution(ctx, started.mission.id);
  const checkpoints = await ctx.db.all(`SELECT state_hash FROM ontogenesis_delegation_checkpoints
    WHERE mission_id=? ORDER BY sequence`, started.mission.id);
  return { hashes: checkpoints.map((row) => row.state_hash), tail };
}

async function qualifyCrashRecovery(ctx) {
  const outcomes = [];
  for (const cutoff of [1, 2, 3]) outcomes.push(await resumedMission(ctx, cutoff));
  assert.deepEqual(outcomes[1].hashes, outcomes[0].hashes);
  assert.deepEqual(outcomes[2].hashes, outcomes[0].hashes);
}

async function qualifyLostResponse(ctx) {
  const started = await fixture.startQualification(ctx, { cycleId: 'lost-response' });
  const lease = await fixture.runtime.claimDelegation(ctx.db, {
    missionId: started.mission.id, owner: 'worker-lost', nowMs: 3000, ttlMs: 1000 });
  const run = { mission: started.mission, owner: 'worker-lost', fence: lease.fence, nowMs: 3010 };
  await checkpointRange(ctx, { run, first: 1, last: 1 });
  await fixture.checkpoint(ctx, { missionId: started.mission.id, owner: run.owner,
    fence: run.fence, nowMs: 3020, sequence: 2 });
  const replay = await fixture.checkpoint(ctx, { missionId: started.mission.id,
    owner: run.owner, fence: run.fence, nowMs: 3030, sequence: 2 });
  assert.equal(replay.replayed, true, 'lost response must replay the committed action receipt');
  await checkpointRange(ctx, { run, first: 3, last: 4 });
  await fixture.closeAndLearn(ctx, { missionId: started.mission.id,
    owner: run.owner, fence: run.fence, nowMs: 3100 });
  await assertSingleExecution(ctx, started.mission.id);
}

async function qualifyConcurrentClaims(ctx) {
  const started = await fixture.startQualification(ctx, { cycleId: 'double-claim' });
  const claims = await Promise.all(['worker-a', 'worker-b'].map((owner) =>
    fixture.runtime.claimDelegation(ctx.db, { missionId: started.mission.id,
      owner, nowMs: 4000, ttlMs: 1000 })));
  assert.equal(claims.filter((claim) => claim.acquired).length, 1);
  assert.equal(claims.filter((claim) => !claim.acquired)[0].reason, 'bail-delegation-actif');
  assert.equal((await ctx.db.get(`SELECT COUNT(*) AS count FROM ontogenesis_delegations
    WHERE id=?`, started.mission.id)).count, 1);
}

async function qualifyRevocation(ctx) {
  const result = await fixture.observations.revokeAndForget(ctx.db, { ...ctx.scope,
    expectedVersion: 1, payload: { responsibilityId: ctx.responsibilityId,
      revocationRef: 'revocation:owner', recordedAt: '2026-10-20T10:00:00.000Z' } });
  assert(result.forgottenCount > 0);
  const revoked = await fixture.startQualification(ctx, { cycleId: 'revoked' });
  assert.equal(revoked.evidence.decision.decision, 'NO_CHANGE');
  assert.equal(revoked.evidence.decision.reason, 'RESPONSIBILITY_INACTIVE_OR_STALE');
  assert.equal(revoked.mission, undefined);
}

async function main() {
  const ctx = await fixture.createFixture();
  try {
    await qualifyHappyPath(ctx);
    await qualifyNonActions(ctx);
    await qualifyCrashRecovery(ctx);
    await qualifyLostResponse(ctx);
    await qualifyConcurrentClaims(ctx);
    await qualifyRevocation(ctx);
  } finally {
    await fixture.destroy(ctx);
  }
}

main().then(() => console.log('Trajectory stewardship Q1/Q2 qualification passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
