'use strict';

const assert = require('node:assert/strict');
const trinity = require('../src/services/trinityService');
const profiles = require('../src/services/trinityWorkerProfiles');
const workerKinds = require('../src/services/topologyWorkerKindService');
const variants = require('../src/services/trinityVariantService');
const adapters = require('../src/services/trinityAdapters');
const worldDesign = require('../src/services/trinityWorldDesign');
const modelDiversity = require('../src/services/trinityModelDiversityService');

const MODELS = ['ollama://qwen2.5:7b', 'ollama://llama3.1:8b', 'ollama://deepseek-v2:16b'];

function options(variantId) {
  return { variantId, trinityModels: MODELS, availableAdapters: adapters.dispatchAdapterNames(),
    trinityJury: { enabled: true, modelUris: ['judge-a', 'judge-b'], maxCostUsd: 1 },
    adaptiveBudgetConfig: { poolTokens: 300, minimumTokens: 10 },
    qdConfig: { replicaBudget: 3, tokensPerReplica: 100 } };
}

function membersFor(variantId, mission = 'Lance Trinity pour comparer un algorithme.') {
  const composed = trinity.compose(mission, options(variantId));
  const assigned = composed.map((member, index) => ({ ...member, localModel: worldDesign.modelFor(member, MODELS, index) }));
  return workerKinds.applyTopologyWorkerKinds('trinity', assigned);
}

function allVariantsPreflight() {
  for (const variantId of Object.keys(variants.DEFINITIONS)) {
    const members = membersFor(variantId);
    const receipt = profiles.assertPrelaunch(members);
    assert.equal(receipt.valid, true, variantId);
    assert.equal(receipt.profiles.length, variantId === 'factorial' ? 16 : 3);
    assert.equal(receipt.observedRuntimeVerified, false);
    assert.ok(receipt.profiles.every(profile => profile.workerKind && profile.observedRuntime.status === 'unknown'));
    assert.ok(receipt.profiles.every(profile => profile.observedRuntime.provider === null && profile.observedRuntime.model === null));
  }
}

function architectureAndCreativeAreDistinct() {
  const architecture = membersFor('jury', 'Lance Trinity : scénario architecture de messagerie utilisant microservices et event sourcing.');
  assert.deepEqual(architecture.map(member => member.workerKind), ['bounded_worker', 'specialist', 'adaptive_worker']);
  assert.ok(architecture.every(member => member.domain === 'architecture_decision'));
  assert.ok(architecture.every(member => !member.mission.includes('literary craft')));
  const creative = membersFor('controlled', 'Lance Trinity : écris une nouvelle fantastique.');
  assert.ok(creative.every(member => member.workerKind === 'creative_worker'));
  const audit = profiles.describe(architecture[2]);
  assert.equal(audit.scientificRole, 'self_critic');
  assert.equal(audit.topologyRole, 'self_correcting_implementation');
  assert.equal(audit.workerKind, 'adaptive_worker');
  assert.equal(audit.cognitiveRecipe, 'self_correcting');
}

