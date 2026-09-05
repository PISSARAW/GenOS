/**
 * Verification Suite: GLiNER NER Service & Local Cognitive Runtime
 */

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const nerService = require('../src/services/nerService');
const graphRagService = require('../src/services/graphRagService');
const runtimeExecutable = require('../src/services/agentRuntimeExecutable');
const { encodeMission, decodeEvents } = require('../src/services/runtimeProtocol');
const { getDatabase } = require('../src/db');

async function runTests() {
  console.log('=== LANCEMENT DES TESTS : GLiNER NER & RUNTIME COGNITIF LOCAL ===\n');

  // -------------------------------------------------------------
  // TEST 1 : Service NER (Health & Fallback Heuristique)
  // -------------------------------------------------------------
  console.log('=== TEST 1 : Service NER & Extraction d\'Entités ===');
  const health = await nerService.checkHealth(500);
  assert.ok(typeof health.available === 'boolean', 'Le statut available doit être booléen');
  console.log(`-> Cas 1.1 Validé : Health check NER probe (${health.status}, available=${health.available}).`);

  const sampleText = 'GenOS utilise SQLite, Rust et Node.js pour déployer des agents autonomes chez Google.';
  const extracted = await nerService.extractEntities(sampleText);
  assert.ok(Array.isArray(extracted.entities), 'Doit retourner un tableau entities');
  assert.ok(Array.isArray(extracted.relations), 'Doit retourner un tableau relations');
  assert.ok(extracted.entities.some(e => ['SQLite', 'Rust', 'Node.js', 'GenOS'].includes(e.text)), 'Doit extraire les technologies clés');
  assert.ok(extracted.entities.some(e => ['Google', 'GenOS'].includes(e.text)), 'Doit extraire les organisations');
  assert.ok(extracted.relations.length > 0, 'Doit former des relations entre entités');
  console.log(`-> Cas 1.2 Validé : ${extracted.entities.length} entités et ${extracted.relations.length} relations extraites (source: ${extracted.source}).`);

  // -------------------------------------------------------------
  // TEST 2 : GraphRAG Ingestion de Document & Requête
  // -------------------------------------------------------------
  console.log('\n=== TEST 2 : GraphRAG Ingestion avec Câblage Sémantique ===');
  const db = await getDatabase();
  const docId = `doc-ner-test-${Date.now()}`;
  const docText = 'GenOS et Google DeepMind renforcent SQLite avec des index vectoriels et du Rust.';

  const ingestRes = await graphRagService.ingestDocument(docId, docText, db);
  assert.strictEqual(ingestRes.docId, docId, 'Le docId doit correspondre');
  assert.ok(ingestRes.entitiesCount >= 2, 'Au moins 2 entités extraites');
  console.log(`-> Cas 2.1 Validé : Document ingéré (${ingestRes.entitiesCount} entités, ${ingestRes.synapsesCreated} synapses).`);

  const queryRes = await graphRagService.queryKnowledgeGraph('SQLite Rust', 5, db);
  assert.ok(Array.isArray(queryRes.nodes), 'Doit retourner un tableau de noeuds');
  assert.ok(typeof queryRes.synthesis === 'string', 'Doit retourner une synthèse textuelle');
  assert.ok(queryRes.nodes.length > 0, 'Le graphe doit renvoyer des noeuds associés');
  console.log(`-> Cas 2.2 Validé : Requête GraphRAG complétée (${queryRes.nodes.length} noeuds trouvés).`);

  // Nettoyage du document de test
  await db.run('DELETE FROM genome_decisions WHERE id = ?', docId);

  // -------------------------------------------------------------
  // TEST 3 : Routage Dynamique de l'Exécutable Runtime
  // -------------------------------------------------------------
  console.log('\n=== TEST 3 : Sélection et Résolution de l\'Exécutable ===');
  const defaultExe = runtimeExecutable.configuredExecutable();
  assert.ok(defaultExe.endsWith('genos-agent-runtime.cjs'), 'Par défaut, doit pointer sur genos-agent-runtime.cjs');
  assert.strictEqual(runtimeExecutable.isLocalRuntime(defaultExe), false);
  console.log('-> Cas 3.1 Validé : Runtime Codex sélectionné par défaut.');

  const localMission1 = { runtime: 'local' };
  const localExe1 = runtimeExecutable.configuredExecutable(localMission1);
  assert.ok(localExe1.endsWith('local-codex-runtime.cjs'), 'runtime=local doit pointer sur local-codex-runtime.cjs');
  assert.strictEqual(runtimeExecutable.isLocalRuntime(localExe1), true);
  console.log('-> Cas 3.2 Validé : runtime=local active local-codex-runtime.cjs.');

  const localMission2 = { agentType: 'Local' };
  const localExe2 = runtimeExecutable.configuredExecutable(localMission2);
  assert.ok(localExe2.endsWith('local-codex-runtime.cjs'), 'agentType=Local doit pointer sur local-codex-runtime.cjs');
  console.log('-> Cas 3.3 Validé : agentType=Local active local-codex-runtime.cjs.');

  const availability = runtimeExecutable.runtimeAvailability(localExe1);
  assert.strictEqual(availability.available, true, 'Le script local runtime doit exister');
  console.log('-> Cas 3.4 Validé : Disponibilité du runtime local confirmée.');

  // -------------------------------------------------------------
  // TEST 4 : Exécution du Runtime Cognitif Local via Protocole
  // -------------------------------------------------------------
  console.log('\n=== TEST 4 : Exécution de bout en bout de local-codex-runtime.cjs ===');
  const localScriptPath = path.resolve(__dirname, '../bin/local-codex-runtime.cjs');
  const missionPayload = encodeMission({
    agentId: 'agent-local-test-01',
    name: 'Griot',
    role: 'Assistant local cognitif',
    prompt: 'Analyser les capacités locales de GenOS',
    executionMode: 'orchestrator'
  });

  const child = spawn(process.execPath, [localScriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const events = [];
  let chunkBuffer = Buffer.alloc(0);

  child.stdout.on('data', (chunk) => {
    chunkBuffer = Buffer.concat([chunkBuffer, chunk]);
    chunkBuffer = decodeEvents(chunkBuffer, (evt) => {
      events.push(evt);
    });
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', resolve);
    child.stdin.end(missionPayload);
  });

  assert.strictEqual(exitCode, 0, 'Le runtime local doit terminer avec le code 0');
  const eventTypes = events.map(e => e.eventType);
  assert.ok(eventTypes.includes('AGENT_PLAN_CREATED'), 'Doit émettre AGENT_PLAN_CREATED');
  assert.ok(eventTypes.includes('AGENT_COMPLETED'), 'Doit émettre AGENT_COMPLETED');
  console.log(`-> Cas 4.1 Validé : Exit code 0, événements reçus : ${eventTypes.join(', ')}.`);

  // -------------------------------------------------------------
  // TEST 5 : Endpoint REST POST /api/rag/ner/extract
  // -------------------------------------------------------------
  console.log('\n=== TEST 5 : Endpoint REST POST /api/rag/ner/extract ===');
  const crypto = require('crypto');
  const testToken = 'test-ner-token-' + Date.now();
  const tokenHash = crypto.createHash('sha256').update(testToken).digest('hex');
  await db.run(
    "INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions, is_active) VALUES ('test-ner-key', ?, 'Test Admin', 'admin', '[\"all\"]', 1)",
    tokenHash
  );

  const { createApp } = require('../src/app');
  const app = createApp();
  const testServer = app.listen(4299);
  try {
    const res = await fetch('http://localhost:4299/api/rag/ner/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
        'X-CSRF-Token': 'test-token'
      },
      body: JSON.stringify({ text: 'GenOS connects SQLite with Rust and Node.js' })
    });
    assert.strictEqual(res.status, 200, 'Doit répondre avec un code HTTP 200');
    const json = await res.json();
    assert.ok(Array.isArray(json.entities), 'Doit retourner un tableau entities');
    assert.ok(json.entities.some(e => e.text === 'GenOS'), 'Doit contenir GenOS');
    console.log(`-> Cas 5.1 Validé : Endpoint REST 200 OK (${json.entities.length} entités extraites).`);
  } finally {
    await db.run("DELETE FROM access_keys WHERE id = 'test-ner-key'");
    await new Promise((res) => testServer.close(res));
  }

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS GLiNER & LOCAL RUNTIME ONT RÉUSSI AVEC SUCCÈS !');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('\n❌ ÉCHEC DU TEST :', err);
  process.exit(1);
});
