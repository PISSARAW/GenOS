'use strict';
const assert = require('node:assert/strict');
const fixture = require('./helpers/ateamLiveMorphogenesisFixture.cjs');
const service = require('../src/services/aTeam/adaptation/liveMorphogenesisService');
const receipts = require('../src/services/aTeam/adaptation/liveMorphogenesisReceipt');
const runStore = require('../src/services/aTeam/teamRunStore');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');

async function positive() {
  const ctx = await fixture.create();
  try {
    ctx.run = await runStore.update({ db: ctx.db, teamRunId: ctx.run.teamRunId, revision: ctx.run.revision,
      patch: { members: ctx.run.members.map(member => member.memberId !== 'final' ? member : {
        ...member, mission: `${member.mission}\n${'Large creative context. '.repeat(5000)}` }) } });
    const original = ctx.run.members.find(member => member.memberId === 'final');
    const updated = await service.maybeReplace(ctx);
    assert.ok(updated, 'An authenticated prior quality defect must drive an actual replacement.');
    const replacement = updated.members.find(member => member.memberId === 'final');
    assert.notEqual(replacement.workerId, original.workerId);
    assert.equal(replacement.executionBudgetTokens, original.executionBudgetTokens);
    assert.equal(updated.members.reduce((sum, member) => sum + member.executionBudgetTokens, 0), 20000);
    const verified = await receipts.verify(ctx.db, updated);
    assert.equal(verified.passed, true);
    const receipt = updated.execution.liveMorphogenesis.receipt;
    assert.ok(Buffer.byteLength(JSON.stringify(receipt.plan)) < 64000,
      'The Rust admission plan must bind large creative contexts by digest within its 64 KiB boundary.');
    assert.equal(receipt.rustAuthority.decision, 'APPLY');
    assert.equal(receipt.protocol.status, 'finalized');
    assert.equal(receipt.authorizesMissionPromotion, false);
    const graph = await graphStore.load(ctx.db, updated.workGraphId);
    assert.equal(graph.nodes.find(node => node.memberId === 'final').ownerAgentId, replacement.workerId);
    assert.equal(graph.nodes.find(node => node.memberId === 'author').status, 'SUCCEEDED');
    assert.equal(graph.edges[0].handoff, undefined, 'A handoff addressed to the former consumer must be invalidated.');
    const current = await runStore.load(ctx.db, updated.teamRunId);
    const repeated = await service.maybeReplace({ ...ctx, run: current });
    assert.equal(repeated, null);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM morphogenesis_transition_snapshots')).count, 1);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM agent_git_commits')).count, 1);
    const unrelated = await ctx.db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
    assert.equal(unrelated, undefined, 'A mission transition must not publish into the global collective.');
    const forged = structuredClone(updated);
    forged.execution.liveMorphogenesis.receipt.plan.aTeamPendingReplacement.nextRole = 'programmer';
    await assert.rejects(receipts.verify(ctx.db, forged), { code: 'ATEAM_LIVE_MORPH_RECEIPT_INVALID' });
    await assert.rejects(runStore.update({ db: ctx.db, teamRunId: current.teamRunId, revision: current.revision,
      patch: { adaptiveMorphogenesis: { ...current.adaptiveMorphogenesis, requireTransition: false } } }),
    { code: 'ATEAM_LIVE_MORPH_POLICY_CHANGED' });
    console.log('Live A-Team: actual Rust authority, native MORPH, AgentGit, roster/graph mutation, token conservation and idempotence PASS. Source model replies are synthetic.');
  } finally { await ctx.close(); }
}

async function refusedActiveMember() {
  const ctx = await fixture.create();
  try {
    await ctx.db.run("UPDATE agents SET status='running',runtime_pid=? WHERE id=?", process.pid, ctx.target.agentId);
    await assert.rejects(service.maybeReplace(ctx), { code: 'ATEAM_LIVE_MORPH_MEMBER_ACTIVE' });
    assert.equal((await runStore.load(ctx.db, ctx.run.teamRunId)).members[1].workerId, ctx.target.agentId);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM morphogenesis_transition_snapshots')).count, 0);
    console.log('An active worker cannot be replaced and no native transition is prepared: PASS');
  } finally { await ctx.close(); }
}