function factorialTreatmentsAreActualInstructions() {
  const members = membersFor('factorial');
  for (const member of members) {
    assert.equal(member.cognitiveRecipe, member.factorialCell.factors.approach);
    assert.equal(member.validationDepth, member.factorialCell.factors.validation);
    assert.ok(member.mission.includes('Cognitive recipe: ' + member.cognitiveRecipe + '.'));
    assert.ok(member.mission.includes('Validation treatment: ' + member.validationDepth + '.'));
    assert.equal(profiles.describe(member).scientificRole, 'independent_factorial_replicate');
  }
  const same = members.map(member => ({ ...member, localModel: MODELS[0] }));
  assert.throws(() => profiles.assertPrelaunch(same), { code: 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED' });
  const aliases = members.map(member => ({ ...member, localModel: member.modelTier === 'frontier' ? 'local://qwen2.5:7b' : MODELS[0] }));
  assert.throws(() => profiles.assertPrelaunch(aliases), { code: 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED' });
  assert.throws(() => profiles.assertPrelaunch(members.map(member => ({ ...member, localModel: undefined }))), { code: 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED' });
  const incorrect = [...members];
  incorrect[0] = { ...incorrect[0], cognitiveRecipe: 'self_correcting' };
  assert.throws(() => profiles.assertPrelaunch(incorrect), { code: 'TRINITY_FACTORIAL_RECIPE_MISMATCH' });
}

function capabilityAndNativeAvailabilityFailClosed() {
  const members = membersFor('controlled');
  const unknown = { ...members[0], role: 'unregistered_unknown_role', workerKind: undefined };
  assert.throws(() => workerKinds.applyTopologyWorkerKinds('trinity', [unknown]), { code: 'TOPOLOGY_WORKER_KIND_MISSING' });
  assert.throws(() => profiles.assertPrelaunch([{ ...members[0], workerKind: 'creative_worker' }]), { code: 'TRINITY_WORKER_CAPABILITY_MISMATCH' });
  const nativeRequest = { ...members[0], workerRequirements: { nativeRequired: true } };
  assert.throws(() => profiles.assertPrelaunch([nativeRequest]), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });
  const unsupported = { ...members[0], workerKind: 'formal_worker', workerAssignment: null,
    methodContract: { version: 1, methodId: 'formal_proof', parameters: {} } };
  assert.throws(() => profiles.assertPrelaunch([unsupported]));
  const concrete = { ...members[0], workerKind: 'procedural_executor', workerAssignment: null,
    methodContract: { version: 1, methodId: 'lpt', parameters: { jobs: [{ id: 'a', duration: 3 }, { id: 'b', duration: 2 }], machines: 2 } } };
  assert.equal(profiles.assertPrelaunch([concrete]).valid, true);
  assert.throws(() => profiles.assertPrelaunch([{ ...concrete, methodContract: { version: 1, methodId: 'lpt', parameters: {} } }]), { code: 'WORKER_PROCEDURE_INPUT_INVALID' });
  const subset = { ...concrete, methodContract: { version: 1, methodId: 'subset_sum', parameters: { values: [1, 2, 4], target: 3 } } };
  assert.equal(profiles.assertPrelaunch([subset]).valid, true);
  assert.throws(() => profiles.assertPrelaunch([{ ...subset, methodContract: { ...subset.methodContract, parameters: { values: [1], target: -1 } } }]), { code: 'WORKER_PROCEDURE_INPUT_INVALID' });
}

function toolsAndDiversityRemainEnforced() {
  const member = { ...membersFor('controlled')[0], workerRequirements: { requiredTools: ['genos_test'] } };
  assert.throws(() => profiles.assertPrelaunch([member]), { code: 'TRINITY_WORKER_TOOLS_UNAVAILABLE' });
  assert.throws(() => profiles.assertPrelaunch([{ ...member, toolLease: ['genos_test'] }]), { code: 'TRINITY_WORKER_TOOLS_UNAVAILABLE' });
  assert.equal(profiles.assertPrelaunch([member], { toolLease: ['genos_test'] }).valid, true);
  assert.equal(profiles.assertPrelaunch([member], { toolLeaseByWorld: { 1: ['genos_test'] } }).valid, true);
  assert.throws(() => profiles.assertPrelaunch([member], { toolLease: ['genos_test'], toolLeaseByWorld: { 2: ['genos_test'] } }), { code: 'TRINITY_WORKER_TOOLS_UNAVAILABLE' });
  assert.throws(() => profiles.assertPrelaunch([{ ...member, workerRequirements: { requiredCapabilities: 'execute' } }]), { code: 'TRINITY_WORKER_CAPABILITIES_INVALID' });
  assert.throws(() => profiles.assertPrelaunch([{ ...member, workerRequirements: { requiredCapabilities: ['unknown_capability'] } }]), { code: 'TRINITY_WORKER_CAPABILITY_MISMATCH' });
  const homogeneous = membersFor('heterogeneous').map(world => ({ ...world, localModel: MODELS[0] }));
  assert.throws(() => profiles.assertPrelaunch(homogeneous), error => error.code === 'TRINITY_DIVERSITY_BELOW_THRESHOLD' && error.diversity.threshold === 0.35);
  const declared = membersFor('heterogeneous')[0].variantSelection.diversity;
  assert.equal(declared.basis, 'requested_configuration');
  assert.equal(declared.observedRuntimeVerified, false);
  assert.equal(membersFor('heterogeneous')[2].workerKind, 'red_worker');
  assert.equal(profiles.describe(membersFor('heterogeneous')[2]).scientificRole, 'falsifier');
  const raw = Array.from({ length: 3 }, () => ({ role: 'implementation', chamber: 'direct', domain: 'software_engineering', hypothesis: 'PUBLIC qualification contract remains mandatory.' }));
  const attacker = require('../src/services/trinityDifferentiationService').differentiate(raw, { goal: 'work', domain: 'software_engineering', design: { interactionPolicy: 'adversarial_cross_examination' } })[2];
  assert.ok(attacker.hypothesis.includes('PUBLIC qualification contract remains mandatory.'));
}

async function autonomousPrelaunchUsesSameRules() {
  const members = trinity.compose('Lance Trinity pour un algorithme.', options('controlled'));
  const trinityPlan = { activated: true, members, variantSelection: members[0].variantSelection };
  await modelDiversity.enforcePlan({ autonomyPlan: { trinity: trinityPlan }, normalizedMission: {}, agentId: 'parent' });
  assert.equal(trinityPlan.workerPreflight.valid, true);
  assert.ok(trinityPlan.members.every(member => member.workerProfile.workerKind === member.workerKind));
  const factorialMembers = trinity.compose('Lance Trinity pour un algorithme.', options('factorial'));
  const missing = { activated: true, members: factorialMembers, variantSelection: factorialMembers[0].variantSelection };
  await assert.rejects(modelDiversity.enforcePlan({ autonomyPlan: { trinity: missing }, normalizedMission: {}, agentId: 'parent' }), { code: 'TRINITY_FACTORIAL_MODEL_ROUTES_REQUIRED' });
}

function phenotypeRetainsRequestedStrategy() {
  const phenotype = require('../src/services/cognitivePhenotypeService');
  const original = process.env.GENOS_COGNITIVE_PHENOTYPE;
  process.env.GENOS_COGNITIVE_PHENOTYPE = '1';
  try {
    const members = membersFor('controlled');
    const strategies = members.map(member => member.cognitiveRecipe);
    const missionText = 'Investigate why causal uncertainty persists and the representation lock in blocks debugging.';
    assert.equal(phenotype.phenotypeEnabled(), true);
    assert.ok(phenotype.inferCognitiveNeeds(missionText).length >= 2, 'The fixture must match registered cognitive needs.');
    const result = phenotype.attachPhenotypesToPlan({ plan: { dispatchWorkers: members }, missionText });
    assert.equal(result.attached, 3, 'Every Trinity worker must receive a phenotype: ' + JSON.stringify(result));
    assert.ok(members.every(member => member.cognitiveRecipe.instructions.length > 0));
    assert.deepEqual(members.map(member => member.requestedCognitiveRecipe), strategies);
    assert.equal(profiles.assertPrelaunch(members).valid, true);
    assert.ok(members.every(member => profiles.describe(member).observedRecipe === null));
  } finally {
    if (original === undefined) delete process.env.GENOS_COGNITIVE_PHENOTYPE;
    else process.env.GENOS_COGNITIVE_PHENOTYPE = original;
  }
}

async function main() {
  allVariantsPreflight();
  architectureAndCreativeAreDistinct();
  factorialTreatmentsAreActualInstructions();
  capabilityAndNativeAvailabilityFailClosed();
  toolsAndDiversityRemainEnforced();
  phenotypeRetainsRequestedStrategy();
  await autonomousPrelaunchUsesSameRules();
  console.log('Trinity L2 worker profiles, 12 variant routes, actual treatments and prelaunch refusal gates: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
