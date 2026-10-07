'use strict';

/**
 * Test GWT-2 : Workspace limité et sélectif (Goulot/Ignition)
 * Probe : Surcharge, admissions et évictions
 * 
 * Démontre :
 * 1. Accumulation de charge avec fuite (intégration temporelle)
 * 2. Seuil d'ignition non-linéaire (burst ×1.5, période réfractaire)
 * 3. Compétition avec inhibition entre candidats (éviction)
 * 4. Mesure admissions/évictions par rounds de compétition
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { charge, competeWinners, BURST_FACTOR, LOCAL_FACTOR, REFRACTORY_FACTOR, DEFAULT_THRESHOLD } = require('../src/services/ignitionService');

function stubDb() {
  const tables = new Map();
  return {
    get: async (sql, ...params) => {
      if (sql.includes('adaptive_state') && sql.includes('WHERE scope') && sql.includes('key')) {
        const [scope, key] = params;
        const fullKey = `adaptive_state|${scope}|${key}`;
        if (tables.has(fullKey)) return { payload_json: tables.get(fullKey) };
        return null;
      }
      const key = `${params[0]}|${params[1]}`;
      if (tables.has(key)) return { payload_json: tables.get(key) };
      return null;
    },
    run: async (sql, ...params) => {
      if (sql.includes('adaptive_state') && !sql.includes('adaptive_state_events')
        && (sql.includes('INSERT') || sql.includes('REPLACE'))) {
        const [scope, key, payloadJson, version] = params;
        tables.set(`adaptive_state|${scope}|${key}`, payloadJson);
      }
    }
  };
}

async function runGWT2Test() {
  const db = stubDb();
  const now = Date.now();
  const results = {
    property: 'GWT-2',
    label: 'Workspace limité et sélectif',
    protocol: { id: 'gwt2-workspace-capacity', version: '1.0.0' },
    provenance: { runId: `gwt2-${now}`, source: 'test_gwt2_workspace_capacity.js' },
    limits: [
      'In-memory stub DB, no native SQLite',
      'Time simulated via explicit now parameter',
      'No external model or perceptual substrate involved'
    ],
    artifacts: [],
    stages: {}
  };

  // Test 1: Intégration temporelle avec fuite (leaky integrate)
  console.log('Test 1: Accumulation de charge avec fuite...');
  const agentId = 'test-agent-1';
  const baseNow = 1000000;
  
  // Premier événement - charge 0.5 (< seuil 1.0)
  let outcome = await charge(db, agentId, { weight: 0.5, now: baseNow });
  console.log(`  Charge 1: ignited=${outcome.ignited}, charge=${outcome.charge}, ignitions=${outcome.ignitions}`);
  assert.strictEqual(outcome.ignited, false);
  assert.strictEqual(outcome.charge, 0.5);
  assert.strictEqual(outcome.ignitions, 0);
  
  // Deuxième événement 5s plus tard - fuite : 0.5 - 5000/60000 = 0.416, + 0.5 = 0.916
  outcome = await charge(db, agentId, { weight: 0.5, now: baseNow + 5000 });
  console.log(`  Charge 2: ignited=${outcome.ignited}, charge=${outcome.charge}, ignitions=${outcome.ignitions}`);
  assert.strictEqual(outcome.ignited, false);
  assert.ok(outcome.charge > 0.4 && outcome.charge < 1.0, `Charge should be ~0.916, got ${outcome.charge}`);
  
  // Troisième événement - dépasse le seuil (0.916 + 0.5 = 1.416 > 1.0)
  outcome = await charge(db, agentId, { weight: 0.5, now: baseNow + 10000 });
  console.log(`  Charge 3: ignited=${outcome.ignited}, charge=${outcome.charge}, ignitions=${outcome.ignitions}`);
  assert.strictEqual(outcome.ignited, true);
  assert.strictEqual(outcome.charge, 0); // Reset après ignition
  assert.strictEqual(outcome.ignitions, 1);
  
  console.log('  ✅ Accumulation avec fuite et seuil validée');

  // Test 2: Burst non-linéaire et période réfractaire
  console.log('Test 2: Burst et réfractaire...');
  const agentId2 = 'test-agent-2';
  const baseNow2 = 2000000;
  
  // Ignition
  outcome = await charge(db, agentId2, { weight: 1.5, now: baseNow2, threshold: 1.0 });
  assert.strictEqual(outcome.ignited, true);
  assert.strictEqual(outcome.ignitions, 1);
  const refractoryUntil = baseNow2 + 5000; // DEFAULT_REFRACTORY_MS
  
  // Immédiatement après - devrait être supprimé (réfractaire)
  outcome = await charge(db, agentId2, { weight: 1.5, now: baseNow2 + 100, threshold: 1.0 });
  assert.strictEqual(outcome.ignited, false);
  assert.strictEqual(outcome.suppressed, true);
  
  // Après période réfractaire - devrait pouvoir igniter à nouveau
  outcome = await charge(db, agentId2, { weight: 1.5, now: baseNow2 + 6000, threshold: 1.0 });
  assert.strictEqual(outcome.ignited, true);
  assert.strictEqual(outcome.ignitions, 2);
  
  console.log('  ✅ Burst, réfractaire et réarmement validés');

  // Test 3: Compétition avec inhibition (éviction de candidats)
  console.log('Test 3: Compétition avec inhibition...');
  const candidates = [
    { id: 'strong', drives: { urgency: 0.9, relevance: 0.8 } },
    { id: 'medium', drives: { urgency: 0.6, relevance: 0.7 } },
    { id: 'weak', drives: { urgency: 0.3, relevance: 0.4 } },
    { id: 'distractor', drives: { urgency: 0.2, relevance: 0.1 } }
  ];
  
  const weights = { urgency: 1.0, relevance: 1.0 };
  const competition = competeWinners(candidates, { rounds: 3, inhibition: 0.2, margin: 0.15, weights });
  
  // Vérifier que l'inhibition a créé un écart entre candidats
  const strongAct = competition.activations.strong;
  const weakAct = competition.activations.weak;
  assert.ok(strongAct > weakAct, 'Strong should have higher activation than weak');
  assert.ok(strongAct - weakAct > 0.15, 'Weak should be evicted (diff > margin)');
  
  // Vérifier que les gagnants sont dans la marge du top
  const topAct = Math.max(...Object.values(competition.activations));
  const winnersInMargin = Object.entries(competition.activations)
    .filter(([id, act]) => topAct - act <= 0.15)
    .map(([id]) => id);
  assert.deepStrictEqual(competition.winners.sort(), winnersInMargin.sort(), 'Winners should be within margin of top');
  
  console.log('  ✅ Compétition avec inhibition et éviction validée');

  // Test 4: Surcharge - trop de candidats, capacité limitée
  console.log('Test 4: Surcharge et capacité limitée...');
  const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
    id: `cand-${i}`,
    drives: { urgency: 0.5 + Math.random() * 0.4, relevance: 0.5 + Math.random() * 0.4 }
  }));
  
  const overloadCompetition = competeWinners(manyCandidates, { rounds: 2, inhibition: 0.3, margin: 0.1, weights });
  
  // Seuls les gagnants dans la marge du top sont admis
  assert.ok(overloadCompetition.winners.length >= 1, 'At least one winner');
  assert.ok(overloadCompetition.winners.length <= manyCandidates.length, 'Winners <= candidates');
  assert.strictEqual(overloadCompetition.rounds, 2);
  
  // Vérifier qu'il y a bien des évincés
  const admitted = overloadCompetition.winners.length;
  const evicted = manyCandidates.length - admitted;
  assert.ok(evicted > 0, 'Some candidates should be evicted under overload');
  
  console.log('  ✅ Surcharge et capacité limitée validées');

  // Test 5: Facteurs constants exposés
  console.log('Test 5: Constantes du modèle...');
  assert.strictEqual(BURST_FACTOR, 1.5);
  assert.strictEqual(LOCAL_FACTOR, 0.9);
  assert.strictEqual(REFRACTORY_FACTOR, 0.8);
  assert.strictEqual(DEFAULT_THRESHOLD, 1.0);
  console.log('  ✅ Constantes du modèle exposées');

  // Générer les artefacts
  const artifact1 = {
    ref: 'gwt2-charge-accumulation.json',
    content: JSON.stringify({ test: 'accumulation with leak', threshold: DEFAULT_THRESHOLD, leakPerMs: 1/60000 }, null, 2)
  };
  artifact1.sha256 = crypto.createHash('sha256').update(artifact1.content, 'utf8').digest('hex');

  const artifact2 = {
    ref: 'gwt2-burst-refractory.json',
    content: JSON.stringify({ burstFactor: BURST_FACTOR, refractoryFactor: REFRACTORY_FACTOR, refractoryMs: 5000 }, null, 2)
  };
  artifact2.sha256 = crypto.createHash('sha256').update(artifact2.content, 'utf8').digest('hex');

  const artifact3 = {
    ref: 'gwt2-competition-inhibition.json',
    content: JSON.stringify({ competition, inhibition: 0.2, margin: 0.15 }, null, 2)
  };
  artifact3.sha256 = crypto.createHash('sha256').update(artifact3.content, 'utf8').digest('hex');

  const artifact4 = {
    ref: 'gwt2-overload-eviction.json',
    content: JSON.stringify({ overloadCompetition, totalCandidates: manyCandidates.length }, null, 2)
  };
  artifact4.sha256 = crypto.createHash('sha256').update(artifact4.content, 'utf8').digest('hex');

  results.artifacts = [artifact1, artifact2, artifact3, artifact4];
  results.result = 'passed';

  results.stages = {
    specified: { status: 'passed', evidenceRefs: ['gwt2-charge-accumulation.json'] },
    implemented: { status: 'passed', evidenceRefs: ['gwt2-charge-accumulation.json', 'gwt2-burst-refractory.json'] },
    causal: { status: 'passed', evidenceRefs: ['gwt2-competition-inhibition.json', 'gwt2-overload-eviction.json'] },
    generalized: { status: 'not_run', evidenceRefs: [] },
    operational: { status: 'not_run', evidenceRefs: [] }
  };

  return results;
}

async function main() {
  try {
    const results = await runGWT2Test();
    
    const artifactsDir = path.join(__dirname, '..', 'artifacts', 'gwt2');
    fs.mkdirSync(artifactsDir, { recursive: true });
    
    for (const artifact of results.artifacts) {
      fs.writeFileSync(path.join(artifactsDir, artifact.ref), artifact.content);
    }
    
    const receipt = {
      schema: 'genos.indicator-receipt/v1',
      id: `gwt2-${Date.now()}`,
      profile: 'node-runtime',
      property: 'GWT-2',
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
    
    console.log('\n✅ GWT-2 test passed');
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
    console.error('❌ GWT-2 test failed:', error);
    process.exit(1);
  }
}

main();