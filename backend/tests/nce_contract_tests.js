'use strict';

/**
 * @file nce_contract_tests.js
 * @description Harnais de régression NCE — prototype, pas validation scientifique.
 *
 * ⚠️  Ce fichier est un harnais de prototype.
 *     Aucune conclusion scientifique sur l'effet causal de NCE
 *     n'est encore autorisée à partir de ces résultats.
 *
 * Contractuels testés :
 *  - enrichWorkerPromptSync retourne une chaîne
 *  - les moteurs NCE respectent leur flag .enabled
 *  - la boucle enhanceMissionWithNCE inclut bien Play et Phenotype
 */

const assert = require('assert');
const topologyNCE = require('../src/services/topologyNCEService');
const nceIntegration = require('../src/services/nceIntegrationService');
const nceEngines = require('../src/services/nceEngines');

const BASE_MISSION = {
  prompt: 'Mission de test',
  domain: 'test',
  agentId: 'agent-1',
  workspacePath: '/tmp/nonexistent-play-workspace',
};

function missionWithNceOptions(overrides = {}) {
  return {
    ...BASE_MISSION,
    nceOptions: Object.assign({
      curiosity: true,
      reprMutation: true,
      exaptation: true,
      play: true,
      phenotype: true,
      envCoev: true,
      culture: true,
    }, overrides),
  };
}

async function testEnrichWorkerPayloadIsString() {
  const enriched = topologyNCE.enrichWorkerPromptSync('mission', {
    topology: 'worker',
  });
  assert.strictEqual(typeof enriched, 'string', 'enrichWorkerPromptSync doit retourner une chaîne');
  console.log('✓ test:enrichWorkerPayloadIsString');
}

async function testNceFlagsRespectEnabled() {
  // Curiosity désactivé :doit retourner null**
  const disabledMission = missionWithNceOptions({ curiosity: false });
  const curiosity = await nceEngines.applyCuriosity(disabledMission, nceIntegration.createNCEConfig(disabledMission.nceOptions));
  assert.strictEqual(curiosity, null, 'applyCuriosity doit retourner null quand curiosity.enabled est false');

  // EnvCoev désactivé :doit retourner []
  const envMission = missionWithNceOptions({ envCoev: false });
  const envCoev = await nceEngines.applyEnvCoev(envMission, nceIntegration.createNCEConfig(envMission.nceOptions));
  assert.ok(Array.isArray(envCoev) && envCoev.length === 0, 'applyEnvCoev doit retourner [] quand envCoev.enabled est false');

  // Exaptation désactivé :doit retourner []
  const exapMission = missionWithNceOptions({ exaptation: false });
  const exaptation = await nceEngines.applyExaptation(exapMission, nceIntegration.createNCEConfig(exapMission.nceOptions), null);
  assert.ok(Array.isArray(exaptation) && exaptation.length === 0, 'applyExaptation doit retourner [] quand exaptation.enabled est false');

  console.log('✓ test:nceFlagsRespectEnabled');
}

async function testNceLoopIncludesPlayAndPhenotype() {
  const enhancements = await nceIntegration.enhanceMissionWithNCE(missionWithNceOptions(), null);
  assert.ok(Object.prototype.hasOwnProperty.call(enhancements, 'play'), 'enhanceMissionWithNCE doit produire une clé play');
  assert.ok(Object.prototype.hasOwnProperty.call(enhancements, 'phenotype'), 'enhanceMissionWithNCE doit produire une clé phenotype');
  console.log('✓ test:nceLoopIncludesPlayAndPhenotype');
}

async function testNceEnginesExports() {
  assert.strictEqual(typeof nceEngines.applyPlay, 'function', 'applyPlay doit être exportée');
  assert.strictEqual(typeof nceEngines.applyPhenotype, 'function', 'applyPhenotype doit être exportée');
  console.log('✓ test:nceEnginesExports');
}

async function main() {
  console.log('=== NCE CONTRACT TESTS (PROTOTYPE) ===');
  await testEnrichWorkerPayloadIsString();
  await testNceFlagsRespectEnabled();
  await testNceLoopIncludesPlayAndPhenotype();
  await testNceEnginesExports();
  console.log('=== ALL NCE CONTRACT TESTS PASSED ===');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('NCE CONTRACT TEST FAILURE:', err);
    process.exit(1);
  });
}

module.exports = {
  testEnrichWorkerPayloadIsString,
  testNceFlagsRespectEnabled,
  testNceLoopIncludesPlayAndPhenotype,
  testNceEnginesExports,
};
