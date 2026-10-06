'use strict';

const assert = require('assert');
const registry = require('../../src/services/ontogenesis/canonicalConceptRegistry');
const accessMatrix = require('../../src/services/capabilityAccessMatrix');

const runtimeBridgeMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'global_workspace', 'metacognition', 'world_model', 'causal_integration', 'equipe_specialisee'
] });
assert.deepStrictEqual(runtimeBridgeMission.resolvedConcepts.map((concept) => concept.source), [
  'existing_adapter', 'existing_adapter', 'existing_adapter', 'existing_adapter', 'existing_adapter'
]);
assert.equal(runtimeBridgeMission.resolvedConcepts[0].service, 'conceptRuntimeService');
assert.equal(runtimeBridgeMission.resolvedConcepts[4].service, 'variantExecutionRuntime.executeExpertCommittee');

const aliasMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: ['memoire_graphe', 'etat_causal', 'economie_tokens'] });
assert.deepStrictEqual(aliasMission.resolvedConcepts.map((concept) => concept.source), ['capability', 'capability', 'capability']);
assert.deepStrictEqual(aliasMission.resolvedConcepts.map((concept) => concept.id), ['GRAPH_MEMORY', 'CAUSAL_STATE', 'TOKEN_ECONOMY']);

const philosophyMission = registry.resolveMission({ requestedConcepts: ['ontologie_generale', 'causalite', 'platonisme'] });
assert.deepStrictEqual(philosophyMission.resolvedConcepts.map((concept) => concept.source), ['philosophy', 'philosophy', 'philosophy']);
assert.deepStrictEqual(philosophyMission.resolvedConcepts.map((concept) => concept.id),
  ['ontology.being', 'causality.determination', 'school.platonism']);
assert.ok(philosophyMission.resolvedConcepts.every((concept) => concept.access === 'read' && !concept.executable));
assert.ok(philosophyMission.coverage.philosophyRead >= 30);
assert.ok(philosophyMission.resolvedConcepts[0].implementationContract);
assert.equal(philosophyMission.resolvedConcepts[0].implementationContract.id, 'ontology.being');
const contractedPhilosophy = registry.resolveMission({ requestedConcepts: ['epistemologie'] });
assert.ok(contractedPhilosophy.resolvedConcepts[0].implementationContract);
assert.equal(contractedPhilosophy.resolvedConcepts[0].implementationContract.id, 'epistemology.knowledge');
assert.equal(contractedPhilosophy.coverage.implementationContracts, 375);
assert.ok(contractedPhilosophy.canonicalConcepts.some((concept) =>
  concept.implementationContract?.id === 'epistemology.knowledge'));

const canonicalCapabilityMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'portfolio_strategies', 'barriere_evidence', 'systeme_immunitaire', 'ligand_recepteur', 'observabilite'
] });
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.source),
  ['capability', 'capability', 'capability', 'capability', 'capability']);
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.id),
  ['STRATEGY_PORTFOLIO', 'EVIDENCE_BARRIER', 'IMMUNE_SYSTEM', 'LIGAND_RECEPTOR', 'OBSERVABILITY']);
assert.deepStrictEqual(canonicalCapabilityMission.resolvedConcepts.map((concept) => concept.available),
  [true, false, false, true, true]);
assert.strictEqual(canonicalCapabilityMission.blockedConcepts.length, 2);

const foundationsMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'preuve_avant_promotion', 'falsifiabilite', 'provenance', 'decisions_bornees', 'brier_score'
] });
assert.deepStrictEqual(foundationsMission.resolvedConcepts.map((concept) => concept.id),
  ['evidence_first', 'falsification_principle', 'provenance_integrity', 'execution_guardrails', 'EPISTEMICS_BRIER']);
assert.deepStrictEqual(foundationsMission.resolvedConcepts.map((concept) => concept.source),
  ['runtime', 'runtime', 'runtime', 'runtime', 'capability']);
assert.ok(foundationsMission.resolvedConcepts.slice(0, 4).every((concept) => concept.available));

const orchestrationMission = registry.resolveMission({ topology: 'trinity', requestedConcepts: [
  'workflow', 'retry', 'checkpoint', 'rejeu_causal', 'bisection_causale', 'escalade'
] });
assert.deepStrictEqual(orchestrationMission.resolvedConcepts.map((concept) => concept.id), [
  'plan_execute_verify', 'circuit_breaker_concept', 'checkpoint_regeneration_concept',
  'deterministic_replay', 'causal_bisection', 'entropy_model_escalation_concept'
]);
assert.ok(orchestrationMission.resolvedConcepts.every((concept) => concept.source === 'runtime'));

const memoryMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'consolidation', 'oubli', 'stdp', 'apprentissage', 'reutilisation_resultats'
] });
assert.deepStrictEqual(memoryMission.resolvedConcepts.map((concept) => concept.id), [
  'memory_compilation_strategy', 'memory_sleep_cycle', 'stdp_plasticity',
  'controlled_lamarckian_learning', 'golden_path_replay'
]);
assert.ok(memoryMission.resolvedConcepts.every((concept) => concept.source === 'runtime'));

const resilienceMission = registry.resolveMission({ topology: 'holobionte', requestedConcepts: [
  'contrefactuel', 'dependance_causale', 'diagnostic', 'quarantaine',
  'autopsie_causale', 'sentinel', 'dead_letter', 'routage_local_distant'
] });
assert.deepStrictEqual(resilienceMission.resolvedConcepts.map((concept) => concept.id), [
  'n_way_counterfactual_fork', 'causal_replay_intervention_concept', 'diagnose_baseline',
  'immune_challenge', 'dlq_autopsy_concept', 'entropy_sentinel', 'dlq_autopsy_concept', 'MODEL_ROUTING'
]);
assert.deepStrictEqual(resilienceMission.resolvedConcepts.slice(0, 7).map((concept) => concept.source),
  ['runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime', 'runtime']);

const sensingMission = registry.resolveMission({ topology: 'biome', requestedConcepts: ['foveation', 'echolocation', 'olfaction'] });
assert.deepStrictEqual(sensingMission.resolvedConcepts.map((concept) => concept.source), ['runtime', 'runtime', 'runtime']);
assert.deepStrictEqual(sensingMission.resolvedConcepts.map((concept) => concept.id),
  ['foveal_scan_concept', 'echolocation_probe', 'scent_trace']);
assert.ok(sensingMission.resolvedConcepts.every((concept) => concept.available));
assert.ok(sensingMission.resolvedConcepts.every((concept) => concept.executable));

const sensorCapabilities = new Map(accessMatrix.fullMatrix()
  .filter((entry) => ['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE'].includes(entry.capability))
  .map((entry) => [entry.capability, entry]));
for (const capability of ['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE']) {
  assert.strictEqual(sensorCapabilities.get(capability).state, 'operationnel');
  assert.deepStrictEqual(sensorCapabilities.get(capability).missingFromCatalog, []);
  assert.deepStrictEqual(sensorCapabilities.get(capability).missingRoutes, []);
}

const sensorMission = registry.resolveMission({ topology: 'biome', requestedConcepts: ['web_foraging', 'perception_foveale'] });
assert.deepStrictEqual(sensorMission.resolvedConcepts.map((concept) => concept.source), ['capability', 'capability']);
assert.ok(sensorMission.runtimeLeaseCandidates.some((entry) => entry.tools.includes('genos_browser_act')));
assert.ok(sensorMission.runtimeLeaseCandidates.some((entry) => entry.tools.includes('genos_foveal_crop')));
