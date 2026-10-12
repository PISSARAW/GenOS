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
  if (!validExecutionReceipt(testCase, execution)) return 'unverified';
  return 'passed';
}

async function verifyExecution(testCase, execution) {
  if (execution.provenance?.agentFramework === 'autogen-agentchat') {
    return require('./autogen-evidence.cjs').verifiedAutoGen(testCase, execution) ? null : 'failed';
  }
  return verifyNativeExecution(testCase, execution);
}

async function verifyNativeExecution(testCase, execution) {
  if (testCase.id === 'bounded-code') {
    return require('./bounded-code-oracle.cjs').verify(testCase, execution) ? null : 'failed';
  }
  const outcome = await resolveNativeOracle(testCase, execution);
  if (outcome === true) return null;
  if (outcome === false) return 'failed';
  if (outcome === 'unverified') return 'unverified';
  return null;
}

async function resolveNativeOracle(testCase, execution) {
  if (testCase.id === 'code-postconditions') return verifyStructured(testCase, execution);
  if (isArithmeticCase(testCase)) return verifyArithmetic(testCase, execution);
  if (hasStructuredOracle(testCase.workerKind)) return verifyStructured(testCase, execution);
  if (hasSpecializedOracle(testCase.workerKind)) return verifiedSpecialized(testCase, execution);
  return verifyMethodOracle(testCase, execution);
}

function verifyStructured(testCase, execution) {
  return require('./independent-structured-oracles.cjs').verify(testCase, execution);
}

function verifyArithmetic(testCase, execution) {
  return require('./independent-structured-oracles.cjs').verifyArithmetic(testCase, execution);
}

function isArithmeticCase(testCase) {
  return testCase.workerKind === 'formal_worker' && testCase.methodContract?.methodId === 'check_arithmetic';
}

function hasSpecializedOracle(kind) {
  return ['red_worker', 'experimental_worker', 'synthesis_worker', 'resident_daemon',
    'forensic_worker', 'scout_cell', 'teaching_worker'].includes(kind);
}

async function verifyMethodOracle(testCase, execution) {
  if (testCase.workerKind === 'procedural_executor') return verifiedProcedure(testCase, execution);
  if (testCase.workerKind === 'verifier_worker') return verifiedVerification(testCase, execution);
  if (testCase.workerKind === 'formal_worker') {
    return await verifiedFormalReceipt(testCase, execution) ? true : 'unverified';
  }
  return null;
}

function hasStructuredOracle(kind) {
  return ['adaptive_worker', 'specialist', 'symbiotic_worker', 'creative_worker', 'bounded_worker',
    'medical_worker', 'recovery_worker', 'liaison_worker', 'sub_orchestrator'].includes(kind);
}

function verifiedSpecialized(testCase, execution) {
  const independent = require('./independent-observation-oracles.cjs');
  if (testCase.workerKind === 'scout_cell') return independent.verifyScout(testCase, execution);
  if (testCase.workerKind === 'forensic_worker') return independent.verifyForensic(testCase, execution);
  if (testCase.workerKind === 'teaching_worker') return independent.verifyTeaching(testCase, execution);
  if (testCase.workerKind === 'red_worker') return verifiedRed(testCase, execution);
  if (testCase.workerKind === 'experimental_worker') return verifiedExperiment(testCase, execution);
  if (testCase.workerKind === 'synthesis_worker') return verifiedSynthesis(testCase, execution);
  if (testCase.workerKind === 'forensic_worker') return verifiedForensic(testCase, execution);
  if (testCase.workerKind === 'scout_cell') return verifiedScout(testCase, execution);
  if (testCase.workerKind === 'teaching_worker') return verifiedTeaching(testCase, execution);
  return verifiedMonitor(testCase, execution);
}

function verifiedVerification(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerVerifier')
    .runVerification(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.expectedReceipt.id;
}

function verifiedRed(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerRed')
    .runRed(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.expectedReceipt.id
    && expected.counterexample !== null;
}

function verifiedExperiment(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerExperiment')
    .runExperiment(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.procedureReceipt.id;
}

function verifiedSynthesis(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerSynthesis')
    .runSynthesis(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.synthesisReceipt.id;
}

function verifiedMonitor(testCase, execution) {
  const expected = require('../../backend/src/services/agents/deterministicWorkerMonitor')
    .runMonitor(testCase.methodContract);
  return JSON.stringify(execution.result) === JSON.stringify(expected)
    && execution.receipt?.id === expected.monitorReceipt.id;
}

function validReceipt(receipt) {
  return typeof receipt?.id === 'string' && /^(solver|agent):\/\/sha256:[a-f0-9]{64}$/.test(receipt.id);
}

function validExecutionReceipt(testCase, execution) {
  if (testCase.id === 'bounded-code') return require('./bounded-code-oracle.cjs')
    .biologicalReceiptValid(execution.receipt, execution.result?.mission);
  return validReceipt(execution.receipt);
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
    const checked = await require('../../backend/src/services/agents/deterministicWorkerFormal')
      .runFormal(method, { timeoutMs: 120000 });
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
