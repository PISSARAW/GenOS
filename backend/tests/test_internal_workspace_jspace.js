'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/agow/internalWorkspace/internalWorkspaceAdapter');
const candidateAdapter = require('../src/services/agow/internalWorkspace/jspaceCandidateAdapter');
const intervention = require('../src/services/agow/internalWorkspace/internalWorkspaceInterventionService');
const validator = require('../src/services/agow/candidateValidationService');

async function main() {
  const opaque = { modelId: 'hosted-model', probeId: 'probe', layerRange: [1, 2],
    modelCapabilities: { internalActivations: false, activationIntervention: false },
    extractor: async () => ({ activations: [0.2], evidenceRefs: ['artifact:1'] }) };
  assert.throws(() => adapter.requireActivations(opaque), /does not expose/);
  await assert.rejects(() => adapter.extractAsync(opaque), /does not expose/);
  const local = { ...opaque, modelId: 'local-model',
    modelCapabilities: { internalActivations: true, activationIntervention: true },
    extractor: async () => ({ modelId: 'local-model', probeId: 'probe-1', layerRange: [4, 6],
      extractionMethod: 'linear_probe', activations: [0.2, 0.7], evidenceRefs: ['artifact:activation'] }) };
  const representation = await adapter.extractAsync(local);
  assert.equal(representation.extractionMethod, 'linear_probe');
  const candidate = candidateAdapter.build({ agentId: 'agent', representation });
  assert.equal(validator.validCandidate(candidate), true);
  const result = await intervention.intervene({ ...local, intervention: { type: 'zero_ablation' },
    input: { prompt: 'bounded' }, interveneModel: async () => ({ interventionId: 'iv-1',
      interventionApplied: true, design: 'randomized_controlled', behaviorBefore: [0, 1],
      behaviorAfter: [1, 1], controlDeltas: [0, 0], evidenceRefs: ['artifact:iv'] }) });
  assert.equal(result.causalStatus, 'causally_supported');
  assert.equal(result.promotionAllowed, false);
  assert.throws(() => intervention.assessResult({ interventionApplied: true,
    behaviorBefore: [1], behaviorAfter: [1], evidenceRefs: [] }), /measures and evidence/);
  console.log('Internal workspace capability and J-space intervention checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
