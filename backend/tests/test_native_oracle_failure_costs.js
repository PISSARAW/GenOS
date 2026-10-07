'use strict';

const { seed } = require('./test_bounded_worker_delegation');
const fixture = require('./test_native_memory_budget');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { getDatabase, closeDatabase } = require('../src/db');
const journal = require('../src/services/epistemic/nativeOracleJournal');
const executor = require('../src/services/epistemic/oracleNativeProcess');
let observedBatch;

async function isolated(probe) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-oracle-failure-cost-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Native failure accounting probe');
  process.env.GENOS_DB_PATH = path.join(root, 'cost.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  const bridge = require('../src/services/epistemic/verifierRuntimeBridge');
  const original = bridge.executeVerifierWorkers;
  observedBatch = null;
  bridge.executeVerifierWorkers = async (...args) => {
    observedBatch = await original(...args);
    return observedBatch;
  };
  try { await seed(db, workspace, { problemProfile: { reversibility: 'low' } }); await probe(db); }
  finally {
    bridge.executeVerifierWorkers = original;
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function memoryRetraction(db) {
  const input = await fixture.source(db);
  const original = executor.run;
  let injected = false;
  executor.run = async (subject, options) => {
    const result = await original(subject, options);
    if (options.kind === 'memory' && !injected) {
      injected = true;
      const saved = await require('../src/services/aeisAssemblyStore').readAssembly(db, input.subject.binding.assemblyId);
      await require('../src/services/aeisAssemblyRetraction').retract(db, { assemblyId: input.subject.binding.assemblyId,
        scope: input.subject.binding.scope, expectedAssemblyHash: saved.validity.assemblyHash,
        actorId: 'independent-test-reviewer', rationale: 'Withdraw the source after the real oracle process returned.' });
    }
    return result;
  };
  let checked;
  try { checked = await fixture.dispatch(db, input.method); }
  finally { executor.run = original; }
  assert.equal(injected, true);
  assert.equal(checked.result.success, false);
  await assertAborted(db, checked, 'AEIS_ASSEMBLY_RETRACTED');
}

async function assertAborted(db, checked, reason) {
  const view = await require('../src/services/epistemic/nativeOracleInspection').inspect(db, checked.request);
  assert.equal(view.status, 'aborted', JSON.stringify(view));
  assert.equal(view.reason, reason);
  assert.equal(view.costs.processes, 1, 'a rejected real process must not disappear from cost accounting');
  assert.equal(view.costs.complete, true);
  assert.ok(view.costs.runtimeMs >= 0);
  const verifier = observedBatch.results[0];
  assert.equal(verifier.status, 'error');
  assert.equal(verifier.receipt.status, 'error');
  assert.equal(verifier.receipt.executionEvidence.length, 1);
  const detail = verifier.receipt.executionEvidence[0];
  assert.equal(detail.guardFailure, reason);
  assert.equal(detail.outcome, 'error');
  assert.ok(detail.processId > 0);
  assert.equal(detail.durationMs, view.costs.runtimeMs);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  const receipt = await require('../src/services/biologicalWorkerStore').receipt(db, checked.row.id);
  assert.equal(receipt.result.verified, false);
  assert.deepEqual(receipt.oracleExecution.costs, view.costs);
  assert.equal(receipt.costs.find(item => item.register === 'worker_llm_tokens').quantity, 0);
  await assert.rejects(require('../src/services/epistemic/nativeOracleCoordinator').prepare(db, checked.request),
    { code: 'ORACLE_EXECUTION_ABORTED' });
  const costs = await require('../src/services/epistemic/nativeOracleExecutionJournal').costs(db,
    { allocation: await journal.read(db, { ...checked.request, kind: 'reservation' }) });
  assert.deepEqual(costs, view.costs);
  await freshProcess(checked.request, view.costs);
}

async function freshProcess(request, expected) {
  const script = `process.env.GENOS_DISABLE_DOTENV='1';
    const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    require('./backend/src/services/epistemic/nativeOracleInspection').inspect(db,JSON.parse(process.argv[2]))
    .then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());`;
  const child = require('node:child_process').spawnSync(process.execPath,
    ['-e', script, process.env.GENOS_DB_PATH, JSON.stringify(request)],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout).costs, expected);
}

async function main() {
  const probes = require('./helpers/nativeOracleFailureProbes');
  const cases = { memory: memoryRetraction,
    mutation: db => probes.subjectMutation(db, assertAborted),
    expiry: db => probes.budgetExpiry(db, assertAborted),
    crash: require('./helpers/nativeOracleCrashProbe').qualify,
    crash_after_close: db => require('./helpers/nativeOracleCrashProbe').qualify(db, 'finished'),
    binding: require('./helpers/nativeOracleCostBindingProbe').qualify };
  if (process.argv[2]) return isolated(cases[process.argv[2]]);
  for (const name of Object.keys(cases)) {
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, name],
      { stdio: 'inherit', timeout: 60000, windowsHide: true });
    assert.equal(child.status, 0, `Native oracle failure probe ${name} failed`);
  }
  console.log('Native oracle failure costs: real post-process retraction stays refused with durable costs and fresh replay.');
}

main().catch(failure => { console.error(failure); process.exitCode = 1; });
