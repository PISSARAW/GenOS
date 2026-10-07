'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compile, execute } = require('./expression.cjs');
const { runTestAdapter } = require('../../../backend/src/services/epistemic/verifierAdapters');

async function probes(context) {
  const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/code.json')));
  const valid = await require('./code-probe.cjs').check(tasks[0], { expression: 'a+b' }, context);
  assert.equal(valid.passed, true);
  assert.ok(valid.executions[0].detail.executionId);
  const bad = await require('./code-probe.cjs').check(tasks[0], { expression: 'a-b' }, { ...context, branchId: 'negative' });
  assert.equal(bad.passed, false);
  const absent = await runTestAdapter({ claim: 'Without oracle' }, { type: 'test' }, {});
  assert.equal(absent.status, 'inconclusive');
  const overfit = await require('./code-probe.cjs').check(tasks[5], { expression: 'a===1?3:4' }, { ...context, branchId: 'overfit' });
  assert.equal(overfit.passed, true);
  const memory = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/memory.json')));
  const prepared = await require('./memory-probe.cjs').prepare(memory[3], { root: context.root, bytes: 2048 });
  assert.equal(prepared.retrievedIds.filter(id => id.startsWith('mem_')).length, 2);
  for (const block of Object.values(prepared.blocks)) assert.equal(Buffer.byteLength(block), 2048);
  assert.ok(prepared.blocks.genos.includes('[UNAUTHENTICATED_SOURCE]'));
  assert.ok(prepared.blocks['no-trust-boundary'].includes('[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD]'));
  const task = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/reasoning.json')))[0];
  const proof = await require('./reasoning-probe.cjs').check(task, { proof: 'by intro n; rfl' }, context);
  assert.equal(proof.passed, true);
  assert.equal(proof.receipt.status, 'passed');
  const multiline = await require('./reasoning-probe.cjs').check(task,
    { proof: 'by\n  intro n\n  rfl' }, { ...context, branchId: 'multiline-train' });
  assert.equal(multiline.passed, true);
  return { publicPositive: valid, publicNegative: bad, absentOracle: absent,
    publicOverfitAccepted: overfit, memory: { retrieved: prepared.retrievedIds.length }, kernel: proof, multiline };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-pilot-smoke-'));
  require('./run.cjs').setup(root);
  const { select } = require('./arm.cjs');
  try {
    for (const text of ['process.exit(0)', 'Math.abs.constructor(1)', 'a; while(true){}', 'a[0]', 'require(1)']) {
      assert.throws(() => compile(text));
    }
    assert.equal(execute(compile('((a%b)+b)%b'), [-1, 5, 0]), 4);
    assert.equal(select('genos', [{ check: { passed: false } }]), -1);
    assert.equal(select('genos', [{ check: { passed: true } }, { check: { passed: false } }]), 0);
    assert.equal(select('no-evidence-gate', [{ check: { passed: true } }, { check: { passed: false } }]), 1);
    require('./environment.cjs').validateAssets();
    const context = { root, branchId: 'positive', genos: true, timeoutMs: 30000,
      lean: require('./environment.cjs').leanIdentity(), environmentDigest: '0'.repeat(64) };
    const result = await probes(context);
    fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
    console.log('Pilot probes: real AEIS, memory and Lean; unsafe expressions and missing oracle rejected.');
  } finally {
    await require('../../../backend/src/services/telemetryObserver').flush();
    await require('../../../backend/src/db').closeDatabase();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
