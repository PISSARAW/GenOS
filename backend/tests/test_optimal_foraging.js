/**
 * Test Suite — Foraging Scout-Harvester Service & MCP Handler
 * Vérifie le théorème de la valeur marginale de Charnov (MVT),
 * les vols de Lévy et la division du travail stigmergique Scout -> Harvester.
 */

const assert = require('assert');
const { ForagingScoutHarvesterService, defaultForaging } = require('../src/services/foragingScoutHarvesterService');
const { handleOptimalForaging } = require('../src/services/mcpBioTools/handlers/optimalForaging');

async function runTests() {
  console.log('====================================================');
  console.log('    GenOS V3 - Test Optimal Foraging & Stigmergy    ');
  console.log('====================================================');

  const foraging = new ForagingScoutHarvesterService({ envMeanReturnRate: 0.35, levyExponent: 2.0 });

  // 1. Test Théorème de Charnov (Marginal Value Theorem)
  console.log('[1/4] Testing Charnov MVT patch yield & departure decisions...');
  
  // Scénario A : Patch fertile (gain récent élevé)
  const fertileHistory = [
    { step: 1, infoGain: 0.8 },
    { step: 2, infoGain: 0.9 }
  ];
  const fertileEval = foraging.evaluatePatchYield(fertileHistory, 2);
  assert.strictEqual(fertileEval.shouldDepart, false);
  assert.strictEqual(fertileEval.decision, 'EXPLOIT_PATCH');
  assert.ok(fertileEval.marginalYield >= 0.35);
  console.log('  -> Fertile patch recognized: continue exploitation (dI/dt =', fertileEval.marginalYield, ')');

  // Scénario B : Patch épuisé (rendement tombé sous theta = 0.35)
  const exhaustedHistory = [
    { step: 1, infoGain: 0.8 },
    { step: 2, infoGain: 0.9 },
    { step: 3, infoGain: 0.1 },
    { step: 4, infoGain: 0.05 }
  ];
  const exhaustedEval = foraging.evaluatePatchYield(exhaustedHistory, 4);
  assert.strictEqual(exhaustedEval.shouldDepart, true);
  assert.strictEqual(exhaustedEval.decision, 'PATCH_DEPARTURE');
  assert.ok(exhaustedEval.marginalYield < 0.35);
  console.log('  -> Exhausted patch triggered departure: (dI/dt =', exhaustedEval.marginalYield, '< 0.35)');

  // 2. Test Vols de Lévy (Lévy Flights)
  console.log('[2/4] Testing Lévy flight step generation...');
  let localSteps = 0;
  let macroJumps = 0;
  for (let i = 1; i <= 50; i++) {
    const flight = foraging.computeLevyFlightStep(i);
    assert.ok(flight.stepLength >= 1);
    if (flight.isMacroJump) macroJumps++;
    else localSteps++;
  }
  assert.ok(localSteps > 0, 'Must produce local intensive steps');
  assert.ok(macroJumps > 0, 'Must produce heavy-tailed macro jumps (Lévy distribution)');
  console.log(`  -> 50 Lévy iterations: ${localSteps} local steps vs ${macroJumps} macro jumps`);

  // 3. Test Stigmergy Handoff (Scout -> Harvester)
  console.log('[3/4] Testing stigmergic pheromone token deposit & harvesting...');
  const scoutId = 'scout_arxiv_spider';
  const targetUrl = 'https://arxiv.org/abs/2206.12345';
  const artifactPayload = {
    type: 'scientific_figure_crop',
    localPath: '.genos/workspace/fovea/fig1_axes.png',
    sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    keyFacts: {
      targetWord: 'egalitarian',
      coordinate3DAxis: 'Z-top',
      secondaryPaperQuery: 'arXiv:1608.physics'
    },
    confidence: 0.99
  };

  const sealedToken = foraging.depositPheromoneEvidence(scoutId, targetUrl, artifactPayload);
  assert.ok(sealedToken.tokenId);
  assert.ok(sealedToken.signature);
  console.log('  -> Scout sealed pheromone token:', sealedToken.tokenId);

  const harvestResult = foraging.harvestEvidence(sealedToken.tokenId, 'harvester_analyst');
  assert.strictEqual(harvestResult.success, true);
  assert.strictEqual(harvestResult.evidenceIntact, true);
  assert.strictEqual(harvestResult.handoffData.keyFacts.targetWord, 'egalitarian');
  console.log('  -> Harvester validated token integrity and unsealed payload');

  // 4. Test MCP Handler genos_optimal_foraging
  console.log('[4/4] Testing MCP Handler genos_optimal_foraging...');
  const mcpEval = await handleOptimalForaging({
    action: 'evaluate_patch',
    history: [{ infoGain: 0.05 }, { infoGain: 0.02 }],
    elapsed_time_sec: 2
  });
  assert.strictEqual(mcpEval.success, true);
  assert.strictEqual(mcpEval.status, 'completed');

  const mcpStep = await handleOptimalForaging({
    action: 'levy_step',
    iteration: 3
  });
  assert.strictEqual(mcpStep.success, true);

  const mcpDeposit = await handleOptimalForaging({
    action: 'deposit',
    scout_id: 'scout_test',
    url: 'https://usgs.gov/nas/search',
    key_facts: { zipCode: '34689', park: 'Fred Howard Park' }
  });
  assert.strictEqual(mcpDeposit.success, true);
  const token = JSON.parse(mcpDeposit.output);

  const mcpHarvest = await handleOptimalForaging({
    action: 'harvest',
    token_id: token.tokenId,
    harvester_id: 'harvester_test'
  });
  assert.strictEqual(mcpHarvest.success, true);
  console.log('  -> MCP integration passed');

  console.log('\n[PASS] All Optimal Foraging & Stigmergy tests passed successfully!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('[FATAL] Optimal Foraging test failed:', err);
  process.exit(1);
});
