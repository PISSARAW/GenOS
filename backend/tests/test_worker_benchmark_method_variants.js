'use strict';

const assert = require('node:assert/strict');
const { CASES } = require('../../benchmarks/workers/cases.cjs');
const adapter = require('../../benchmarks/workers/genos-adapter.cjs');
const { score } = require('../../benchmarks/workers/campaign.cjs');

const CASE_IDS = ['bounded-procedure', 'code-postconditions', 'closed-arithmetic',
  'scout-source', 'forensic-chain', 'teaching-transfer'];

function mutate(id, execution) {
  const changed = structuredClone(execution);
  if (id === 'bounded-procedure') changed.result.result.found = false;
  if (id === 'code-postconditions') changed.observedSource = 'a % b';
  if (id === 'closed-arithmetic') changed.result.derivation.left.value = '999';
  if (id === 'lean-theorem-proving') changed.result.result = 'refuted';
  if (id === 'scout-source') changed.result.observations[0].offset += 1;
  if (id === 'forensic-chain') changed.result.causalChain = [];
  if (id === 'teaching-transfer') changed.result.transferCheck.learnerSum += 1;
  if (id === 'bounded-code') changed.result.codeCompletion.independentChecks[0].coverage.checkedCases -= 1;
  return changed;
}

async function checkCase(id) {
  const testCase = CASES.find((item) => item.id === id);
  const execution = await adapter.runCase(testCase);
  assert.equal(execution.status, 'executed', `${id} should execute`);
  assert.equal(await score(testCase, execution), 'passed', `${id} independent oracle should pass`);
  assert.equal(await score(testCase, mutate(id, execution)), 'failed',
    `${id} oracle should reject tampered evidence`);
}

async function main() {
  for (const id of CASE_IDS) await checkCase(id);
  if (process.env.GENOS_LOCAL_MODEL?.startsWith('ollama://')) await checkCase('bounded-code');
  if (process.env.GENOS_BENCHMARK_LEAN_VERSION) await checkCase('lean-theorem-proving');
  console.log('Bounded procedure, code, exact arithmetic and configured theorem variants pass with mutation refusal.');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
