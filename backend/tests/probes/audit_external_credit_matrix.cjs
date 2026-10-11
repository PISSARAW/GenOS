'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');

const root = path.resolve(process.argv[2] || '');
const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8'));
const key = fs.readFileSync(path.join(root, 'public.pem'));

function open(name) {
  return new sqlite3.Database(path.join(root, name), sqlite3.OPEN_READONLY);
}

function all(db, sql, args = []) {
  return new Promise((resolve, reject) => db.all(sql, args,
    (error, rows) => error ? reject(error) : resolve(rows)));
}

function get(db, sql, args = []) {
  return new Promise((resolve, reject) => db.get(sql, args,
    (error, row) => error ? reject(error) : resolve(row)));
}

function close(db) {
  return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

function signed(value, schema) {
  assert.equal(value?.statement?.schema, schema);
  assert.equal(crypto.verify(null, Buffer.from(JSON.stringify(value.statement)),
    key, Buffer.from(value.signature, 'base64')), true);
  return value.statement;
}

async function assertEvent(db, input) {
  const rows = await all(db, `SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY id`, [input.agentId]);
  const event = rows.map((row) => JSON.parse(row.payload_json))
    .find((item) => item.executionRunId === input.runId);
  assert.ok(event, `Missing native evidence for ${input.runId}`);
  assert.equal(event.evidenceReport.outcome, 'success');
  return event.evidenceReport.workerArtifact.content;
}

async function assertRun(db, runId, agentId) {
  const run = await get(db, 'SELECT agent_id,status FROM strategy_execution_runs WHERE id=?', [runId]);
  assert.equal(run?.agent_id, agentId, runId);
  assert.equal(run.status, 'completed', runId);
}

async function auditCase(db, provider, item) {
  const targetId = `native-${item.kind}`;
  const helperId = `repair-${item.cycle}-${item.kind}`;
  await assertRun(db, item.targetRunId, targetId);
  await assertRun(db, item.helperRunId, helperId);
  const helper = await get(db, 'SELECT status,metadata_json FROM agents WHERE id=?', [helperId]);
  assert.equal(helper?.status, 'completed');
  const metadata = JSON.parse(helper.metadata_json);
  assert.equal(metadata.workerKind, 'recovery_worker');
  const lease = metadata.workerContract.mission.externalCreditLease;
  assert.equal(lease.operationId, item.operationId);
  assert.equal(lease.targetAgentId, targetId);
  const recovery = await get(db, `SELECT * FROM regulatory_external_recoveries
    WHERE operation_id=?`, [item.operationId]);
  assert.equal(recovery?.agent_id, targetId);
  assert.equal(recovery.recovery_agent_id, helperId);
  assert.equal(recovery.recovery_run_id, item.helperRunId);
  const providerRow = await get(provider, 'SELECT response_json FROM operations WHERE operation_id=?',
    [item.operationId]);
  const providerReceipt = JSON.parse(providerRow.response_json);
  const statement = signed(providerReceipt, 'genos.external-credit-receipt/v1');
  assert.equal(statement.kind, 'external_refill');
  assert.equal(statement.agentId, targetId);
  assert.equal(statement.amount, 5);
  assert.equal(statement.before, 2);
  assert.equal(statement.after, 7);
  const evidence = await assertEvent(db, { agentId: helperId, runId: item.helperRunId });
  assert.deepEqual(evidence.creditReceipt, providerReceipt);
  const observation = signed(evidence.creditObservation,
    'genos.external-credit-observation/v1');
  assert.equal(observation.agentId, targetId);
  assert.equal(observation.balance, 7);
  await assertEvent(db, { agentId: targetId, runId: item.targetRunId });
  const measured = JSON.parse(recovery.measurement_json);
  assert.equal(measured.agentId, targetId);
  assert.equal(measured.balance, 7);
  assert.equal(measured.accountVersion, statement.afterVersion);
  return { kind: item.kind, cycle: item.cycle, operationId: item.operationId,
    helperRunId: item.helperRunId, targetRunId: item.targetRunId,
    receiptVerified: true, nativeEvidence: true };
}

async function main() {
  assert.equal(report.schema, 'genos.external-credit-matrix/v1');
  assert.equal(report.kinds, 19);
  assert.equal(report.cases, 38);
  const db = open('genos.db');
  const provider = open('provider.db');
  try {
    const operations = new Set();
    const audited = [];
    for (const item of report.results) {
      assert.equal(operations.has(item.operationId), false);
      operations.add(item.operationId);
      audited.push(await auditCase(db, provider, item));
    }
    assert.equal(audited.length, 38);
    const ledger = await get(provider, 'SELECT initial,reserve,spent FROM ledger WHERE id=1');
    const balances = await all(provider, 'SELECT balance FROM accounts');
    const accountTotal = balances.reduce((sum, row) => sum + row.balance, 0);
    assert.equal(balances.length, 19);
    assert.equal(ledger.reserve + accountTotal + ledger.spent, ledger.initial);
    assert.equal(ledger.spent, 95);
    assert.equal(accountTotal, 133);
    const result = { schema: 'genos.external-credit-matrix-audit/v1', root,
      kinds: 19, cases: 38, verified: audited.length, conservation: true,
      reserve: ledger.reserve, accountTotal, spent: ledger.spent,
      entries: audited };
    fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify({ root, verified: result.verified,
      conservation: result.conservation }) + '\n');
  } finally {
    await close(db);
    await close(provider);
  }
}

main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });