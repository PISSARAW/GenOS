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
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');
const { compileMission } = require('../src/services/ontogenesis/missionContextService');

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
  const success = await db.get("SELECT kind, payload_json FROM ontogenesis_ledger WHERE project_id = ? AND kind = 'attempt_succeeded'", [ctx.project.id]);
  assert.strictEqual(success.kind, 'attempt_succeeded');
  assert.strictEqual(JSON.parse(success.payload_json).commitSha, outcome.sha);
  assert.strictEqual(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), 'module.exports = "initial";\n');
}

async function sealedTrinitySnapshotsDoNotDirtyIntegration(db, root) {
  const created = await fixture.project(db, root);
  const project = await require('../src/services/ontogenesis/projectStore').getProject(db, created.id);
  const { worktree } = await workspaces.ensureIntegration(project);
  const snapshot = path.join(worktree, '.genos-agent-worlds', 'trinity-snapshots', 'a'.repeat(32), 'src');
  fs.mkdirSync(snapshot, { recursive: true });
  fs.writeFileSync(path.join(snapshot, 'pricing.js'), 'sealed baseline');
  assert.strictEqual((await workspaces.ensureIntegration(project)).worktree, worktree);
  fs.writeFileSync(path.join(worktree, 'untracked-source.js'), 'must be rejected');
  await assert.rejects(workspaces.ensureIntegration(project), /worktree-integration-sale/);
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
  const failure = await db.get("SELECT kind, payload_json FROM ontogenesis_ledger WHERE project_id = ? AND kind = 'attempt_failed'", [ctx.project.id]);
  assert.strictEqual(failure.kind, 'attempt_failed');
  assert.strictEqual(JSON.parse(failure.payload_json).executionId, run.id);
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

function failFirstDispatchStart(journal) {
  const transition = journal.transitionOperation;
  let failed = false;
  journal.transitionOperation = async (db, input) => {
    if (!failed && input.state === 'started' && input.operationId.startsWith('onto_run_')) {
      failed = true;
      throw new Error('injected-dispatch-crash');
    }
    return transition(db, input);
  };
  return () => { journal.transitionOperation = transition; };
}

async function retryPreparedDispatch(db, root) {
  const project = await fixture.project(db, root);
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'execution-recovery-test', harness });
  const journal = require('../src/services/ontogenesis/operationJournal');
  assert.strictEqual((await tick()).state, 'PLANNING');
  const restore = failFirstDispatchStart(journal);
  try {
    await assert.rejects(tick(), /injected-dispatch-crash/);
  } finally {
    restore();
  }
  await assertPreparedDispatch(db, project);
  assert.strictEqual((await tick()).state, 'EXECUTING');
  await assertRetriedDispatch(db, project, harness);
}

async function selectedTopologyContractMatchesDispatch(db, root) {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { react: '^18.0.0' }, scripts: { test: 'node -e "process.exit(0)"' }
  }));
  const project = await fixture.project(db, root);
  const config = fixture.testConfig();
  config.topologies = ['trinity'];
  const objective = 'Create a React reservation site';
  await db.run('UPDATE ontogenesis_projects SET objective = ?, config_json = ? WHERE id = ?',
    [objective, JSON.stringify(config), project.id]);
  assert.strictEqual(compileMission({ root_path: root, objective }).morphology.selectedTopology, 'a_team');
  const harness = fixture.fakeHarness(db);
  const start = harness.start;
  let dispatched;
  harness.start = (input) => { dispatched = input; return start(input); };
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'topology-contract-test', harness });
  assert.strictEqual((await tick()).state, 'PLANNING');
  assert.strictEqual((await tick()).state, 'EXECUTING');
  assert.ok(dispatched, 'dispatch input is captured');
  const request = requestFor(dispatched);
  assert.strictEqual(dispatched.selection.topology, 'trinity');
  assert.strictEqual(dispatched.mission.plan.topology, 'trinity');
  assert.strictEqual(dispatched.mission.plan.morphology.inferredTopology, 'a_team');
  assert.strictEqual(dispatched.mission.plan.topologyContract.mode, 'trinity');
  assert.deepStrictEqual(dispatched.selection.preflight.topology.contract.required,
    dispatched.mission.plan.topologyContract.required);
  assert.strictEqual(request.topologyId, dispatched.selection.topology);
  assert.strictEqual(request.morphologyPlan.selectedTopology, request.topologyId);
  assert.strictEqual(request.topologyContract.mode, request.topologyId);
  assert.strictEqual(request.missionCapabilityPlan.topologyContract.mode, request.topologyId);
  assert.deepStrictEqual(Object.keys(request.worker_assignments).sort(), dispatched.selection.workerRoles.sort());
}

