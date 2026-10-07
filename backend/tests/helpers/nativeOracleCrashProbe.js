'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function qualify(db, phase = 'intent') {
  const source = await require('../test_native_memory_budget').source(db);
  const child = fork(path.join(__dirname, 'nativeOracleCrashChild.cjs'), [JSON.stringify(source.method), phase],
    { cwd: path.resolve(__dirname, '../../..'), silent: true, windowsHide: true });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const { request, execution } = await waitForBarrier(child);
    assert.equal(execution.phase, phase);
    if (phase === 'finished') assertRealClosure(execution);
    const allocation = await journal.read(db, { ...request, kind: 'reservation' });
    assert.equal(allocation.value.executionAccounting, 'genos.native-oracle-execution/v1');
    assert.equal(await journal.read(db, { ...request, kind: `execution_${execution.strategy}_finished` }), null);
    child.kill();
    await exited;
    const view = await require('../../src/services/epistemic/nativeOracleInspection').inspect(db, request);
    assert.equal(view.status, 'reserved');
    assert.equal(view.costs.processes, null);
    assert.equal(view.costs.runtimeMs, null);
    assert.equal(view.costs.complete, false);
    assert.equal(view.costs.unresolvedExecutions, 1);
    assert.equal(await journal.read(db, { ...request, kind: 'attestation' }), null);
    await assert.rejects(require('../../src/services/epistemic/nativeOracleCoordinator').prepare(db, request),
      { code: 'ORACLE_ALLOCATION_ALREADY_RESERVED' });
    await freshProcess(request, view.costs);
    const again = await require('../../src/services/epistemic/nativeOracleInspection').inspect(db, request);
    assert.deepEqual(again.costs, view.costs);
    console.log(JSON.stringify({ schema: 'genos.test.oracle-crash-observation/v1', phase,
      executionId: execution.executionId, processId: execution.processId ?? null,
      exitCode: execution.exitCode ?? null, processOutcome: execution.processOutcome ?? null,
      durationMs: execution.durationMs ?? null, durableCosts: view.costs }));
    console.log(`Real control-plane crash at ${phase}: unknown costs retained, fresh replay refused without relaunch.`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
}

function assertRealClosure(execution) {
  assert.ok(execution.processId > 0);
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.timedOut, false);
  assert.equal(execution.processOutcome, 'verified');
  assert.ok(execution.durationMs >= 0);
}

function waitForBarrier(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.stdout.resume();
    const timer = setTimeout(() => reject(new Error('Crash probe missed the execution barrier. ' + stderr)), 20000);
    child.once('error', failure => { clearTimeout(timer); reject(failure); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Crash probe exited before the barrier. ' + stderr)); });
    child.on('message', item => {
      if (item.schema === 'genos.test.oracle-barrier/v1') { clearTimeout(timer); resolve(item); }
    });
  });
}

async function freshProcess(request, costs) {
  const script = `process.env.GENOS_DISABLE_DOTENV='1';
    const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    const request=JSON.parse(process.argv[2]);
    require('./backend/src/services/epistemic/nativeOracleCoordinator').prepare(db,request)
    .then(()=>{throw new Error('Unfinished allocation replayed');})
    .catch(async error=>{if(error.code!=='ORACLE_ALLOCATION_ALREADY_RESERVED')throw error;
      console.log(JSON.stringify(await require('./backend/src/services/epistemic/nativeOracleInspection').inspect(db,request)));})
    .catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());`;
  const child = require('node:child_process').spawnSync(process.execPath,
    ['-e', script, process.env.GENOS_DB_PATH, JSON.stringify(request)],
    { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout).costs, costs);
}

module.exports = { qualify };
