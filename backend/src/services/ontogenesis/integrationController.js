'use strict';

const { withTransaction } = require('../../db');
const integration = require('./integrationService');
const { activeExecution, updateExecution, finalizeExecution } = require('./executionStore');
const workspaces = require('./worktreeService');
const { treeHash, verifyChecks } = require('./proofService');
const { reviewAction } = require('./reviewPolicy');
const { failExecution } = require('./executionLifecycle');
const { notify } = require('./notificationService');
const { verifyPhilosophicalObservations } = require('./philosophicalObservationService');

async function verifyExecution(db, ctx) {
  const run = await activeExecution(db, ctx.project.id);
  if (!run) throw new Error('execution-introuvable');
  const result = JSON.parse(run.result_json);
  if (result.success !== true) throw new Error(result.error || 'mission-non-verifiee');
  if (ctx.config.authority.allowTests !== true) throw new Error('tests-non-autorises');
  const candidate = workspaces.assertCandidate(ctx.project, result.candidateWorktree);
  const files = await workspaces.changedFiles(candidate, run.base_sha);
  workspaces.checkFiles(files, ctx.config.authority);
  const proof = await verifyChecks(candidate, ctx.config.checks, { timeoutMs: verificationTime(run) });
  const philosophyAudit = verifyPhilosophicalObservations(candidate, ctx.mission?.plan?.philosophicalContracts?.contracts || [],
    { missionId: run.id, treeHash: proof.treeHash });
  const verified = { ...result, ...proof, files, philosophyAudit };
  await updateExecution(db, { id: run.id, phase: 'verified', result: verified });
  await db.run("UPDATE ontogenesis_runs SET status = 'verified' WHERE id = ?", [run.id]);
  await db.run("UPDATE ontogenesis_projects SET state = 'INTEGRATING' WHERE id = ?", [ctx.project.id]);
  return { state: 'INTEGRATING', event: 'passed' };
}

function authorizeCommit(ctx) {
  const review = reviewAction(ctx.config, { scope: 'commit', branch: ctx.project.branch });
  if (review.verdict === 'proceed') return;
  throw new Error('approbation-commit-requise');
}

async function candidateFor(ctx, run) {
  const result = JSON.parse(run.result_json);
  const candidate = { ...result, baseSha: run.base_sha, branch: ctx.project.branch };
  const checked = integration.validateCandidate({ candidate, authority: ctx.config.authority });
  if (!checked.ok) throw new Error(checked.errors.join(','));
  const path = workspaces.assertCandidate(ctx.project, result.candidateWorktree);
  if (await treeHash(path) !== candidate.treeHash) throw new Error('preuve-contenu-obsolete');
  const audit = verifyPhilosophicalObservations(path, ctx.mission?.plan?.philosophicalContracts?.contracts || [],
    { missionId: run.id, treeHash: candidate.treeHash });
  if (audit?.receiptHash !== candidate.philosophyAudit?.receiptHash) throw new Error('audit-philosophique-obsolete');
  return { ...candidate, worktree: path };
}

async function cleanIndex(git, worktree) {
  const staged = await git.run(['diff', '--cached', '--name-only', '-z'], worktree);
  if (staged.stdout) throw new Error('index-integration-non-vide');
}

