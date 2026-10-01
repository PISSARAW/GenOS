'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixture = require('./ontogenesisFixture');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { activeExecution } = require('../src/services/ontogenesis/executionStore');
const integration = require('../src/services/ontogenesis/integrationService');
const workspaces = require('../src/services/ontogenesis/worktreeService');
const { getSpend } = require('../src/services/ontogenesis/ledgerService');

async function readyCandidate(db, root, harness) {
  const project = await fixture.project(db, root);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'execution-test', harness });
  assert.strictEqual((await tick()).state, 'PLANNING');
  assert.strictEqual((await tick()).state, 'EXECUTING');
  assert.strictEqual((await tick()).state, 'VERIFYING');
  return { project, tick };
}

async function successfulCommit(db, root) {
  const harness = fixture.fakeHarness(db);
  const ctx = await readyCandidate(db, root, harness);
  assert.strictEqual((await ctx.tick()).state, 'INTEGRATING');
  const outcome = await ctx.tick();
  assert.strictEqual(outcome.state, 'PLANNING');
  assert.match(outcome.sha, /^[a-f0-9]{40}$/);
  assert.strictEqual(harness.launches, 1);
  assert.strictEqual(await activeExecution(db, ctx.project.id), undefined);
  assert.strictEqual((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [ctx.project.task])).status, 'done');
  assert.strictEqual(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'module.exports = "initial";\n');
}

async function rejectedCheck(db, root) {
  const harness = fixture.fakeHarness(db);
  harness.failTests = true;
  const ctx = await readyCandidate(db, root, harness);
  const run = await activeExecution(db, ctx.project.id);
  assert.strictEqual((await ctx.tick()).state, 'WAITING_INPUT');
  const git = integration.createShellGit();
  assert.strictEqual(await integration.currentSha(git, run.worktree), run.base_sha);
  assert.strictEqual((await db.get('SELECT phase FROM ontogenesis_execution WHERE id = ?', [run.id])).phase, 'failed');
}

async function recoverCommit(db, root) {
  const ctx = await readyCandidate(db, root, fixture.fakeHarness(db));
  await ctx.tick();
  const run = await activeExecution(db, ctx.project.id);
  const result = JSON.parse(run.result_json);
  const authority = fixture.testConfig().authority;
  const git = integration.createShellGit();
  await workspaces.copyCandidate({ candidate: result.candidateWorktree, integration: run.worktree, files: result.files, authority });
  await integration.stageFiles(git, run.worktree, result.files);
  const message = integration.buildCommitMessage({ tag: 'FEAT', title: 'Crash recovery', operationId: run.id });
  await integration.commitStaged(git, run.worktree, { message, files: result.files });
  const sha = await integration.currentSha(git, run.worktree);
  assert.strictEqual((await ctx.tick()).sha, sha);
  const spent = await getSpend(db, ctx.project.id);
  await ctx.tick();
  assert.deepStrictEqual(await getSpend(db, ctx.project.id), spent);
  assert.strictEqual(await integration.currentSha(git, run.worktree), sha);
}

async function isolatedTest(test) {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try { await test(db, root); }
  finally { await db.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

async function main() {
  await isolatedTest(successfulCommit);
  await isolatedTest(rejectedCheck);
  await isolatedTest(recoverCommit);
  console.log('ontogenesis execution checks passed (injected worker, real checks and Git).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
