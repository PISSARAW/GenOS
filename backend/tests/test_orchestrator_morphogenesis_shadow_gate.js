'use strict';

const assert = require('node:assert/strict');
const { executeMorphology } = require('../bin/orchestratorMissionAux.cjs');

function input(runtime, emitted) {
  return { morphology: { topology: 'trinity', variantId: 'controlled', agents: [{ role: 'architect' }] },
    outcome: { evidence: [] }, finalVerdict: 'pass', orchestratorId: 'mission-1', runtime,
    telemetry: { emitEvent: (event) => emitted.push(event) } };
}

async function main() {
  const emitted = [];
  const runtime = { executeMorphology: async (_morphology, options) => {
    assert.equal(options.mode, 'shadow');
    return { decision: 'SHADOWED', committed: false, proposed: true, topology: 'trinity',
      variantId: 'controlled', agents: [{ role: 'architect' }] };
  } };
  const result = await executeMorphology(input(runtime, emitted));
  assert.equal(result.applied, false);
  assert.equal(result.kernelReadOnly.committed, false);
  assert.equal(result.productionGate, 'POST_MISSION_COMMIT_UNAVAILABLE');
  assert.equal(emitted[0].eventType, 'MORPHOGENESIS_PROPOSED');
  assert.equal(emitted[0].payload.productionGate, result.productionGate);
  assert.equal(emitted[0].payload.variantId, 'controlled');

  const falseCommit = { executeMorphology: async () => ({ decision: 'APPLIED', committed: true }) };
  await assert.rejects(executeMorphology(input(falseCommit, emitted)), /cannot commit/);
  assert.equal(emitted.length, 1, 'false commits must not emit completion telemetry');
  const falseReceipt = { executeMorphology: async () => ({ receipt: { committed: true } }) };
  await assert.rejects(executeMorphology(input(falseReceipt, emitted)), /cannot commit/);
  const falseTransition = { executeMorphology: async () => ({ transition: { committed: true } }) };
  await assert.rejects(executeMorphology(input(falseTransition, emitted)), /cannot commit/);
  assert.equal(emitted.length, 1);
  console.log('Post-mission morphogenesis shadow gate: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
