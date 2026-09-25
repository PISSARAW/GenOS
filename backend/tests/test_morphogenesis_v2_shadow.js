'use strict';

const assert = require('node:assert/strict');
const { planMorphogenesis } = require('../src/services/morphogenesis/morphogenesisPlannerService');
const { validateServices } = require('../src/services/morphogenesis/runtime/morphogenesisRuntimeV2');
const { runMorphogenesisShadow } = require('../src/services/morphogenesis/runtime/morphogenesisShadowAdapter');

async function run() {
  const plan = planMorphogenesis({
    missionId: 'v2-shadow-check',
    currentState: { topology: 'a_team', agents: new Map() },
    proposedTopology: 'a_team',
    budget: { tokens: 30000 }
  });
  const result = await runMorphogenesisShadow(plan, { missionId: 'v2-shadow-check' });
  assert.equal(result.decision, 'SHADOWED');
  assert.equal(result.committed, false);
  assert.equal(result.authorityPending, 'rust_kernel_and_governance');
  assert.equal(result.evaluation.typing.valid, true);
  assert.equal(result.evaluation.hard.passed, true);
  assert.deepEqual(validateServices({}, 'commit'), [
    'observe', 'diagnose', 'generateNeeds', 'repairOrSynthesize', 'typeCheck',
    'hardGate', 'paretoEvaluate', 'governance', 'transition', 'credit', 'memory', 'kernel.adjudicate'
  ]);
  console.log('morphogenesis V2 shadow: PASS');
}

run().catch((error) => { console.error(error); process.exit(1); });
