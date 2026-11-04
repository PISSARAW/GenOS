'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const store = require('../teamRunStore');
const evidence = require('./liveMorphogenesisEvidence');
const projection = require('./liveMorphogenesisProjection');
const { fail } = require('./liveMorphogenesisPolicy');
const snapshots = require('../../morphogenesis/morphogenesisTransitionSnapshotService');

async function record(db, run, protocol) {
  const live = run.execution.liveMorphogenesis;
  const loaded = await snapshots.load({ db, id: live.snapshot.id });
  if (loaded.row.status !== 'committed' || protocol.status !== 'finalized'
    || !live.agentGitCommitId || !live.rustAuthority || live.rustAuthority.decision !== 'APPLY') {
    throw fail('ATEAM_LIVE_MORPH_COMMIT_MISSING', 'A finalized native MORPH effect and AgentGit commit are required.');
  }
  await projection.assertApplied({ ctx: { db, plan: live.plan } });
  const receipt = evidence.sign({ schema: 'genos.a-team-live-morphogenesis/v1',
    teamRunId: run.teamRunId, runtimeMissionId: run.execution.runtimeMissionId,
    plan: live.plan, snapshot: live.snapshot, rustAuthority: live.rustAuthority,
    agentGitCommitId: live.agentGitCommitId, transitionId: live.transitionId,
    protocol, committedAt: new Date().toISOString(), authorizesMissionPromotion: false });
  const updated = await store.update({ db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { execution: { ...run.execution, liveMorphogenesis: { status: 'COMMITTED', receipt },
      morphology: { ...run.execution.morphology, adaptiveRestructuring: true,
        application: 'pending_member_replacement', transitionId: live.transitionId } } } });
  await verify(db, updated);
  return updated;
}

async function verify(db, run) {
  const receipt = run.execution.liveMorphogenesis?.receipt;
  if (receipt?.schema !== 'genos.a-team-live-morphogenesis/v1' || !evidence.authentic(receipt)
    || receipt.teamRunId !== run.teamRunId || receipt.runtimeMissionId !== run.execution.runtimeMissionId) {
    throw fail('ATEAM_LIVE_MORPH_RECEIPT_INVALID', 'The live transition receipt is absent, forged or out of scope.');
  }
  const loaded = await snapshots.load({ db, id: receipt.snapshot.id });
  const commit = await db.get('SELECT agent_id,evidence_json FROM agent_git_commits WHERE commit_id=?', receipt.agentGitCommitId);
  assertCommitBinding({ loaded, commit, receipt, run });
  await projection.assertApplied({ ctx: { db, plan: receipt.plan } });
  await protocolDecision(db, loaded, receipt);
  return { required: true, passed: true, transitionId: receipt.transitionId,
    priorWorkerId: receipt.plan.aTeamPendingReplacement.priorWorkerId,
    workerId: receipt.plan.aTeamPendingReplacement.candidateWorkerId };
}

function assertCommitBinding(scope) {
  const { loaded, commit, receipt, run } = scope;
  if (loaded.row.status !== 'committed' || loaded.row.plan_hash !== snapshots.digest(receipt.plan)
    || evidence.digest(JSON.parse(loaded.row.authority_json)) !== evidence.digest(receipt.rustAuthority)
    || commit?.agent_id !== run.missionId || JSON.parse(commit.evidence_json || '{}').snapshotId !== receipt.snapshot.id) {
    throw fail('ATEAM_LIVE_MORPH_RECEIPT_INVALID', 'The native commit, authority and snapshot do not match the receipt.');
  }
}

async function protocolDecision(db, loaded, receipt) {
  const rows = await db.all('PRAGMA database_list');
  const filename = rows.find(row => row.name === 'main')?.file;
  const tenant = { organizationId: loaded.row.organization_id, projectId: loaded.row.project_id };
  const folder = path.join(`${filename}.protocols`, `morph-${evidence.digest([tenant, loaded.row.mission_id]).slice(7)}`);
  const read = new Database(path.join(folder, 'coordinator.sqlite'), { readonly: true });
  try {
    const decisions = read.prepare('SELECT body FROM morph_coordinator_decisions').all().map(row => JSON.parse(row.body));
    const events = read.prepare('SELECT message FROM morph_coordinator_events ORDER BY sequence').all().map(row => JSON.parse(row.message));
    const committed = decisions.some(decision => decision.transitionId === receipt.protocol.transitionId && decision.decision === 'COMMIT');
    const finalized = events.some(event => event.type === 'FINALIZE' && event.payload.transitionId === receipt.protocol.transitionId);
    if (!committed || !finalized) throw fail('ATEAM_LIVE_MORPH_PROTOCOL_UNVERIFIED', 'Durable COMMIT and FINALIZE evidence is missing.');
  } finally { read.close(); }
}

async function forClosure(db, run) {
  if (!run.adaptiveMorphogenesis) return { required: false, passed: true };
  if (run.execution.liveMorphogenesis?.status === 'COMMITTED') return verify(db, run);
  return { required: run.adaptiveMorphogenesis.requireTransition === true,
    passed: run.adaptiveMorphogenesis.requireTransition !== true, reason: 'no_observed_transition' };
}

module.exports = { record, verify, forClosure };