async function configuredTopologyUsesDeclaredRuntimeCapabilities(db, root) {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const project = await fixture.project(db, root);
  const config = fixture.testConfig();
  config.topologies = ['trinity'];
  const objective = 'Create a React reservation site';
  await db.run('UPDATE ontogenesis_projects SET objective = ?, config_json = ? WHERE id = ?',
    [objective, JSON.stringify(config), project.id]);
  const harness = fixture.fakeHarness(db);
  const start = harness.start;
  let dispatched;
  harness.start = (input) => { dispatched = input; return start(input); };
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'topology-capability-test', harness });

  assert.strictEqual((await tick()).state, 'PLANNING');
  assert.strictEqual((await tick()).state, 'EXECUTING');
  assert.strictEqual(dispatched.selection.topology, 'trinity');
  assert.ok(dispatched.selection.preflight.execution.admitted.includes('verify'));
  assert.strictEqual(dispatched.mission.capabilities.includes('verify'), false,
    'inferred A-Team requirements remain separate from runtime availability');
}

async function configuredTopologyBlocksWhenRuntimeCapabilityIsMissing(db, root) {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  const project = await fixture.project(db, root);
  const config = fixture.testConfig();
  config.topologies = ['trinity'];
  config.availableCapabilities = config.availableCapabilities.filter((capability) => capability !== 'verify');
  const objective = 'Create a React reservation site';
  await db.run('UPDATE ontogenesis_projects SET objective = ?, config_json = ? WHERE id = ?',
    [objective, JSON.stringify(config), project.id]);
  const harness = fixture.fakeHarness(db);
  const tick = () => tickOnce(db, { projectId: project.id, owner: 'topology-capability-test', harness });

  assert.strictEqual((await tick()).state, 'PLANNING');
  const blocked = await tick();
  assert.strictEqual(blocked.state, 'WAITING_INPUT');
  assert.match(blocked.note, /aucune-topologie-admissible/);
  assert.strictEqual(harness.launches, 0, 'Trinity must stay blocked without its declared verify capability');
}

async function assertPreparedDispatch(db, project) {
  const operation = await db.get("SELECT * FROM ontogenesis_operations WHERE project_id = ? AND kind = 'dispatch'",
    [project.id]);
  assert.ok(operation);
  assert.strictEqual(operation.state, 'prepared');
  assert.strictEqual(operation.idempotency_key, `dispatch:${project.task}:0`);
  assert.strictEqual((await db.get('SELECT COUNT(*) AS count FROM ontogenesis_execution WHERE project_id = ?',
    [project.id])).count, 0);
  assert.strictEqual((await db.get('SELECT COUNT(*) AS count FROM ontogenesis_runs WHERE project_id = ?',
    [project.id])).count, 0);
  assert.strictEqual((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?',
    [project.task])).status, 'todo');
}

async function assertRetriedDispatch(db, project, harness) {
  const operations = await db.all("SELECT * FROM ontogenesis_operations WHERE project_id = ? AND kind = 'dispatch'",
    [project.id]);
  const executions = await db.all('SELECT * FROM ontogenesis_execution WHERE project_id = ?', [project.id]);
  const runs = await db.all('SELECT * FROM ontogenesis_runs WHERE project_id = ?', [project.id]);
  assert.strictEqual(operations.length, 1);
  assert.strictEqual(executions.length, 1);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(executions[0].id, operations[0].id);
  assert.strictEqual(operations[0].state, 'completed');
  assert.strictEqual(harness.launches, 1);
  assert.strictEqual((await db.get('SELECT COUNT(*) AS count FROM ontogenesis_recovery_receipts WHERE operation_id = ?',
    [operations[0].id])).count, 1);
}

async function isolatedTest(test) {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  try { await test(db, root); }
  finally { await db.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

async function main() {
  await isolatedTest(sealedTrinitySnapshotsDoNotDirtyIntegration);
  await isolatedTest(successfulCommit);
  await isolatedTest(rejectedCheck);
  await isolatedTest(recoverCommit);
  await isolatedTest(retryPreparedDispatch);
  await isolatedTest(selectedTopologyContractMatchesDispatch);
  await isolatedTest(configuredTopologyUsesDeclaredRuntimeCapabilities);
  await isolatedTest(configuredTopologyBlocksWhenRuntimeCapabilityIsMissing);
  console.log('ontogenesis execution checks passed (injected worker, real checks and Git).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
