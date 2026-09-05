const assert = require('assert');
const fs = require('fs');
const path = require('path');
const trinityDeployService = require('../src/services/deploy/trinityDeploy.service');
const synapticTransmission = require('../src/services/synapticTransmissionService');
const vectorMemory = require('../src/services/vectorMemoryService');
const agentMemory = require('../src/services/agentMemoryContext');
const immune = require('../src/services/immuneSystem');
const { studioBridgeRoot } = require('../src/services/genosCli');
const { getDatabase } = require('../src/db');

async function testTrinityDomainProfiling() {
  console.log('--- 1. Testing Trinity Domain Profiling in trinityDeployService ---');
  const db = await getDatabase();
  await db.run(
    "INSERT OR IGNORE INTO workspaces (id, name, path) VALUES ('ws-test-trinity', 'Test Workspace', '.')"
  );

  // Test Security Domain
  const secResult = await trinityDeployService.deployTrinity({
    prompt: 'Use Trinity to secure OAuth permissions against token exploits.',
    resolvedAgentType: 'codex',
    workspaceId: 'ws-test-trinity',
    workspace: { path: '.' }
  });

  assert.equal(secResult.domain, 'security', 'Security domain must be detected');
  assert.equal(secResult.persistedWorlds.length, 3, 'Must deploy 3 worlds');
  const secRoles = secResult.persistedWorlds.map(w => w.strategy);
  assert.deepEqual(secRoles, [
    'baseline_security_engineer',
    'threat_model_engineer',
    'adversarial_security_engineer'
  ], 'Security domain roles must match trinity profiling');

  // Test Creative Writing Domain
  const creativeResult = await trinityDeployService.deployTrinity({
    prompt: 'Lance Trinity pour écrire une nouvelle littéraire dramatique.',
    resolvedAgentType: 'codex',
    workspaceId: 'ws-test-trinity',
    workspace: { path: '.' }
  });

  assert.equal(creativeResult.domain, 'creative_writing', 'Creative writing domain must be detected');
  const creativeRoles = creativeResult.persistedWorlds.map(w => w.strategy);
  assert.deepEqual(creativeRoles, [
    'direct_author',
    'planned_author',
    'self_correcting_literary_author'
  ], 'Creative domain roles must match trinity profiling');

  console.log('  ✅ PASS: Trinity deployment uses dynamic domain profiling and specialized worker roles.');
}

async function testSynapticVesiclesAndExosomes() {
  console.log('--- 2. Testing Synaptic Vesicles & Exosomes Epigenetic Loop ---');
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  const exoDir = path.join(studioBridgeRoot(), 'extracellular_matrix');

  // A. Release Vesicle
  const epistemicDirective = '[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD] Absolute ground truth memory test.';
  const vesiclePath = await synapticTransmission.releaseVesicles([
    { content: epistemicDirective, vector: new Array(768).fill(0.1) },
    { content: 'Contextual fact: server uses port 8080.', vector: new Array(768).fill(0.2) }
  ]);
  assert.ok(fs.existsSync(vesiclePath), 'Vesicle file must exist in synaptic_cleft');

  // B. Uptake Vesicle in Agent Memory Context
  const memoryPrompt = await agentMemory.formatCognitiveMemoryPrompt('agent_test_vesicle', 'Check server port');
  assert.ok(memoryPrompt.includes(epistemicDirective), 'Memory prompt must contain uptaken epistemic shield');
  assert.ok(memoryPrompt.includes('server uses port 8080'), 'Memory prompt must contain regular vesicle engrams');
  assert.ok(!fs.existsSync(vesiclePath), 'Vesicle file must be reuptaken and unlinked from synaptic_cleft');

  // C. Deposit Exosome via compileExecutionMemory
  await agentMemory.compileExecutionMemory(
    'agent_test_vesicle',
    'Optimization task',
    'Successfully optimized database connection pooling'
  );

  const exoFiles = fs.existsSync(exoDir) ? fs.readdirSync(exoDir).filter(f => f.endsWith('.exosome')) : [];
  assert.ok(exoFiles.length > 0, 'Exosome must be deposited in extracellular_matrix');

  // D. Absorb Exosomes during Sleep Cycle
  const db = await getDatabase();
  const cycleResult = await vectorMemory.sleepCycle(db);
  assert.ok(cycleResult.exosomesAbsorbed > 0, 'Sleep cycle must absorb deposited exosomes');
  assert.ok(cycleResult.engramsStored > 0, 'Absorbed exosome engrams must be stored in memory');

  const remainingExos = fs.readdirSync(exoDir).filter(f => f.endsWith('.exosome'));
  assert.equal(remainingExos.length, 0, 'All exosomes must be phagocytized from extracellular_matrix');

  console.log('  ✅ PASS: Synaptic vesicle reuptake and exosome epigenetic phagocytosis loop complete.');
}

async function testTextChaperoningAndCognitiveMonitoring() {
  console.log('--- 3. Testing Textual Chaperoning & Cognitive Health Monitoring ---');

  // Test Output Purification
  const rawLlmOutput = `
Voici la réponse que vous avez demandée :

# Architecture Système
Ce module fournit une haute disponibilité.

N'hésitez pas si vous avez d'autres questions !
`;

  const chapResult = immune.chaperoneAgentOutput(rawLlmOutput, {
    expectedTerms: ['Architecture', 'Système', 'disponibilité']
  });

  assert.ok(!chapResult.purifiedText.startsWith('Voici'), 'Preamble must be stripped');
  assert.ok(!chapResult.purifiedText.includes("N'hésitez pas"), 'Postamble must be stripped');
  assert.ok(chapResult.purifiedText.startsWith('# Architecture Système'), 'Markdown structure preserved');
  assert.equal(chapResult.warning, false, 'Healthy output should not trigger warning');

  // Test Repetition & Cognitive Anomaly Detection
  const repetitiveText = 'erreur boucle erreur boucle erreur boucle erreur boucle erreur boucle erreur boucle erreur boucle erreur boucle';
  const anomalyResult = immune.chaperoneAgentOutput(repetitiveText);
  assert.equal(anomalyResult.warning, true, 'Excessive repetition must trigger cognitive warning');
  assert.ok(anomalyResult.health.health_score < 0.6, 'Health score must drop under excessive repetition');

  console.log('  ✅ PASS: Text output is governed and cognitive monitor detects anomalies.');
}

async function run() {
  try {
    await testTrinityDomainProfiling();
    await testSynapticVesiclesAndExosomes();
    await testTextChaperoningAndCognitiveMonitoring();
    console.log('\n========================================');
    console.log('ALL EXECUTION LOOP RECONNECTION TESTS PASSED!');
    console.log('========================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

run();
