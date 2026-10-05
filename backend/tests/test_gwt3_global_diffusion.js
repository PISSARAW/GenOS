'use strict';

/**
 * Test GWT-3 : Diffusion globale
 * Probe : Livraison puis usage ; coupure des canaux
 * 
 * Démontre :
 * 1. Contenu sélectionné accessible aux modules cognitifs autorisés (diffusion)
 * 2. Coupure d'un canal de livraison modifie l'usage (causalEffect)
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { compete, diffuse, consume, causalEffect } = require('../src/services/globalWorkspaceService');

async function runGWT3Test() {
  const now = Date.now();
  const results = {
    property: 'GWT-3',
    label: 'Diffusion globale',
    protocol: { id: 'gwt3-global-diffusion', version: '1.0.0' },
    provenance: { runId: `gwt3-${now}`, source: 'test_gwt3_global_diffusion.js' },
    limits: [
      'Pure function test, no database or external dependencies',
      'Simulates delivery and consumption without runtime integration',
      'No perceptual substrate or external model involved'
    ],
    artifacts: [],
    stages: {}
  };

  // Test 1: Diffusion globale - contenu sélectionné livré aux modules autorisés
  console.log('Test 1: Diffusion globale vers modules autorisés...');
  const state = compete([
    { id: 'content-A', salience: 2, data: { task: 'analyze' } },
    { id: 'content-B', salience: 1, data: { task: 'monitor' } },
    { id: 'content-C', salience: 0.5, data: { task: 'log' } }
  ], { capacity: 2, ignitionThreshold: 1, modules: ['memory', 'planning', 'reporting', 'execution'] });

  assert.strictEqual(state.ignited, true);
  assert.strictEqual(state.winner.id, 'content-A');
  assert.strictEqual(state.admitted.length, 2);
  assert.strictEqual(state.evicted.length, 1);

  const delivery = diffuse(state, ['memory', 'planning', 'reporting', 'execution', 'unauthorized']);
  const memoryDelivery = delivery.find(d => d.module === 'memory');
  const unauthorizedDelivery = delivery.find(d => d.module === 'unauthorized');
  
  assert.strictEqual(memoryDelivery.available, true);
  assert.strictEqual(memoryDelivery.contentId, 'content-A');
  assert.strictEqual(unauthorizedDelivery.available, false);
  assert.strictEqual(unauthorizedDelivery.contentId, null);

  console.log('  ✅ Diffusion vers modules autorisés validée');

  // Test 2: Consommation - usage réel du contenu livré
  console.log('Test 2: Consommation et usage du contenu...');
  const contents = new Map(state.admitted.map(item => [item.id, item.data]));
  
  const memoryConsumption = consume(state, 'memory', (contentId) => contents.get(contentId));
  assert.strictEqual(memoryConsumption.consumed, true);
  assert.strictEqual(memoryConsumption.output.task, 'analyze');
  assert.strictEqual(memoryConsumption.available, true);

  const planningConsumption = consume(state, 'planning', (contentId) => contents.get(contentId));
  assert.strictEqual(planningConsumption.consumed, true);
  assert.strictEqual(planningConsumption.output.task, 'analyze');

  const unauthorizedConsumption = consume(state, 'unauthorized', (contentId) => contents.get(contentId));
  assert.strictEqual(unauthorizedConsumption.consumed, false);
  assert.strictEqual(unauthorizedConsumption.available, false);
  assert.strictEqual(unauthorizedConsumption.output, null);

  console.log('  ✅ Consommation effective validée');

  // Test 3: Effet causal - coupure du canal modifie l'usage
  console.log('Test 3: Effet causal - ablation de canal...');
  
  const withChannel = causalEffect(state, 'memory', (contentId) => {
    return contentId ? `processed-${contentId}` : 'fallback';
  });
  
  const withoutChannel = causalEffect({ ...state, winner: null }, 'memory', (contentId) => {
    return contentId ? `processed-${contentId}` : 'fallback';
  });
  
  assert.strictEqual(withChannel.measured, true);
  assert.strictEqual(withChannel.changed, true);
  assert.strictEqual(withChannel.delivered, 'processed-content-A');
  assert.strictEqual(withChannel.ablated, 'fallback');

  assert.strictEqual(withoutChannel.measured, false);
  assert.strictEqual(withoutChannel.changed, false);

  console.log('  ✅ Effet causal (livraison vs ablation) validé');

  // Test 4: Compétition multi-contenu avec éviction
  console.log('Test 4: Compétition et éviction...');
  const competitiveState = compete([
    { id: 'high-priority', salience: 10 },
    { id: 'medium-priority', salience: 5 },
    { id: 'low-priority', salience: 1 },
    { id: 'very-low', salience: 0.1 }
  ], { capacity: 2, ignitionThreshold: 3, modules: ['memory', 'planning'] });

  assert.strictEqual(competitiveState.admitted.length, 2);
  assert.strictEqual(competitiveState.admitted[0].id, 'high-priority');
  assert.strictEqual(competitiveState.admitted[1].id, 'medium-priority');
  assert.strictEqual(competitiveState.evicted.length, 2);
  assert.strictEqual(competitiveState.winner.id, 'high-priority');
  assert.strictEqual(competitiveState.ignited, true);

  console.log('  ✅ Compétition avec capacité limitée et éviction validée');

  // Générer les artefacts
  const artifact1 = {
    ref: 'gwt3-diffusion-delivery.json',
    content: JSON.stringify({ state, delivery }, null, 2)
  };
  artifact1.sha256 = crypto.createHash('sha256').update(artifact1.content, 'utf8').digest('hex');

  const artifact2 = {
    ref: 'gwt3-consumption-traces.json',
    content: JSON.stringify({ 
      memory: memoryConsumption, 
      planning: planningConsumption, 
      unauthorized: unauthorizedConsumption 
    }, null, 2)
  };
  artifact2.sha256 = crypto.createHash('sha256').update(artifact2.content, 'utf8').digest('hex');

  const artifact3 = {
    ref: 'gwt3-causal-effect.json',
    content: JSON.stringify({ withChannel, withoutChannel }, null, 2)
  };
  artifact3.sha256 = crypto.createHash('sha256').update(artifact3.content, 'utf8').digest('hex');

  const artifact4 = {
    ref: 'gwt3-competition-eviction.json',
    content: JSON.stringify(competitiveState, null, 2)
  };
  artifact4.sha256 = crypto.createHash('sha256').update(artifact4.content, 'utf8').digest('hex');

  results.artifacts = [artifact1, artifact2, artifact3, artifact4];
  results.result = 'passed';

  results.stages = {
    specified: { status: 'passed', evidenceRefs: ['gwt3-diffusion-delivery.json'] },
    implemented: { status: 'passed', evidenceRefs: ['gwt3-diffusion-delivery.json'] },
    causal: { status: 'passed', evidenceRefs: ['gwt3-causal-effect.json', 'gwt3-consumption-traces.json'] },
    generalized: { status: 'not_run', evidenceRefs: [] },
    operational: { status: 'not_run', evidenceRefs: [] }
  };

  return results;
}

async function main() {
  try {
    const results = await runGWT3Test();
    
    const artifactsDir = path.join(__dirname, '..', 'artifacts', 'gwt3');
    fs.mkdirSync(artifactsDir, { recursive: true });
    
    for (const artifact of results.artifacts) {
      fs.writeFileSync(path.join(artifactsDir, artifact.ref), artifact.content);
    }
    
    const receipt = {
      schema: 'genos.indicator-receipt/v1',
      id: `gwt3-${Date.now()}`,
      profile: 'node-runtime',
      property: 'GWT-3',
      registryVersion: 'genos.indicator-registry/v1',
      protocol: results.protocol,
      provenance: results.provenance,
      result: results.result,
      stages: results.stages,
      limits: results.limits,
      artifacts: results.artifacts
    };
    
    const receiptPath = path.join(artifactsDir, 'receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    
    console.log('\n✅ GWT-3 test passed');
    console.log(`📄 Receipt saved to: ${receiptPath}`);
    console.log(`📁 Artifacts saved to: ${artifactsDir}`);
    
    const { evaluateReceipt } = require('../src/services/indicatorReceiptService');
    const evaluation = evaluateReceipt(receipt);
    
    const evalPath = path.join(artifactsDir, 'evaluation.json');
    fs.writeFileSync(evalPath, JSON.stringify(evaluation, null, 2));
    console.log(`📊 Evaluation saved to: ${evalPath}`);
    
    console.log('\n📋 Stages status:');
    for (const [stage, entry] of Object.entries(evaluation.stages)) {
      console.log(`  ${stage}: ${entry.status}`);
    }
    
    return evaluation;
  } catch (error) {
    console.error('❌ GWT-3 test failed:', error);
    process.exit(1);
  }
}

main();