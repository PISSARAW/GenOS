'use strict';

const assert = require('assert');
const variants = require('../src/services/holobionte/variants');

function testVariantSurface() {
  assert.deepStrictEqual(variants.names, [
    'organelle', 'adaptiveMicrobiome', 'immuneCritical', 'localFirst', 'regenerative',
    'cloudCoreEdge', 'edgeCoreCloud', 'memoryRich', 'competitivePartner', 'procedural', 'tool', 'cloudCoreEdgeSync'
  ]);
  for (const name of variants.names) {
    const policy = variants.getVariant(name);
    for (const method of [
      'configureHost', 'configureAdmission', 'configureResources',
      'configureImmunePolicy', 'configureTransmission', 'configureSuccession', 'configureStopConditions',
      'configurePlacement', 'configureMemory', 'configureCompetition', 'configureTool', 'configureSynchronization'
    ]) {
      assert.ok(policy[method]());
    }
    const fit = policy.analyzeFit({ capabilities: [
      'stable-core', 'diversity', 'cloud-core', 'edge-symbionts', 'cloud-proxy',
      'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync', 'provenance-verification'
    ],
      localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true });
    assert.strictEqual(fit.compatible, true);
    assert.strictEqual(fit.score, 1);
  }
}

function testExtendedVariantContracts() {
  assert.equal(variants.getVariant('cloud-core/edge-symbionts').configureAdmission().requireEdgeLease, true);
  assert.equal(variants.getVariant('edge-core/cloud-symbionts').configureAdmission().redactRemoteInputs, true);
  assert.deepEqual(variants.getVariant('memory-rich').configureMemory().stores, ['semantic', 'episodic', 'procedural']);
  assert.equal(variants.getVariant('competitive-partner').configureCompetition().trialMode, 'same-budget');
  assert.equal(variants.getVariant('procedural').configureHost().capabilityGapResponse, 'contracted-recruitment');
  assert.equal(variants.getVariant('tool').configureTool().sandbox, 'contract-bound');
  assert.equal(variants.getVariant('cloud-core/edge-sync').configureSynchronization().staleState, 'reject');
}

function testFitAndIsolation() {
  const localFirst = variants.getVariant('localFirst');
  assert.deepStrictEqual(localFirst.analyzeFit({ localEngineAvailable: false }).reasons, ['local-engine']);
  const hostConfig = localFirst.configureHost();
  hostConfig.preferredEngine = 'cloud';
  assert.strictEqual(localFirst.configureHost().preferredEngine, 'local');
  assert.throws(() => variants.getVariant('unknown'), { code: 'HOLOBIONT_VARIANT_UNKNOWN' });
}

function testSecuritySensitiveMissionRouting() {
  const compose = require('../src/services/holobionteCoordinationService').composeHolobiont;
  const missions = [
    'Conçois une procédure de changement de mot de passe, puis fais valider les failles par l’immunité.',
    'Fais tourner les clés API sans interruption et sans secret dans les logs, avec rollback.',
    'Renomme une colonne critique sans perte de données et valide les invariants de rollback.',
    'Conçois une authentification passkeys et empêche les failles de récupération de compte.',
    'Corrige une vulnérabilité critique sans désactiver les contrôles de sécurité.',
    'Gère les secrets multi-tenant avec révocation, chiffrement et récupération après compromission.'
  ];
  for (const mission of missions) assert.equal(compose(mission).variant, 'immune-critical', mission);
}

function testNamedRedMissionRouting() {
  const cases = [
    ['1. Organelle', 'organelle'], ['2. Adaptive Microbiome', 'adaptive-microbiome'],
    ['3. Immune-Critical', 'immune-critical'], ['4. Local-First', 'local-first'],
    ['5. Regenerative', 'regenerative'], ['6. Cloud-Core / Edge-Symbionts', 'cloud-core/edge-symbionts'],
    ['7. Edge-Core / Cloud-Symbionts', 'edge-core/cloud-symbionts'], ['8. Memory-Rich', 'memory-rich'],
    ['9. Competitive-Partner', 'competitive-partner'], ['10. Procedural Holobiont', 'procedural'],
    ['11. Tool Holobiont', 'tool'], ['12. Cloud-Core / Edge-Sync', 'cloud-core/edge-sync']
  ];
  const fitContext = { capabilities: ['stable-core', 'diversity', 'cloud-core', 'edge-symbionts',
    'cloud-proxy', 'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync', 'provenance-verification'],
  localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true };
  for (const [mission, expected] of cases) {
    assert.equal(variants.selectForMission(mission, fitContext).policy.name, expected, mission);
  }
  assert.throws(() => variants.selectForMission('4. Local-First'),
    { code: 'HOLOBIONT_VARIANT_INCOMPATIBLE' });
}

testVariantSurface();
testFitAndIsolation();
testExtendedVariantContracts();
testSecuritySensitiveMissionRouting();
testNamedRedMissionRouting();
console.log('✅ Holobiont variant policy tests passed.');