async function refusedWithoutAuthority() {
  const ctx = await fixture.create();
  const key = process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
  try {
    delete process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
    await assert.rejects(service.maybeReplace(ctx), /Ed25519/);
    assert.equal((await runStore.load(ctx.db, ctx.run.teamRunId)).members[1].workerId, ctx.target.agentId);
    const snapshot = await ctx.db.get('SELECT status FROM morphogenesis_transition_snapshots');
    assert.equal(snapshot.status, 'restored');
    console.log('Missing native authority refuses and restores the prepared transition: PASS');
  } finally { process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = key; await ctx.close(); }
}

async function refusedSourceDrift() {
  const ctx = await fixture.create();
  const authority = require('../src/services/morphogenesis/morphogenesisProductionAuthority');
  const authorize = authority.authorize;
  try {
    authority.authorize = async input => {
      const result = await authorize(input);
      const current = await runStore.load(ctx.db, ctx.run.teamRunId);
      await runStore.update({ db: ctx.db, teamRunId: current.teamRunId, revision: current.revision,
        patch: { execution: { ...current.execution, externalObservation: 'concurrent edit' } } });
      return result;
    };
    await assert.rejects(service.maybeReplace(ctx), /ATEAM_LIVE_MORPH_SOURCE_CHANGED/);
    assert.equal((await runStore.load(ctx.db, ctx.run.teamRunId)).members[1].workerId, ctx.target.agentId);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM agent_git_commits')).count, 0);
    console.log('Concurrent roster revision after actual Rust admission refuses before mutation: PASS');
  } finally { authority.authorize = authorize; await ctx.close(); }
}

async function refusedForgedSource() {
  const ctx = await fixture.create();
  try {
    await ctx.db.run(`UPDATE gqel_quality_receipts SET receipt_json=json_set(receipt_json,'$.qualityAccepted',0)
      WHERE run_id=?`, ctx.sourceRunId);
    await assert.rejects(service.maybeReplace(ctx), { code: 'GQEL_RECEIPT_INVALID' });
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM morphogenesis_transition_snapshots')).count, 0);
    console.log('A forged source quality receipt cannot trigger a native transition: PASS');
  } finally { await ctx.close(); }
}

async function recoverCommittedTransition() {
  const ctx = await fixture.create();
  const { MorphParticipant } = require('../src/services/morphProtocol/participant');
  const commit = MorphParticipant.prototype.commit;
  try {
    MorphParticipant.prototype.commit = async () => { throw Error('Simulated lost ACK after actual commit'); };
    await assert.rejects(service.maybeReplace(ctx), /irreversible MORPH decision/);
    const pending = await runStore.load(ctx.db, ctx.run.teamRunId);
    assert.equal(pending.execution.liveMorphogenesis.status, 'PENDING_FINALIZE');
    assert.notEqual(pending.members[1].workerId, ctx.target.agentId);
    MorphParticipant.prototype.commit = commit;
    const recovered = await service.maybeReplace({ ...ctx, run: pending });
    assert.equal((await receipts.verify(ctx.db, recovered)).passed, true);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM agent_git_commits')).count, 1);
    console.log('Actual COMMIT survives lost ACK; recovery finalizes once without redispatch: PASS');
  } finally { MorphParticipant.prototype.commit = commit; await ctx.close(); }
}

async function transactionalRollback() {
  const ctx = await fixture.create();
  const git = require('../src/services/morphogenesis/morphogenesisGitService');
  const commit = git.commitTransition;
  try {
    git.commitTransition = async () => { throw Error('Simulated AgentGit failure after roster projection'); };
    await assert.rejects(service.maybeReplace(ctx), /AgentGit failure/);
    const rolled = await runStore.load(ctx.db, ctx.run.teamRunId);
    assert.equal(rolled.members[1].workerId, ctx.target.agentId);
    assert.equal((await ctx.db.get('SELECT role FROM agents WHERE id=?', ctx.target.agentId)).role, ctx.target.role);
    assert.equal((await graphStore.load(ctx.db, rolled.workGraphId)).nodes[1].ownerAgentId, ctx.target.agentId);
    assert.equal(rolled.execution.liveMorphogenesis.status, 'RECOVERY_REQUIRED');
    git.commitTransition = commit;
    await assert.rejects(service.maybeReplace({ ...ctx, run: rolled }), /durably prepared/);
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS count FROM morphogenesis_transition_snapshots')).count, 1);
    console.log('Atomic roster/role/graph rollback and irreversible COMMIT redispatch refusal: PASS');
  } finally { git.commitTransition = commit; await ctx.close(); }
}

async function main() {
  await positive(); await refusedActiveMember(); await refusedWithoutAuthority();
  await refusedSourceDrift(); await refusedForgedSource();
  await recoverCommittedTransition(); await transactionalRollback();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
