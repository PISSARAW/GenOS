'use strict';

const fixture = require('./helpers/biologicalWorkerRestartFixture');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {openDatabase} = require('./helpers/biologyDatabase');
const {completion} = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const promotion = require('../src/services/strategyPromotionGate');
const {digest} = require('../src/services/biologicalIntegrity');

async function prepare(db) {
  const record = await fixture.setup(db);
  record.contract.promotion.require_replay = true;
  await db.run('UPDATE strategy_contracts SET contract_json=?,contract_hash=? WHERE id=?',
    JSON.stringify(record.contract), `sha256:${digest(record.contract)}`, record.id);
  return record;
}

async function verifyCompletedWorker(db, filename, record) {
  const run = await fixture.createRun(db, filename, record);
  const child = spawnSync(process.execPath,
    [path.join(__dirname, 'helpers/biologicalWorkerProbe.cjs'), 'execute', filename, run.id],
    {encoding: 'utf8', timeout: 30000, windowsHide: true});
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  const reference = await fixture.observeAndVerify(db, run, output.report);
  const event = completion(run.id, {report: output.report, usage: {total_tokens: 0, cost_usd: 0}});
  event.payload.nativeOracleRef = reference;
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.run.status, 'completed');
  assert.equal(saved.biologicalReceipt.result.verified, true,
    'A completed native semantic proof certifies worker completion, independently of later promotion.');
  assert.equal(saved.biologicalReceipt.result.reason, null);
  assert.match(saved.biologicalReceipt.result.promotionReason, /require_replay/);
  assert.equal(saved.biologicalReceipt.semanticVerification.costs.processes, 2);
  const terminal = (await require('../src/services/biologicalWorkerStore').observations(db, run.id))
    .find(row => row.applied && row.event.eventType === 'AGENT_COMPLETED');
  const historical = await require('../src/services/epistemic/nativeOracleGate').historical(db,
    {runId: run.id, agentId: 'worker', event: terminal.event});
  assert.match(promotion.completionGuardrail(record.contract, terminal.event.payload,
    {agentId: 'worker', gateContext: historical.gateContext}), /require_replay/,
  'The unchanged promotion gate still refuses promotion without replay.');
}

async function rejectCallerFlags(db, filename, record) {
  const run = await fixture.createRun(db, filename, record);
  const event = completion(run.id, {usage: {total_tokens: 0, cost_usd: 0}});
  Object.assign(event.payload, {evidenceVerified: true, independentVerification: true});
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  assert.equal(saved.biologicalReceipt.result.verified, false,
    'Caller flags and a terminal transport event cannot replace native semantic evidence.');
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-promotion-'));
  fs.mkdirSync(path.join(root, 'workspace'));
  const filename = path.join(root, 'runtime.sqlite'), db = openDatabase(filename);
  const telemetry = require('../src/services/telemetryObserver'), previous = telemetry.persistAsync;
  telemetry.persistAsync = () => {};
  try {
    const record = await prepare(db);
    await verifyCompletedWorker(db, filename, record);
    await rejectCallerFlags(db, filename, record);
  } finally {
    telemetry.persistAsync = previous;
    await db.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('genos-worker-promotion-'));
    fs.rmSync(root, {recursive: true, force: true});
  }
  console.log('Two real oracle processes verify worker completion while replay promotion remains refused; unattested caller flags remain rejected: PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
