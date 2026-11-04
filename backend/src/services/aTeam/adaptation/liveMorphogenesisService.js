'use strict';

const runStore = require('../teamRunStore');
const { findMember } = require('../../qualityElevation/qualityFinalPlan');
const evidence = require('./liveMorphogenesisEvidence');
const planner = require('./liveMorphogenesisPlan');
const projection = require('./liveMorphogenesisProjection');
const receipts = require('./liveMorphogenesisReceipt');
const { fail, effective } = require('./liveMorphogenesisPolicy');

async function maybeReplace(input) {
  const { run } = input;
  if (!run.adaptiveMorphogenesis) return null;
  require('../execution/teamExecutionService').assertLease(run, input.runnerToken);
  const live = run.execution.liveMorphogenesis;
  if (['WATCHING', 'SELECTED'].includes(live?.status)) {
    const selected = await require('./liveMorphogenesisSelection').select(input);
    return selected ? maybeReplace({ ...input, run: selected }) : null;
  }
  if (live?.status === 'COMMITTED') { await receipts.verify(input.db, run); return null; }
  if (live?.status === 'PENDING_FINALIZE') return recover(input, live);
  if (live?.status !== 'RESERVED') throw fail('ATEAM_LIVE_MORPH_NOT_PREPARED', 'The dormant candidate was not durably prepared.');
  const member = findMember(run.members, effective(run).afterMember);
  if (!input.observed.verdicts.get(member.workerId)?.promoted) return null;
  const source = await evidence.sourceQuality(input.db, run, member);
  if (!evidence.triggered(source)) return null;
  const prepared = await planner.build({ ...input, source, graph: input.observed.graph });
  return transition(input, prepared);
}

async function transition(input, prepared) {
  const ctx = { db: input.db, ...prepared, runnerToken: input.runnerToken,
    agentId: input.run.missionId, missionId: input.run.execution.runtimeMissionId,
    workspaceId: prepared.controller.workspace_id };
  const scoped = require('../../morphogenesis/collectiveStorage');
  const existing = await scoped.read(input.db, scoped.key(ctx));
  if (existing) ctx.collectiveState = require('../../collectiveStateService').deserializeState(existing.value);
  else await require('../../morphogenesis/morphogenesisTransitionSnapshotService').persistCollective({
    db: input.db, state: ctx.collectiveState, missionId: ctx.missionId, storageKey: scoped.key(ctx) });
  const result = await require('../../morphogenesis/transitionEngineService').executeTransition({ ...ctx,
    persistCommit: candidate => commitProjection(ctx, candidate) });
  const latest = await runStore.load(input.db, input.run.teamRunId);
  if (!result.committed) {
    await retainIrreversibleFailure({ db: input.db, run: latest, result, plan: prepared.plan });
    throw fail('ATEAM_LIVE_MORPH_REJECTED', JSON.stringify({ code: result.code, errors: result.errors }));
  }
  if (result.protocol?.status !== 'finalized') return recover(input, latest.execution.liveMorphogenesis);
  return receipts.record(input.db, latest, result.protocol);
}

async function commitProjection(ctx, receipt) {
  const run = await projection.apply(ctx, receipt);
  const commit = await require('../../morphogenesis/morphogenesisGitService').commitTransition(ctx.db, {
    agentId: ctx.agentId, workspaceId: ctx.workspaceId, plan: ctx.plan,
    receipt, req: ctx.req, refName: 'main', collectiveState: ctx.collectiveState });
  await runStore.update({ db: ctx.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { execution: { ...run.execution, liveMorphogenesis: {
      ...run.execution.liveMorphogenesis, agentGitCommitId: commit.id } } } });
  return commit;
}

async function recover(input, live) {
  if (!live?.snapshot?.id || !live.plan) throw fail('ATEAM_LIVE_MORPH_RECOVERY_REQUIRED', 'The committed transition binding is incomplete.');
  const controller = await require('./liveMorphogenesisPreparation').controllerScope(input.db, input.run);
  const req = { user: { keyId: controller.id }, tenant: {
    organizationId: controller.organization_id, projectId: controller.project_id } };
  const result = await require('../../missionProtocols/morphRecovery').resume({ db: input.db, req,
    snapshotId: live.snapshot.id }).catch(error => {
    throw fail('ATEAM_LIVE_MORPH_RECOVERY_REQUIRED', `The irreversible MORPH decision could not be finalized: ${error.message}`);
  });
  if (!result.committed || result.protocol?.status !== 'finalized') {
    throw fail('ATEAM_LIVE_MORPH_RECOVERY_REQUIRED', 'The irreversible MORPH decision could not be finalized.');
  }
  return receipts.record(input.db, await runStore.load(input.db, input.run.teamRunId), result.protocol);
}

module.exports = { maybeReplace, transition, recover };

async function retainIrreversibleFailure({ db, run, result, plan }) {
  if (result.protocol?.decision?.decision !== 'COMMIT') return;
  await runStore.update({ db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { execution: { ...run.execution, liveMorphogenesis: {
      status: 'RECOVERY_REQUIRED', plan, protocol: result.protocol,
      snapshot: result.durableSnapshot, failure: result.code,
      errors: result.errors || [], authorizesRedispatch: false
    } } } });
}
