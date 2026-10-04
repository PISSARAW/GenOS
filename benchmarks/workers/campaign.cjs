'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { CASES } = require('./cases.cjs');

function suiteDigest(cases) {
  return `sha256:${createHash('sha256').update(JSON.stringify(cases)).digest('hex')}`;
}

async function score(testCase, execution) {
  if (!testCase.oracle) return 'unmeasured';
  if (execution.status === 'failed') return 'failed';
  if (execution.status !== 'executed') return 'unmeasured';
  const verification = await verifyExecution(testCase, execution);
  if (verification) return verification;
  const value = testCase.oracle.path.split('.').reduce((item, key) => item?.[key], execution.result);
  if (value !== testCase.oracle.equals) return 'failed';
  if (!validReceipt(execution.receipt)) return 'unverified';
  return 'passed';
}

async function verifyExecution(testCase, execution) {
  if (testCase.workerKind === 'procedural_executor' && !verifiedProcedure(testCase, execution)) return 'failed';
  if (testCase.workerKind === 'verifier_worker' && !verifiedVerification(testCase, execution)) return 'failed';
  if (testCase.workerKind === 'formal_worker' && !(await verifiedFormalReceipt(testCase, execution))) return 'unverified';
  return null;
}

function verifiedVerification(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerVerifier')
    .runVerification(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.expectedReceipt.id;
}

function validReceipt(receipt) {
  return typeof receipt?.id === 'string' && /^solver:\/\/sha256:[a-f0-9]{64}$/.test(receipt.id);
}

function verifiedProcedure(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerProcedures').runProcedure(testCase.methodContract);
  return JSON.stringify(execution.result?.output) === JSON.stringify(expected.output)
    && execution.receipt?.id === expected.receipt.id;
}

async function verifiedFormalReceipt(testCase, execution) {
  const version = execution.receipt?.toolchainVersion;
  if (typeof version !== 'string' || !version.trim()) return false;
  const method = { ...testCase.methodContract, parameters: { ...testCase.methodContract.parameters,
    toolchainVersion: version } };
  try {
    const checked = await require('../../backend/src/services/agents/deterministicWorkerFormal').runFormal(method);
    return checked.solverReceipt.id === execution.receipt.id
      && checked.solverReceipt.sourceDigest === execution.receipt.sourceDigest;
  } catch (_) { return false; }
}

async function runCampaign(adapter, systemId, cases = CASES) {
  if (typeof adapter?.runCase !== 'function' || !String(systemId || '').trim()) {
    throw new Error('A runCase adapter and nonempty systemId are required.');
  }
  const results = [];
  for (const testCase of cases) {
    const started = process.hrtime.bigint();
    let execution;
    try { execution = await adapter.runCase(testCase); }
    catch (error) { execution = { status: 'failed', reason: error.message }; }
    const latencyMs = Number(process.hrtime.bigint() - started) / 1000000;
    results.push({ id: testCase.id, workerKind: testCase.workerKind, score: await score(testCase, execution),
      latencyMs, execution });
  }
  return { systemId, suiteDigest: suiteDigest(cases), capturedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform }, results };
}

function summary(report) {
  const counts = { passed: 0, failed: 0, unverified: 0, unmeasured: 0 };
  for (const row of report.results) counts[row.score] += 1;
  return { ...counts, total: report.results.length, kinds: new Set(report.results.map((row) => row.workerKind)).size };
}

async function main(argv = process.argv.slice(2)) {
  const [adapterPath, systemId, outputPath] = argv;
  if (!adapterPath || !systemId || !outputPath) throw new Error('Usage: node campaign.cjs <adapter.cjs> <system-id> <output.json>');
  const adapter = require(path.resolve(adapterPath));
  const report = await runCampaign(adapter, systemId);
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary(report))}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { CASES, suiteDigest, score, runCampaign, summary };
