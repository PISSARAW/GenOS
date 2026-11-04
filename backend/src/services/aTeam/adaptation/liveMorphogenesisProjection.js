'use strict';

const runStore = require('../teamRunStore');
const graphStore = require('../workGraph/workGraphStore');
const evidence = require('./liveMorphogenesisEvidence');
const { fail, candidateId } = require('./liveMorphogenesisPolicy');
const preparation = require('./liveMorphogenesisPreparation');
const planner = require('./liveMorphogenesisPlan');
const { findMember } = require('../../qualityElevation/qualityFinalPlan');

async function assertSource(input) {
  const change = input.ctx.plan.aTeamPendingReplacement;
  const run = await runStore.load(input.ctx.db, change.teamRunId);
  require('../execution/teamExecutionService').assertLease(run, input.ctx.runnerToken);
  if (run.missionId !== input.ctx.agentId || run.execution.runtimeMissionId !== input.ctx.missionId
    || change.runtimeMissionId !== input.ctx.missionId || change.schema !== 'genos.a-team-pending-replacement/v1'
    || evidence.digest(input.ctx.runnerToken) !== change.runnerLeaseDigest) {
    throw fail('ATEAM_LIVE_MORPH_SCOPE_MISMATCH', 'The replacement is not owned by this controller and mission.');
  }
  const graph = await graphStore.load(input.ctx.db, run.workGraphId);
  await assertBinding({ input, change, run, graph });
  return true;
}

async function assertBinding(scope) {
  const { input, change, run, graph } = scope;
  const target = run.members.find(member => member.memberId === change.memberId);
  const sourceMember = findMember(run.members, run.adaptiveMorphogenesis.afterMember);
  const source = await evidence.sourceQuality(input.ctx.db, run, sourceMember);
  if (!source) throw fail('ATEAM_LIVE_MORPH_SOURCE_INVALID', 'Source quality evidence is unavailable.');
  const expected = planner.nextMembers(run, target, source);
  const projected = planner.projectedGraph(run, graph, expected);
  const actual = [run.revision, graph.revision, evidence.rosterHash(run.members), evidence.graphShape(graph),
    evidence.digest(run.adaptiveMorphogenesis), candidateId(run), evidence.digest(source),
    evidence.rosterHash(expected), evidence.graphShape(projected.graph), evidence.digest(await planner.budgets(input.ctx.db, run)),
    planner.taskRecords(graph), projected.affectedNodeIds, projected.invalidatedHandoffDigests];
  const planned = [change.runRevision, change.graphRevision, change.beforeMembersHash,
    change.beforeGraphHash, change.policyDigest, change.candidateWorkerId, evidence.digest(change.source),
    change.afterMembersHash, change.afterGraphHash, evidence.digest(change.budgets),
    change.taskRecords, change.affectedNodeIds, change.invalidatedHandoffDigests];
  if (evidence.digest(actual) !== evidence.digest(planned) || !source?.defects.length
    || target?.workerId !== change.priorWorkerId || change.priorWorkerId === change.candidateWorkerId) {
    throw fail('ATEAM_LIVE_MORPH_SOURCE_CHANGED', 'Roster, graph, funding, source evidence or policy changed before commit.');
  }
  const old = await preparation.assertPending(input.ctx.db, run, change.priorWorkerId);
  const next = await preparation.assertPending(input.ctx.db, run, change.candidateWorkerId);
  const actions = [{ type: 'rebind', agentId: old.id, targetRole: next.role, targetParent: run.missionId },
    { type: 'rebind', agentId: next.id, targetRole: run.adaptiveMorphogenesis.replacement.role, targetParent: run.missionId }];
  if (old.role !== change.priorRole || next.role !== change.reserveRole
    || evidence.digest(actions) !== evidence.digest(input.ctx.plan.actions)) {
    throw fail('ATEAM_LIVE_MORPH_ACTION_CHANGED', 'The exact two pending role changes are required.');
  }
}

async function apply(input, receipt) {
  const change = input.plan.aTeamPendingReplacement;
  const sourceInput = { ctx: input };
  await assertSource(sourceInput);
  const run = await runStore.load(input.db, change.teamRunId);
  const target = findMember(run.members, change.memberId);
  const members = planner.nextMembers(run, target, change.source);
  const before = await graphStore.load(input.db, run.workGraphId);
  const projected = planner.projectedGraph(run, before, members);
  await input.db.run('UPDATE agents SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', change.reserveRole, change.priorWorkerId);
  await input.db.run('UPDATE agents SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', change.nextRole, change.candidateWorkerId);
  const graph = await graphStore.update({ db: input.db, workGraphId: before.workGraphId,
    revision: change.graphRevision, graph: projected.graph });
  return runStore.update({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { members, execution: { ...run.execution, liveMorphogenesis: {
      status: 'PENDING_FINALIZE', plan: input.plan, snapshot: receipt.durableSnapshot,
      rustAuthority: receipt.rustAuthority, transitionId: receipt.transitionId,
      graphRevision: graph.revision, projectedAt: new Date().toISOString()
    } } } });
}

async function assertApplied(input) {
  const change = input.ctx.plan.aTeamPendingReplacement;
  const run = await runStore.load(input.ctx.db, change.teamRunId);
  const graph = await graphStore.load(input.ctx.db, run.workGraphId);
  const old = await input.ctx.db.get('SELECT role,parent_agent_id FROM agents WHERE id=?', change.priorWorkerId);
  const next = await input.ctx.db.get('SELECT role,parent_agent_id FROM agents WHERE id=?', change.candidateWorkerId);
  const valid = evidence.rosterHash(run.members) === change.afterMembersHash
    && evidence.graphShape(graph) === change.afterGraphHash
    && old?.role === change.reserveRole && next?.role === change.nextRole
    && old.parent_agent_id === run.missionId && next.parent_agent_id === run.missionId;
  if (!valid) throw fail('ATEAM_LIVE_MORPH_PROJECTION_DIVERGED', 'The actual roster, roles and WorkGraph do not match the authorized projection.');
  return true;
}

module.exports = { assertSource, apply, assertApplied };
