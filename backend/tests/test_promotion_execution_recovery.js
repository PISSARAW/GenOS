'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const execution = require('../src/services/strategyExecutionService');
const journal = require('../src/services/promotionExecutionJournal');
const fixture = require('./helpers/consumerPromotionFixture.cjs');
const worker = path.join(__dirname, 'helpers/promotionRecoveryWorker.cjs');

async function prepare(root, merge = false) {
  fs.mkdirSync(root);
  const spec = await fixture.prepare(root, { merge });
  const input = { filename: spec.filename, runId: spec.run.id, options: spec.options };
  await closeDatabase();
  return input;
}

function runChild(input) {
  const child = spawnSync(process.execPath, [worker, JSON.stringify(input)], { encoding: 'utf8', timeout: 90000,
    windowsHide: true, env: { ...process.env, GENOS_DB_BOOTSTRAP_SKIP: '1' } });
  return { code: child.status, output: child.stdout + child.stderr };
}

async function assertCompleted(input) {
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  const db = await getDatabase(input.filename);
  try {
    const row = await journal.read(db, input.runId);
    assert.equal(row.phase, 'completed');
    const count = await db.get("SELECT count(*) AS n FROM primitive_execution_journal WHERE agent_id = 'consumer-promotion-agent'");
    assert.equal(count.n, row.payload.primitives.length, 'Each actual primitive has one committed execution');
    const trajectory = await db.get("SELECT count(*) AS n FROM trajectories WHERE author_id = 'consumer-promotion-agent'");
    assert.equal(trajectory.n, 1, 'One canonical golden-path trajectory survives transaction and recovery');
    const memory = await db.get("SELECT count(*) AS n FROM provenance_records WHERE subject_type = 'strategy_promotion'");
    assert.equal(memory.n, 1, 'One promotion provenance parent survives finalization');
    assert.equal((await execution.approveRun(db, input.runId, input.options)).status, 'completed');
    await db.run("UPDATE strategy_execution_runs SET status = 'blocked' WHERE id = ?", input.runId);
    await assert.rejects(execution.approveRun(db, input.runId, input.options), /PROMOTION_RUN_STATE_CHANGED/);
    await db.run("UPDATE strategy_execution_runs SET status = 'completed' WHERE id = ?", input.runId);
    const binding = await journal.runBinding(db, input.runId);
    await db.run("UPDATE strategy_contracts SET contract_hash = 'altered' WHERE id = ?", binding.contract_id);
    await assert.rejects(execution.approveRun(db, input.runId, input.options), /PROMOTION_BINDING_CHANGED/);
    await db.run('UPDATE strategy_contracts SET contract_hash = ? WHERE id = ?', binding.contract_hash, binding.contract_id);
    await assert.rejects(execution.approveRun(db, input.runId, { ...input.options, summary: 'changed' }), /PROMOTION_REQUEST_CHANGED/);
    await db.run("UPDATE promotion_execution_journal SET phase = 'reserved' WHERE run_id = ?", input.runId);
    await assert.rejects(journal.read(db, input.runId), /PROMOTION_JOURNAL_INTEGRITY/);
  } finally { await closeDatabase(); delete process.env.GENOS_DB_BOOTSTRAP_SKIP; }
}

async function crashScenario(root, crash) {
  const merge = ['after_merge', 'partial_merge'].includes(crash);
  const input = await prepare(path.join(root, crash), merge);
  const marker = path.join(root, `${crash}.marker`);
  const killed = runChild({ ...input, crash, marker });
  assert.notEqual(killed.code, 0, killed.output);
  assert.ok(fs.existsSync(marker), killed.output);
  assert.equal(fs.readFileSync(marker, 'utf8'), crash, killed.output);
  const target = merge ? path.join(input.options.targetWorkspaceRoot, 'one.txt') : null;
  const priorMtime = target && fs.statSync(target).mtimeMs;
  const resumed = runChild(input);
  assert.equal(resumed.code, 0, resumed.output);
  if (target) {
    assert.equal(fs.readFileSync(target, 'utf8'), 'new one');
    assert.equal(fs.statSync(target).mtimeMs, priorMtime, 'Already published postimage must not be written again');
    assert.equal(fs.readFileSync(path.join(input.options.targetWorkspaceRoot, 'two.txt'), 'utf8'), 'new two');
  }
  await assertCompleted(input);
  console.log(`PASS crash ${crash}: reopened database, exactly one committed pipeline and finalization`);
}

function racingChild(input) {
  const child = fork(worker, [JSON.stringify({ ...input, barrier: true })], { silent: true, windowsHide: true,
    env: { ...process.env, GENOS_DB_BOOTSTRAP_SKIP: '1' } });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const ready = new Promise((resolve, reject) => {
    child.on('message', message => { if (message.ready) resolve(); });
    child.on('exit', code => { if (code) reject(new Error(output)); });
    child.on('error', reject);
  });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Race timeout')); }, 90000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, output }); });
    child.on('error', reject);
  });
  return { child, ready, done };
}

async function freshBatches(root) {
  const input = await prepare(path.join(root, 'race'));
  const runners = [racingChild(input), racingChild(input)];
  try {
    await Promise.all(runners.map(item => item.ready));
    runners.forEach(item => item.child.send({ go: true }));
    const outcomes = await Promise.all(runners.map(item => item.done));
    assert.deepEqual(outcomes.map(item => item.code).sort(), [0, 1], JSON.stringify(outcomes));
    assert.match(outcomes.find(item => item.code === 1).output, /PROMOTION_ALREADY_RESERVED/);
    process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
    const db = await getDatabase(input.filename);
    assert.equal((await db.get('SELECT count(*) AS n FROM aeis_assurance_assemblies')).n, 2, 'Two independently fresh batches were verified');
    assert.equal((await db.get('SELECT count(*) AS n FROM verifier_receipt_nonces')).n, 2, 'Only winning batch nonces are committed');
    await closeDatabase();
    delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
    await assertCompleted(input);
    console.log('PASS two native processes with fresh batches: one winner, one reservation conflict, no duplicate effects');
  } finally { runners.forEach(item => { if (item.child.exitCode === null) item.child.kill(); }); }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-promotion-recovery-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'promotion-recovery-test-only';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'promotion-recovery-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  try {
    await freshBatches(root);
    for (const crash of ['in_effect', 'after_pipeline', 'in_finalization', 'after_commit', 'after_merge', 'partial_merge']) await crashScenario(root, crash);
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
