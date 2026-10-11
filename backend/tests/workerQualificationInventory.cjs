'use strict';

const { createHash } = require('node:crypto');
const { KINDS } = require('../src/services/agents/workerKindService');
const { executorCatalog } = require('../src/services/agents/workerExecutorRegistry');
const { CASES } = require('../../benchmarks/workers/cases.cjs');

function inputs() {
  return { kinds: KINDS, executors: executorCatalog(), cases: CASES };
}

function unique(values) {
  return new Set(values).size === values.length;
}

function assertIdentities(input) {
  const kinds = Object.keys(input.kinds);
  const executorKinds = input.executors.map((entry) => entry.kind);
  const caseIds = input.cases.map((entry) => entry.id);
  if (!unique(executorKinds) || !unique(caseIds) || executorKinds.length !== kinds.length) {
    throw new Error('Worker qualification inventory has duplicate or missing identities.');
  }
}

function assertKind(input, kind) {
  const executor = input.executors.find((entry) => entry.kind === kind);
  const cases = input.cases.filter((entry) => entry.workerKind === kind);
  if (!executor || !Array.isArray(executor.methods) || !executor.methods.length
    || !unique(executor.methods) || !cases.length) {
    throw new Error(`Worker qualification inventory lacks an executor or benchmark case for ${kind}.`);
  }
  for (const item of cases) {
    if (item.methodContract && !executor.methods.includes(item.methodContract.methodId)) {
      throw new Error(`Benchmark case ${item.id} uses an unregistered method.`);
    }
  }
}

function assertInventory(input) {
  assertIdentities(input);
  for (const kind of Object.keys(input.kinds)) assertKind(input, kind);
  if (input.cases.some((item) => !Object.hasOwn(input.kinds, item.workerKind))) {
    throw new Error('Worker qualification inventory contains an unknown benchmark kind.');
  }
  return true;
}

function inventory(input = inputs()) {
  assertInventory(input);
  const workers = input.executors.map((entry) => {
    const cases = input.cases.filter((item) => item.workerKind === entry.kind);
    const coveredMethods = new Set(cases.map((item) => item.methodContract?.methodId).filter(Boolean));
    return { kind: entry.kind, artifact: input.kinds[entry.kind][1],
      methods: entry.methods, benchmarkCases: cases.map((item) => ({ id: item.id,
        methodId: item.methodContract?.methodId || null, oracle: Boolean(item.oracle) })),
      methodsWithoutBenchmark: entry.methods.filter((method) => !coveredMethods.has(method)) };
  });
  return { version: 1,
    benchmarkDigest: `sha256:${createHash('sha256').update(JSON.stringify(input.cases)).digest('hex')}`,
    kindCount: workers.length, methodCount: workers.reduce((sum, entry) => sum + entry.methods.length, 0),
    unmeasuredCases: input.cases.filter((item) => !item.oracle).map((item) => item.id), workers };
}

if (require.main === module) {
  const report = inventory();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = { inputs, assertInventory, inventory };
