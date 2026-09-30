'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ARMS = [
  { id: 'alone', removed: ['morphogenesis', 'verification', 'daemons', 'memory', 'counterfactuals', 'topology-composition'] },
  { id: 'genos', removed: [] },
  ...['morphogenesis', 'verification', 'daemons', 'memory', 'counterfactuals', 'topology-composition']
    .map((feature) => ({ id: `without-${feature}`, removed: [feature] }))
];

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function validateSuite(suite) {
  validateSuiteHeader(suite);
  suite.cases.forEach(validateCase);
}

function validateSuiteHeader(suite) {
  if (!suite.suiteId || !Array.isArray(suite.cases) || !suite.cases.length) throw new Error('Suite requires suiteId and non-empty cases.');
  if (!Number.isInteger(suite.repetitions) || suite.repetitions < 3) throw new Error('Confirmatory runs require at least 3 repetitions.');
  if (!suite.budget || !Array.isArray(suite.allowedTools)) throw new Error('Suite requires budget and allowedTools controls.');
}

function validateCase(item) {
  if (!item.id || !item.family || !item.input) throw new Error('Every case requires id, family, and input.');
}

function validateReceipt(receipt) {
  if (!receipt || !receipt.verifierId || !receipt.verifierDigest || !receipt.method) return false;
  return ['VERIFIED', 'REFUTED', 'INCONCLUSIVE', 'UNAVAILABLE'].includes(receipt.result)
    && Array.isArray(receipt.evidence) && receipt.evidence.length > 0;
}

function validateIdentity(result, expected) {
  const identity = {
    modelId: result.modelId,
    modelVersion: result.modelVersion,
    harnessId: result.harnessId,
    harnessVersion: result.harnessVersion,
    parameterDigest: result.parameterDigest,
    budget: result.budget
  };
  if (Object.values(identity).some((value) => value === undefined || value === null)) throw new Error('Adapter omitted controlled model, harness, parameter, or budget identity.');
  if (expected && digest(identity) !== digest(expected)) throw new Error('Paired arm changed a controlled model, harness, parameter, or budget identity.');
  return identity;
}

async function executeArm({ adapter, suite, task, repetition, arm, seed, expectedIdentity }) {
  const request = {
    suiteId: suite.suiteId, task, repetition, arm: arm.id, mode: arm.id,
    removedFeatures: arm.removed, seed, budget: suite.budget,
    allowedTools: suite.allowedTools, stateDigest: digest(task.input)
  };
  try {
    return makeArmRecord(await adapter.executeCase(request), request, expectedIdentity);
  } catch (error) {
    rethrowControlMismatch(error);
    return failedArmRecord(request, error);
  }
}

function makeArmRecord(result, request, expectedIdentity) {
  const identity = validateIdentity(result, expectedIdentity);
  if (typeof result.rawOutput !== 'string' || !result.rawOutput.length) throw new Error('Adapter returned no raw output.');
  return {
    request, identity,
    status: validateReceipt(result.verificationReceipt) ? 'measured' : 'unverified',
    result: result.result ?? null,
    rawOutput: result.rawOutput,
    verificationReceipt: result.verificationReceipt ?? null,
    metrics: measuredMetrics(result.metrics)
  };
}

function measuredMetrics(metrics = {}) {
  return { tokens: metrics.tokens ?? null, latencyMs: metrics.latencyMs ?? null,
    cost: metrics.cost ?? null, toolCalls: metrics.toolCalls ?? null };
}

function rethrowControlMismatch(error) {
  if (error.message.startsWith('Paired arm changed') || error.message.startsWith('Adapter omitted')) throw error;
}

function failedArmRecord(request, error) {
  return { request, status: 'error', error: error.message, result: null,
    rawOutput: null, verificationReceipt: null, metrics: null };
}

async function runSuite(suite, adapter) {
  validateSuite(suite);
  if (!adapter || typeof adapter.executeCase !== 'function') throw new Error('No live adapter is configured; no scores were produced.');
  const records = [];
  for (const task of suite.cases) {
    for (let repetition = 1; repetition <= suite.repetitions; repetition += 1) {
      let identity = null;
      const seed = crypto.randomBytes(16).toString('hex');
      for (const arm of shuffled(ARMS)) {
        const record = await executeArm({ adapter, suite, task, repetition, arm, seed, expectedIdentity: identity });
        if (record.identity && !identity) identity = record.identity;
        records.push({ taskId: task.id, family: task.family, repetition, ...record });
      }
    }
  }
  return {
    schemaVersion: 1,
    arenaId: `arena-${crypto.randomUUID()}`,
    suiteId: suite.suiteId,
    status: records.every((record) => record.status === 'measured') ? 'complete' : 'incomplete',
    arms: ARMS.map(({ id, removed }) => ({ id, removedFeatures: removed })),
    records,
    summary: summarize(records),
    limitations: ['Only runs with a complete verification receipt are measured.', 'Missing observations remain null; no scores are imputed.']
  };
}

function summarize(records) {
  const byArm = {};
  for (const arm of ARMS) {
    const measured = records.filter((record) => record.request.arm === arm.id && record.status === 'measured');
    byArm[arm.id] = {
      measuredRuns: measured.length,
      verifiedRuns: measured.filter((record) => record.verificationReceipt.result === 'VERIFIED').length,
      meanTokens: mean(measured.map((record) => record.metrics.tokens)),
      meanLatencyMs: mean(measured.map((record) => record.metrics.latencyMs))
    };
  }
  const pairedVerifiedDelta = [];
  const blocks = new Map();
  for (const record of records.filter((item) => item.status === 'measured')) {
    const block = `${record.taskId}:${record.repetition}`;
    if (!blocks.has(block)) blocks.set(block, {});
    blocks.get(block)[record.request.arm] = record.verificationReceipt.result === 'VERIFIED' ? 1 : 0;
  }
  for (const [arm, value] of Object.entries(byArm)) {
    const pairs = [...blocks.values()].filter((block) => Number.isInteger(block.alone) && Number.isInteger(block[arm]));
    pairedVerifiedDelta.push({ arm, pairedBlocks: pairs.length,
      delta: pairs.length ? pairs.reduce((sum, block) => sum + block[arm] - block.alone, 0) / pairs.length : null });
  }
  return { byArm, pairedVerifiedDelta };
}

function mean(values) {
  const measured = values.filter((value) => Number.isFinite(value));
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

async function main() {
  const [suitePath, adapterPath, outputPath] = process.argv.slice(2);
  if (!suitePath || !adapterPath) throw new Error('Usage: node benchmarks/genos-arena/run-arena.cjs <suite.json> <adapter.cjs> [output.json]');
  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
  const resolvedAdapter = path.resolve(adapterPath);
  if (!fs.existsSync(resolvedAdapter)) throw new Error('No live adapter is configured; no scores were produced.');
  const adapter = require(resolvedAdapter);
  const report = await runSuite(suite, adapter);
  const output = outputPath ? path.resolve(outputPath) : null;
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) fs.writeFileSync(output, json);
  else process.stdout.write(json);
}

if (require.main === module) main().catch((error) => { console.error(`GenOS Arena: ${error.message}`); process.exitCode = 1; });

module.exports = { ARMS, runSuite, validateReceipt };