async function integrateCandidate(db, ctx, run) {
  authorizeCommit(ctx);
  const git = integration.createShellGit();
  await integration.openIntegration(db, { id: run.id, projectId: ctx.project.id, taskId: run.task_id, baseSha: run.base_sha });
  const recovered = await integration.reconcileIntegration(db, git, { integrationId: run.id, operationId: run.id, worktree: run.worktree });
  if (recovered.status === 'committed') {
    await verifyRecovered(ctx, run, recovered.sha);
    return completeIntegration(db, ctx, { run, sha: recovered.sha });
  }
  const candidate = await candidateFor(ctx, run);
  const head = await integration.currentSha(git, run.worktree);
  if (head !== run.base_sha) throw new Error('head-integration-deplace');
  await cleanIndex(git, run.worktree);
  const before = await integration.inspectWorktree(git, run.worktree);
  if (before.dirty && await treeHash(run.worktree) !== candidate.treeHash) throw new Error('worktree-integration-sale');
  await workspaces.copyCandidate({ candidate: candidate.worktree, integration: run.worktree, files: candidate.files, authority: ctx.config.authority });
  const proof = await verifyChecks(run.worktree, ctx.config.checks, { timeoutMs: verificationTime(run) });
  if (proof.treeHash !== candidate.treeHash) throw new Error('contenu-integre-different');
  verifyIntegratedAudit(ctx, run, candidate);
  await ctx.fence();
  verifyIntegratedAudit(ctx, run, candidate);
  await integration.stageFiles(git, run.worktree, candidate.files);
  const message = integration.buildCommitMessage({ tag: 'FEAT', title: `Ontogenese ${run.task_id}`, operationId: run.id, taskId: run.task_id });
  await integration.commitStaged(git, run.worktree, { message, files: candidate.files });
  if (await treeHash(run.worktree) !== candidate.treeHash) throw new Error('contenu-modifie-pendant-commit');
  verifyIntegratedAudit(ctx, run, candidate);
  const sha = await integration.currentSha(git, run.worktree);
  await integration.setIntegrationResult(db, { id: run.id, status: 'committed', resultSha: sha, checks: proof.proofs });
  return completeIntegration(db, ctx, { run, sha });
}

function verificationTime(run) {
  const remaining = Date.parse(run.started_at) + JSON.parse(run.budgets_json).seconds * 1000 - Date.now();
  if (remaining <= 0) throw new Error('budget-verification-epuise');
  return remaining;
}

function verifyIntegratedAudit(ctx, run, candidate) {
  const audit = verifyPhilosophicalObservations(run.worktree, ctx.mission?.plan?.philosophicalContracts?.contracts || [],
    { missionId: run.id, treeHash: candidate.treeHash, artifactRoot: candidate.worktree });
  if (audit?.receiptHash !== candidate.philosophyAudit?.receiptHash) throw new Error('audit-philosophique-integre-different');
}

async function verifyRecovered(ctx, run, sha) {
  const git = integration.createShellGit();
  if (await integration.currentSha(git, run.worktree) !== sha) throw new Error('commit-recupere-head-deplace');
  const parent = await git.run(['rev-parse', `${sha}^`], run.worktree);
  if (parent.stdout.trim() !== run.base_sha) throw new Error('commit-recupere-base-differente');
  const result = JSON.parse(run.result_json);
  if (await treeHash(run.worktree) !== result.treeHash) throw new Error('commit-recupere-contenu-different');
  const candidate = workspaces.assertCandidate(ctx.project, result.candidateWorktree);
  verifyIntegratedAudit(ctx, run, { ...result, worktree: candidate });
}

async function completeIntegration(db, ctx, input) {
  await withTransaction(db, async () => {
    await finalizeExecution(db, { run: input.run, phase: 'integrated' });
    await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [input.run.task_id]);
    await db.run("UPDATE ontogenesis_runs SET status = 'integrated' WHERE id = ?", [input.run.id]);
    await db.run("UPDATE ontogenesis_projects SET state = 'PLANNING' WHERE id = ?", [ctx.project.id]);
  });
  await notify(db, { projectId: ctx.project.id, kind: 'result', payload: { sha: input.sha, taskId: input.run.task_id } });
  return { state: 'PLANNING', event: 'integrated', sha: input.sha };
}

async function processIntegration(db, ctx) {
  try {
    if (ctx.project.state === 'VERIFYING') return await verifyExecution(db, ctx);
    const run = await activeExecution(db, ctx.project.id);
    if (!run || run.phase !== 'verified') throw new Error('execution-non-verifiee');
    return await integrateCandidate(db, ctx, run);
  } catch (error) {
    return failExecution(db, ctx, error);
  }
}

module.exports = { processIntegration, verifyExecution, integrateCandidate };
