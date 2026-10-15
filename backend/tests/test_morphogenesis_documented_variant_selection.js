'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { resolveRequestedProfile } = require('../src/services/morphogenesis/registry/topologyProfileService');
const useCases = require('../src/services/morphogenesis/registry/variantUseCaseSelector');
const { compileConditionalMorphogenesisPolicy } = require('../src/services/morphogenesis/conditionalMorphogenesisPolicy');
const EXISTING_MISSIONS = require('./fixtures/topology-missions-48.json');

const registry = createTopologyRegistry();
const LEGACY_META = new Set(['balanced', 'resilient', 'exploratory', 'conservative']);
const MISSIONS = Object.freeze([
  ['trinity', 'pareto', 'Comparer qualité, coût et latence entre plusieurs objectifs non dominés.'],
  ['a_team', 'incident_command', 'Une panne multiservice exige commandement, rôles et escalade de crise.'],
  ['biome', 'quality_diversity', 'Conserver une archive de solutions distinctes avec qualité et diversité.'],
  ['biocenose', 'forecasting_crowd', 'Prévoir la probabilité d’un événement et calibrer le risque avec Brier.'],
  ['syncytium', 'code', 'Refactor collaboratif du code avec fichiers, imports, compilation et tests.'],
  ['rhizome', 'private', 'Router des données confidentielles dans un domaine privé avec confiance et quarantaine.'],
  ['metapopulation', 'federated', 'Coopérer entre régions sous souveraineté des données et contrat de minimisation.']
]);

function verifyCoverage() {
  let count = 0;
  for (const [topology, profiles] of Object.entries(useCases.PROFILES)) {
    const registered = registry.variants.list(topology).filter(id => id !== 'default'
      && (topology !== 'metapopulation' || !LEGACY_META.has(id)));
    assert.deepEqual(Object.keys(profiles).sort(), registered.sort(), topology);
    count += registered.length;
  }
  assert.equal(count, 95);
}

function verifyDocumentedChoices() {
  for (const [topology, expected, mission] of MISSIONS) {
    const selected = useCases.selectVariant({ topology, mission });
    assert.equal(selected.variantId, expected, topology);
    assert.equal(selected.method, 'documented_use_case');
    assert.equal(selected.calibrationStatus, 'uncalibrated');
    assert(selected.evaluatedVariantCount >= 11);
    assert.equal(selected.rankedCandidates[0].variantId, expected);
  }
  const context = { localEngineAvailable: true, immunePlaneAvailable: true,
    capabilities: ['stable-core'] };
  const selected = useCases.selectVariant({ topology: 'holobionte',
    mission: 'Traitement hors ligne sans réseau sur appareil local.', problemProfile: context });
  assert.equal(selected.variantId, 'local-first');
  const structured = useCases.selectVariant({ topology: 'trinity', mission: 'Choisir une approche.',
    problemProfile: { multiObjectiveRequired: true } });
  assert.equal(structured.variantId, 'pareto');
}

function verifyAbstentionAndVeto() {
  const ambiguous = useCases.selectVariant({ topology: 'trinity',
    mission: 'Baseline reproductible et diversité de modèles.' });
  assert.equal(ambiguous.variantId, 'controlled');
  assert.deepEqual(ambiguous.reasons, ['AMBIGUOUS_DOCUMENTED_USE_CASE']);
  const missing = useCases.selectVariant({ topology: 'holobionte',
    mission: 'Traitement hors ligne sans réseau sur appareil local.',
    problemProfile: { immunePlaneAvailable: true, capabilities: ['stable-core'] } });
  assert.equal(missing.variantId, 'organelle');
  assert.equal(missing.reasons[0], 'DOCUMENTED_PRECONDITION_MISSING');
  assert(missing.reasons.includes('local-first:local-engine'));
  assert(missing.incompatibleCandidates.includes('local-first'));
  const override = useCases.selectVariant({ topology: 'trinity',
    mission: 'Objectifs multiples : qualité, coût, latence et compromis non dominés.',
    localSelection: { variantId: 'controlled', method: 'mission_signals', reasons: ['LOCAL'] } });
  assert.equal(override.variantId, 'pareto');
}

function verifyPlanningAndEvidenceGate() {
  const result = resolveRequestedProfile({ prompt: MISSIONS[0][2] }, 'trinity', registry.variants);
  assert.equal(result.selectedVariant.variantId, 'pareto');
  assert.equal(result.variantSelection.calibrationStatus, 'uncalibrated');
  const stringMission = resolveRequestedProfile({ mission: MISSIONS[0][2] }, 'trinity', registry.variants);
  assert.equal(stringMission.selectedVariant.variantId, 'pareto');
  const explicit = resolveRequestedProfile({ variantId: 'adversarial', prompt: MISSIONS[0][2] },
    'trinity', registry.variants);
  assert.equal(explicit.selectedVariant.variantId, 'adversarial');
  const policy = compileConditionalMorphogenesisPolicy({ mission: MISSIONS[0][2],
    currentTopology: 'trinity', currentVariant: 'controlled', budget: { tokens: 1000 },
    availableTopologyCapabilities: [] });
  const pareto = policy.portfolio.candidates.find(item => item.candidateId === 'variant:trinity:pareto');
  assert(pareto.estimatedProblemFit > 0.5);
  assert.equal(policy.decision.recipe.kind, 'NO_CHANGE');
  assert.equal(policy.bounds.executionAuthorized, false);
}

function verifyExistingMissionRouting() {
  for (const { topology, mission, expectedVariant } of EXISTING_MISSIONS) {
    const context = { prompt: mission };
    if (topology === 'holobionte') context.problemProfile = {
      localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true,
      capabilities: ['stable-core', 'diversity', 'tool-sandbox']
    };
    const selected = resolveRequestedProfile(context, topology, registry.variants);
    assert.equal(selected.selectedVariant?.variantId, expectedVariant, topology);
  }
}

verifyCoverage();
verifyDocumentedChoices();
verifyAbstentionAndVeto();
verifyPlanningAndEvidenceGate();
verifyExistingMissionRouting();
console.log('Morphogenesis documented variant selection: PASS');
