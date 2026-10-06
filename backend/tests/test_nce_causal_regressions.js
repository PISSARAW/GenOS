'use strict';

const assert = require('node:assert/strict');
const { transferCultureToPhenotype } = require('../src/services/culturalPhenotypeBridgeService');
const { measureCulturalTransfer } = require('../src/services/culturalTransmissionService');
const { creativePhenotypeVector, DIMENSIONS } = require('../src/services/creativePhenotypeVectorService');
const { executeProgram, program } = require('../src/services/nceProcedureProgram');

async function main() {
  await assertFeatureIntersection();
  const state = { currentPhenotype: {}, branches: [], atrophies: [], history: [] };
  const original = structuredClone(state);
  let calls = 0;
  await assert.rejects(transferCultureToPhenotype({ phenotypeState: state,
    artifact: { id: 'a', agentId: 'teacher', provenance: { createdBy: 'teacher' },
      content: { requiredCapabilities: ['planning'] } },
    benchmark: async () => { if (++calls === 2) throw new Error('benchmark failed'); return 0; },
  }), /benchmark failed/);
  assert.deepEqual(state, original, 'a failed post-test must roll back the phenotype');
  for (const value of [null, true, '1', NaN, Infinity]) {
    await assert.rejects(measureCulturalTransfer({ benchmarkBefore: async () => value,
      integrateArtifact: async () => assert.fail('invalid measurement integrated'), benchmarkAfter: async () => 1 }), /finite number/);
  }
  assert.deepEqual(creativePhenotypeVector().known, Array(8).fill(false));
  const all = Object.fromEntries(DIMENSIONS.map((key) => [key, { value: 0.4, evidenceRef: 'receipt-1' }]));
  assert.deepEqual(creativePhenotypeVector(all).values, Array(8).fill(0.4));
  assert.throws(() => creativePhenotypeVector({ N: { value: 1 } }), /evidence/);
  assert.throws(() => creativePhenotypeVector({ N: { value: NaN, evidenceRef: 'x' } }), /measurement/);
  assert.throws(() => program(['constructor']), /Unsupported/);
  assert.throws(() => executeProgram(program(), [Infinity]), /finite/);
  assert.throws(() => program(Array(17).fill('sort')), /excessive/);
  assert.deepEqual(executeProgram(program(['unique', 'sort']), [3, 2, 3, -1]), [-1, 2, 3]);
  console.log('NCE rollback, strict measurements, creative vectors and executable programs: PASS');
}

async function assertFeatureIntersection() {
  const cycle = require('../src/services/nceCausalCycleService');
  const original = cycle.runCausalCycle;
  let captured;
  cycle.runCausalCycle = async (input) => { captured = input; return { measured: false }; };
  try {
    const result = await require('../src/services/nceIntegrationService').enhanceMissionWithNCE({
      agentId: 'a', nceExperiment: { features: { play: true, culture: false } },
      nceOptions: { curiosity: false, reprMutation: false, exaptation: false,
        play: false, culture: true, phenotype: false, envCoev: false },
    }, { get: async () => null });
    assert.deepEqual(result.errors, {});
    assert.equal(captured.features.play, false);
    assert.equal(captured.features.culture, false);
  } finally { cycle.runCausalCycle = original; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
