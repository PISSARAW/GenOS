'use strict';

const assert = require('node:assert/strict');
const schema = require('../../shared/agow/cognitiveCandidate.schema.json');
const adapter = require('../src/services/agow/candidates/candidateAdapterService');
const validation = require('../src/services/agow/candidateValidationService');
const registry = require('../src/services/agow/workspaceReceiverRegistry');
const receivers = require('../src/services/agow/agowDefaultReceiversService');

function candidateFor(module, observation = {}) {
  return adapter.build({ module, agentId: 'epistemic-test', now: 1000, observation });
}

function testSchemaContract() {
  assert(schema.required.includes('epistemicOrigin'));
  assert.deepEqual(schema.$defs.epistemicOrigin.properties.realityMode.enum, ['real', 'counterfactual']);
  assert(schema.$defs.epistemicOrigin.allOf.length >= 2);
}

function testModuleDefaults() {
  assert.equal(candidateFor('perception').epistemicOrigin.origin, 'external_observed');
  assert.equal(candidateFor('memory').epistemicOrigin.origin, 'memory_retrieved');
  assert.equal(candidateFor('self').epistemicOrigin.origin, 'model_inferred');
  assert.equal(candidateFor('efference').epistemicOrigin.origin, 'self_action_observed');
  assert.equal(candidateFor('worker').epistemicOrigin.origin, 'unknown');
  assert.equal(candidateFor('daemon').epistemicOrigin.origin, 'unknown');
  assert.equal(candidateFor('daemon').epistemicOrigin.realityMode, 'real');
  assert(validation.validCandidate(candidateFor('perception')));
}

function testCounterfactualValidation() {
  const simulated = candidateFor('epistemic', { epistemicOrigin: {
    origin: 'counterfactual_simulated', realityMode: 'counterfactual', agency: 'environment',
    simulationId: 'cf-1', parentRealityFrameId: 'frame-1'
  } });
  assert(validation.validCandidate(simulated));
  assert(!validation.validCandidate({ ...simulated, epistemicOrigin: { ...simulated.epistemicOrigin, simulationId: null } }));
  assert(validation.validCandidate({ ...simulated, epistemicOrigin: { ...simulated.epistemicOrigin, origin: 'memory_retrieved' } }));
}

async function testCanonicalWriteIsolation() {
  receivers.ensureRegistered();
  const handlers = new Map(registry.list({ modules: ['world_model', 'self_model'] }).map((item) => [item.module, item.handler]));
  const candidate = candidateFor('epistemic', { semanticType: 'counterfactual_outcome', epistemicOrigin: {
    origin: 'counterfactual_simulated', realityMode: 'counterfactual', agency: 'environment',
    simulationId: 'cf-2', parentRealityFrameId: 'frame-2'
  } });
  for (const module of ['world_model', 'self_model']) {
    const result = await handlers.get(module)({ phase: 'apply', frame: { agentId: 'epistemic-test', frameId: 'frame-2' }, candidate });
    assert.equal(result.consumed, false);
    assert.equal(result.effectType, 'counterfactual_write_isolated');
  }
  const isolated = require('../src/services/agow/counterfactualCandidateGuard');
  const namespace = isolated.registerSimulation({ simulationId: 'cf-2', realAgentId: 'epistemic-test', parentRealityFrameId: 'frame-2' });
  const shadowCandidate = { ...candidate, agentId: namespace.simulationAgentId };
  const shadowFrame = { agentId: namespace.simulationAgentId, frameId: 'shadow-frame', realityMode: 'counterfactual', simulationId: 'cf-2' };
  assert.equal(isolated.mayWriteCanonicalWorld(shadowCandidate, shadowFrame), true);
  assert.equal(isolated.mayWriteCanonicalWorld(candidate, { ...shadowFrame, agentId: 'epistemic-test' }), false);
  isolated.releaseSimulation('cf-2');
  registry.clear();
}

async function main() {
  testSchemaContract();
  testModuleDefaults();
  testCounterfactualValidation();
  await testCanonicalWriteIsolation();
  console.log('✅ AGOW epistemic origin and counterfactual isolation passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
