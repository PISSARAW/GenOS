'use strict';

/**
 * Test GWT-1 : Spécialistes parallèles
 * Probe : Traces de concurrence et contrôle sériel
 * 
 * Démontre :
 * 1. Dispatch concurrent de signaux vers différents rôles (spécialistes parallèles)
 * 2. Contrôle sériel via désensibilisation, seuils, capacité de livraison
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dispatch } = require('../src/services/selectiveSignalService');

function stubDb() {
  const tables = new Map();
  // Seed lineage: orchestrator-1 is parent of workers and daemon
  tables.set('agents|orchestrator-1', JSON.stringify({ id: 'orchestrator-1', role: 'orchestrator', parent_agent_id: null }));
  tables.set('agents|worker-1', JSON.stringify({ id: 'worker-1', role: 'worker', parent_agent_id: 'orchestrator-1' }));
  tables.set('agents|worker-2', JSON.stringify({ id: 'worker-2', role: 'worker', parent_agent_id: 'orchestrator-1' }));
  tables.set('agents|daemon-1', JSON.stringify({ id: 'daemon-1', role: 'daemon', parent_agent_id: 'orchestrator-1' }));
  tables.set('agents|default-1', JSON.stringify({ id: 'default-1', role: 'default', parent_agent_id: null }));
  
  return {
    get: async (sql, ...params) => {
      // AdaptiveStateService queries: SELECT payload_json FROM adaptive_state WHERE scope = ? AND key = ?
      if (sql.includes('adaptive_state') && sql.includes('WHERE scope') && sql.includes('key')) {
        const [, scope, key] = params;
        const fullKey = `adaptive_state|${scope}|${key}`;
        console.log(`  [DB GET] adaptive_state: scope=${scope}, key=${key}, found=${tables.has(fullKey)}`);
        if (tables.has(fullKey)) return { payload_json: tables.get(fullKey) };
        return null;
      }
      // Other queries use s|k format
      const key = `${params[0]}|${params[1]}`;
      if (tables.has(key)) return { payload_json: tables.get(key) };
      return null;
    },
    all: async (sql) => {
      if (sql.includes('FROM agents')) {
        return [
          { id: 'orchestrator-1', role: 'orchestrator', parent_agent_id: null },
          { id: 'worker-1', role: 'worker', parent_agent_id: 'orchestrator-1' },
          { id: 'worker-2', role: 'worker', parent_agent_id: 'orchestrator-1' },
          { id: 'daemon-1', role: 'daemon', parent_agent_id: 'orchestrator-1' },
          { id: 'default-1', role: 'default', parent_agent_id: null }
        ];
      }
      if (sql.includes('FROM signal_blobs')) {
        return Array.from(tables.entries())
          .filter(([key]) => key.startsWith('signal_blobs|'))
          .map(([, value]) => JSON.parse(value));
      }
      if (sql.includes('FROM signal_deliveries')) {
        return Array.from(tables.entries())
          .filter(([key]) => key.startsWith('signal_deliveries|'))
          .map(([, value]) => JSON.parse(value));
      }
      return [];
    },
    run: async (sql, ...params) => {
      if (sql.includes('INSERT INTO signal_blobs')) {
        const [, signalId, signalType, content, topic, senderAgentId, expiresAt] = params;
        tables.set(`signal_blobs|${signalId}`, JSON.stringify({
          signal_id: signalId, signal_type: signalType, content, topic, sender_agent_id: senderAgentId, expires_at: expiresAt
        }));
      }
      if (sql.includes('INSERT OR IGNORE INTO signal_deliveries')) {
        const [, signalId, subscriberAgentId, status] = params;
        tables.set(`signal_deliveries|${signalId}|${subscriberAgentId}`, JSON.stringify({
          signal_id: signalId, subscriber_agent_id: subscriberAgentId, status
        }));
      }
      if (sql.includes('adaptive_state') && (sql.includes('INSERT') || sql.includes('REPLACE'))) {
        // INSERT OR REPLACE INTO adaptive_state (scope, key, payload_json, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        const [scope, key, payloadJson, version] = params;
        tables.set(`adaptive_state|${scope}|${key}`, payloadJson);
      }
    },
    seed: (scope, key, value) => tables.set(`${scope}|${key}`, JSON.stringify(value))
  };
}

async function runGWT1Test() {
  const db = stubDb();
  const now = Date.now();
  const results = {
    property: 'GWT-1',
    label: 'Spécialistes parallèles',
    protocol: { id: 'gwt1-parallel-specialists', version: '1.0.0' },
    provenance: { runId: `gwt1-${now}`, source: 'test_gwt1_parallel_specialists.js' },
    limits: [
      'In-memory stub DB, no native SQLite',
      'Concurrency simulated via sequential async dispatch',
      'No external model or perceptual substrate involved'
    ],
    artifacts: [],
    stages: {}
  };

  // Test 1: Dispatch concurrent vers différents rôles
  console.log('Test 1: Dispatch concurrent vers orchestrator, workers, daemon...');
  const signals = [
    { modality: 'arousal', signature: 'signal-A', agentId: 'orchestrator-1', intensity: 0.8, content: 'High arousal' },
    { modality: 'directive', signature: 'signal-B', agentId: 'orchestrator-1', intensity: 0.6, content: 'Directive to workers' },
    { modality: 'threat', signature: 'signal-C', agentId: 'orchestrator-1', intensity: 0.9, content: 'Threat detected' },
    { modality: 'arousal', signature: 'signal-D', agentId: 'orchestrator-1', intensity: 0.4, content: 'Low arousal' }
  ];

  const dispatchResults = [];
  for (const signal of signals) {
    const result = await dispatch(db, signal);
    console.log(`  Signal ${signal.signature}: delivered=${JSON.stringify(result.delivered)}, suppressed=${JSON.stringify(result.suppressed)}`);
    dispatchResults.push({ signal: signal.signature, ...result });
  }

  // Vérifier que chaque signal est livré aux bons rôles (avec contrôle sériel partagé)
  // Signal A (arousal) : orchestrator + worker-1 (worker-2 désensibilisé par contrôle sériel)
  assert.ok(dispatchResults[0].delivered.includes('orchestrator-1'), 'Signal A should reach orchestrator');
  assert.ok(dispatchResults[0].delivered.includes('worker-1'), 'Signal A should reach worker-1');
  const w2suppressed = dispatchResults[0].suppressed.find(s => s.agentId === 'worker-2');
  assert.ok(w2suppressed && w2suppressed.reason === 'desensitized', 'Signal A: worker-2 should be desensitized (serial control)');
  assert.ok(!dispatchResults[0].delivered.includes('daemon-1'), 'Signal A (arousal) should not reach daemon');
  assert.ok(!dispatchResults[0].delivered.includes('default-1'), 'Signal A (arousal) below threshold for default');

  // Signal B (directive) : nouvelle signature, sensibilité réinitialisée
  assert.ok(dispatchResults[1].delivered.includes('orchestrator-1'), 'Signal B should reach orchestrator');
  assert.ok(dispatchResults[1].delivered.includes('worker-1'), 'Signal B should reach worker-1');
  const w2suppressedB = dispatchResults[1].suppressed.find(s => s.agentId === 'worker-2');
  assert.ok(w2suppressedB && w2suppressedB.reason === 'desensitized', 'Signal B: worker-2 desensitized (serial control per signature)');

  // Signal C (threat) : daemon atteint, workers non (pas de récepteur threat)
  assert.ok(dispatchResults[2].delivered.includes('orchestrator-1'), 'Signal C should reach orchestrator');
  assert.ok(dispatchResults[2].delivered.includes('daemon-1'), 'Signal C (threat) should reach daemon');
  assert.ok(!dispatchResults[2].delivered.includes('worker-1'), 'Signal C (threat) should not reach worker');

  console.log('  ✅ Dispatch concurrent vers rôles spécialisés validé');

  // Test 2: Contrôle sériel - Désensibilisation
  console.log('Test 2: Désensibilisation (contrôle sériel)...');
  const repeatedSignal = { modality: 'arousal', signature: 'repeated-signal', agentId: 'orchestrator-1', intensity: 0.8 };
  
  // Premier envoi - devrait passer
  const first = await dispatch(db, repeatedSignal);
  assert.ok(first.delivered.includes('orchestrator-1'), 'First delivery should succeed');
  
  // Deuxième envoi immédiat - désensibilisé (×0.7 = 0.56, seuil orchestrator=0.3, passe encore)
  const second = await dispatch(db, repeatedSignal);
  console.log(`  Second: delivered=${JSON.stringify(second.delivered)}, suppressed=${JSON.stringify(second.suppressed)}`);
  assert.ok(second.delivered.includes('orchestrator-1'), 'Second delivery should still succeed (0.56 > 0.3)');
  
  // Troisième envoi - 0.56 * 0.7 = 0.392, encore au-dessus de 0.3
  const third = await dispatch(db, repeatedSignal);
  console.log(`  Third: delivered=${JSON.stringify(third.delivered)}, suppressed=${JSON.stringify(third.suppressed)}`);
  assert.ok(third.delivered.includes('orchestrator-1'), 'Third delivery should still succeed');
  
  // Quatrième envoi - 0.392 * 0.7 = 0.274, EN DESSOUS de 0.3 -> bloqué
  const fourth = await dispatch(db, repeatedSignal);
  console.log(`  Fourth: delivered=${JSON.stringify(fourth.delivered)}, suppressed=${JSON.stringify(fourth.suppressed)}`);
  const orchestratorSuppressed = fourth.suppressed.find(s => s.agentId === 'orchestrator-1');
  assert.ok(orchestratorSuppressed, 'Fourth delivery should be suppressed for orchestrator');
  
  console.log('  ✅ Désensibilisation progressive validée (contrôle sériel)');

  // Test 3: Capacité et éviction (seuils par rôle)
  console.log('Test 3: Seuils par rôle (capacité sélective)...');
  const weakSignal = { modality: 'arousal', signature: 'weak-signal', agentId: 'orchestrator-1', intensity: 0.25 };
  const weakResult = await dispatch(db, weakSignal);
  // orchestrator minIntensity=0.3, worker=0.4, default=0.6
  // 0.25 < 0.3 -> orchestrator supprimé
  const orchestratorWeak = weakResult.suppressed.find(s => s.agentId === 'orchestrator-1');
  assert.ok(orchestratorWeak && orchestratorWeak.reason === 'below_threshold', 'Weak signal should be below threshold for orchestrator');
  
  // Mais signal plus fort pour worker
  const workerSignal = { modality: 'directive', signature: 'worker-signal', agentId: 'orchestrator-1', intensity: 0.45 };
  const workerResult = await dispatch(db, workerSignal);
  assert.ok(workerResult.delivered.includes('worker-1'), 'Worker signal should reach worker (0.45 > 0.4)');
  assert.ok(!workerResult.delivered.includes('orchestrator-1'), 'Directive not in orchestrator modalities');
  
  console.log('  ✅ Filtrage par seuils de rôle validé (capacité sélective)');

  // Test 4: Concurrence - Signaux simultanés différents
  console.log('Test 4: Signaux simultanés - pas d\'interférence...');
  const concurrentSignals = [
    { modality: 'arousal', signature: 'concurrent-A', agentId: 'orchestrator-1', intensity: 0.7 },
    { modality: 'directive', signature: 'concurrent-B', agentId: 'orchestrator-1', intensity: 0.7 },
    { modality: 'threat', signature: 'concurrent-C', agentId: 'orchestrator-1', intensity: 0.7 }
  ];
  
  const concurrentResults = [];
  for (const signal of concurrentSignals) {
    concurrentResults.push(await dispatch(db, signal));
  }
  
  // Chaque signal doit atteindre ses destinataires propres sans interférence
  assert.ok(concurrentResults[0].delivered.includes('orchestrator-1') && concurrentResults[0].delivered.includes('worker-1'));
  assert.ok(concurrentResults[1].delivered.includes('orchestrator-1') && concurrentResults[1].delivered.includes('worker-1'));
  assert.ok(concurrentResults[2].delivered.includes('orchestrator-1') && concurrentResults[2].delivered.includes('daemon-1'));
  
  console.log('  ✅ Concurrence sans interférence validée');

  // Générer les artefacts
  const artifact1 = {
    ref: 'gwt1-dispatch-traces.json',
    content: JSON.stringify(dispatchResults, null, 2)
  };
  artifact1.sha256 = crypto.createHash('sha256').update(artifact1.content, 'utf8').digest('hex');
  
  const artifact2 = {
    ref: 'gwt1-desensitization-trace.json',
    content: JSON.stringify({ first, second, third, fourth }, null, 2)
  };
  artifact2.sha256 = crypto.createHash('sha256').update(artifact2.content, 'utf8').digest('hex');
  
  const artifact3 = {
    ref: 'gwt1-threshold-filtering.json',
    content: JSON.stringify({ weakResult, workerResult }, null, 2)
  };
  artifact3.sha256 = crypto.createHash('sha256').update(artifact3.content, 'utf8').digest('hex');
  
  const artifact4 = {
    ref: 'gwt1-concurrent-signals.json',
    content: JSON.stringify(concurrentResults, null, 2)
  };
  artifact4.sha256 = crypto.createHash('sha256').update(artifact4.content, 'utf8').digest('hex');

  results.artifacts = [artifact1, artifact2, artifact3, artifact4];
  results.result = 'passed';

  // Stages: specified -> implemented -> causal -> generalized -> operational
  // Pour ce test: specified=passed (protocole défini), implemented=passed (code existe),
  // causal=passed (intervention mesurée: désensibilisation), generalized=not_run, operational=not_run
  results.stages = {
    specified: { status: 'passed', evidenceRefs: ['gwt1-dispatch-traces.json'] },
    implemented: { status: 'passed', evidenceRefs: ['gwt1-dispatch-traces.json'] },
    causal: { status: 'passed', evidenceRefs: ['gwt1-desensitization-trace.json', 'gwt1-threshold-filtering.json'] },
    generalized: { status: 'not_run', evidenceRefs: [] },
    operational: { status: 'not_run', evidenceRefs: [] }
  };

  return results;
}

async function main() {
  try {
    const results = await runGWT1Test();
    
    // Sauvegarder les artefacts
    const artifactsDir = path.join(__dirname, '..', 'artifacts', 'gwt1');
    fs.mkdirSync(artifactsDir, { recursive: true });
    
    for (const artifact of results.artifacts) {
      fs.writeFileSync(path.join(artifactsDir, artifact.ref), artifact.content);
    }
    
    // Créer le reçu complet
    const receipt = {
      schema: 'genos.indicator-receipt/v1',
      id: `gwt1-${Date.now()}`,
      profile: 'node-runtime',
      property: 'GWT-1',
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
    
    console.log('\n✅ GWT-1 test passed');
    console.log(`📄 Receipt saved to: ${receiptPath}`);
    console.log(`📁 Artifacts saved to: ${artifactsDir}`);
    
    // Évaluer le reçu
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
    console.error('❌ GWT-1 test failed:', error);
    process.exit(1);
  }
}

main();