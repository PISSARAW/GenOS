'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./ontogenesisFixture');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { activeExecution } = require('../src/services/ontogenesis/executionStore');
const { verifyExecution, integrateCandidate } = require('../src/services/ontogenesis/integrationController');
const integration = require('../src/services/ontogenesis/integrationService');
const workspaces = require('../src/services/ontogenesis/worktreeService');
const { compileRegistry } = require('../src/philosophy/implementationContracts');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { fixture: observationsFor } = require('../src/philosophy/contractExperiments');
const { referenceFor, OBSERVATION_FILE } = require('../src/services/ontogenesis/philosophicalMissionContract');

const contracts = compileRegistry(CONCEPT_DEFINITIONS).contracts;
const references = contracts.map(referenceFor);

async function prepared(db, root) {
  const project = await fixture.project(db, root);
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'philosophy-test', harness });
  assert.equal((await tick()).state, 'PLANNING');
  assert.equal((await tick()).state, 'EXECUTING');
  assert.equal((await tick()).state, 'VERIFYING');
  const row = await db.get('SELECT * FROM ontogenesis_projects WHERE id = ?', [project.id]);
  return { project: row, config: fixture.testConfig(), fence: async () => {},
    mission: { plan: { philosophicalContracts: { contracts: references } } } };
}

function bindCandidate(run, candidate) {
  const artifact = { missionId: run.id, contractHashes: {}, bindings: {} };
  const values = {};
  for (const contract of contracts) {
    Object.assign(values, observationsFor(contract, 'satisfying'));
    artifact.contractHashes[contract.id] = referenceFor(contract).contractHash;
    artifact.bindings[contract.execution.field] = { file: 'evidence.json', pointer: '/' + contract.execution.field };
  }
  fs.mkdirSync(path.join(candidate, '.genos'), { recursive: true });
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify(artifact));
  fs.writeFileSync(path.join(candidate, 'evidence.json'), JSON.stringify(values));
  return artifact;
}

async function verifyBoundCandidate(db, ctx) {
  const run = await activeExecution(db, ctx.project.id);
  const candidate = JSON.parse(run.result_json).candidateWorktree;
  await assert.rejects(() => verifyExecution(db, ctx), /ENOENT/);
  assert.equal((await activeExecution(db, ctx.project.id)).phase, run.phase);
  const artifact = bindCandidate(run, candidate);
  assert.equal((await verifyExecution(db, ctx)).state, 'INTEGRATING');
  const verified = await activeExecution(db, ctx.project.id);
  const result = JSON.parse(verified.result_json);
  assert.equal(result.philosophyAudit.contracts.length, 375);
  assert.equal(result.philosophyAudit.independentValidation, false);
  return { run: verified, result, candidate, artifact };
}

async function normalIntegration(db, root) {
  const ctx = await prepared(db, root);
  const { run, candidate, artifact } = await verifyBoundCandidate(db, ctx);
  const git = integration.createShellGit();
  const before = await integration.currentSha(git, run.worktree);
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify({ ...artifact, missionId: 'wrong-mission' }));
  await assert.rejects(() => integrateCandidate(db, ctx, run), /autre-mission/);
  assert.equal(await integration.currentSha(git, run.worktree), before);
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify(artifact));
  let fences = 0;
  ctx.fence = async () => {
    fences += 1;
    fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify({ ...artifact, missionId: 'fence-race' }));
  };
  await assert.rejects(() => integrateCandidate(db, ctx, run), /autre-mission/);
  assert.equal(fences, 1);
  assert.equal(await integration.currentSha(git, run.worktree), before);
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify(artifact));
  ctx.fence = async () => {};
  const outcome = await integrateCandidate(db, ctx, run);
  assert.equal(outcome.state, 'PLANNING');
  assert.match(outcome.sha, /^[a-f0-9]{40}$/);
  assert.equal(fs.existsSync(path.join(run.worktree, OBSERVATION_FILE)), false);
  assert.equal(fs.existsSync(path.join(run.worktree, 'evidence.json')), true);
}

async function recoveredIntegration(db, root) {
  const ctx = await prepared(db, root);
  const { run, result, candidate, artifact } = await verifyBoundCandidate(db, ctx);
  const git = integration.createShellGit();
  await integration.openIntegration(db, { id: run.id, projectId: ctx.project.id, taskId: run.task_id, baseSha: run.base_sha });
  await workspaces.copyCandidate({ candidate, integration: run.worktree, files: result.files, authority: ctx.config.authority });
  await integration.stageFiles(git, run.worktree, result.files);
  const message = integration.buildCommitMessage({ tag: 'FEAT', title: 'Philosophy recovery test', operationId: run.id });
  await integration.commitStaged(git, run.worktree, { message, files: result.files });
  const sha = await integration.currentSha(git, run.worktree);
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify({ ...artifact, missionId: 'wrong-mission' }));
  await assert.rejects(() => integrateCandidate(db, ctx, run), /autre-mission/);
  assert.equal((await activeExecution(db, ctx.project.id)).phase, 'verified');
  fs.writeFileSync(path.join(candidate, OBSERVATION_FILE), JSON.stringify(artifact));
  assert.equal((await integrateCandidate(db, ctx, run)).sha, sha);
  assert.equal(await activeExecution(db, ctx.project.id), undefined);
}

async function isolated(test) {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try { await test(db, root); }
  finally { await db.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

(async () => {
  await isolated(normalIntegration);
  await isolated(recoveredIntegration);
  console.log('375 bounded audits: real checks/Git, missing artifacts, fence races and recovery gates passed (injected worker).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
