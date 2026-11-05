'use strict';

const threads = require('../cellThreadService');
const episodes = require('../missionEpisodeService');

function denied(code) { throw Object.assign(new Error(code), { code }); }

async function checkedEpisode(db, context) {
  const scope = context.missionScope;
  if (!scope?.available || !scope.episodeId || !scope.rootThreadId) denied('BIOME_LIFECYCLE_SCOPE_REQUIRED');
  const episode = await db.get('SELECT * FROM mission_episodes WHERE episode_id=?', scope.episodeId);
  if (episode?.mission_id !== context.missionId || episode.orchestrator_id !== context.orchestratorId
      || episode.root_thread_id !== scope.rootThreadId) denied('BIOME_LIFECYCLE_SCOPE_MISMATCH');
  return { missionId: context.missionId, episodeId: scope.episodeId, threadId: scope.rootThreadId,
    organizationId: episode.organization_id, projectId: episode.project_id };
}

async function settle(db, input) {
  const { context, dossier, result } = input;
  if (result.verdict !== 'succeeded' || dossier.topologyValidation.status !== 'verified'
      || dossier.oracle.status !== 'verified') denied('BIOME_LIFECYCLE_PROOF_REQUIRED');
  const scope = await checkedEpisode(db, context);
  const homeostasis = await require('../homeostasisService').transitionMissionToComplete(db, {
    mission: { id: context.missionId, objective: context.missionObjective,
      orchestratorAgentId: context.orchestratorId, completionContract: context.completionContract },
    context: { missionOutcome: result.success, flags: { completionContractConfigured: dossier.invariants.length > 0 },
      evidence: dossier.roster.evidenceProofs.length ? ['evidence_report'] : [] }
  });
  if (!homeostasis.allowed) denied('BIOME_HOMEOSTASIS_UNSATISFIED');
  await settleWorkers(db, { scope, members: dossier.roster.members });
  const root = await threads.get(db, scope);
  if (root.status !== 'completed_execution') await threads.transition(db, { ...scope,
    status: 'completed_execution', stopReason: 'biome_verified_closure' });
  await episodes.transition(db, { ...scope, status: 'completed' });
  await require('../missionIdentityService').setStatus(db, context.missionId, 'completed');
  context.output.lifecycle = { status: 'completed', episodeId: scope.episodeId,
    rootThreadId: scope.threadId, homeostasisReceiptHash: homeostasis.receipt.receiptHash };
}

async function settleWorkers(db, input) {
  const rows = await db.all(`SELECT thread_id,worker_id FROM cell_threads
    WHERE episode_id=? AND mission_id=? AND parent_thread_id=? AND cell_kind='worker'`,
  input.scope.episodeId, input.scope.missionId, input.scope.threadId);
  for (const member of input.members) {
    const row = rows.find(thread => thread.worker_id === member.memberId);
    if (!row) denied('BIOME_LIFECYCLE_WORKER_MISSING');
    await require('../workerCellThreadRuntime').observeOutcome(db, {
      executionMode: 'worker', missionId: input.scope.missionId, episodeId: input.scope.episodeId,
      workerId: member.memberId, threadId: row.thread_id, status: 'completed', reason: 'biome_verified_closure'
    });
  }
}

module.exports = { settle };
