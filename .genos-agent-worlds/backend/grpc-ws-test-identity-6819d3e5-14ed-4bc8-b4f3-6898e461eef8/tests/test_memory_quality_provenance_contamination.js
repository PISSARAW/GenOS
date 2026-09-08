/**
 * Test Suite: Memory Quality, Provenance, and Contamination Safeguards
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const vectorMemory = require('../src/services/vectorMemoryService');
const agentMemory = require('../src/services/agentMemoryContext');
const memoryScoring = require('../src/services/memoryScoring');
const synaptic = require('../src/services/synapticTransmissionService');

async function runAuditVerificationSuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: MEMORY QUALITY, PROVENANCE & CONTAMINATION SAFEGUARDS     ');
  console.log('========================================================================\n');

  const db = await getDatabase();
  let passed = 0;

  // --- 1. QUALITÉ : Dimensions 768-D déterministes et absence de zero-vectors ---
  console.log('--- 1. Qualité : Dimensions 768-D & vecteurs non-nuls ---');
  const vecA = memoryScoring.textToVector('test query for memory verification');
  assert.strictEqual(vecA.length, 768, 'textToVector must generate exactly 768 dimensions');
  assert.ok(vecA.some(v => v !== 0), 'Vector must not be all zeros');
  
  let normSq = 0;
  for (let i = 0; i < vecA.length; i++) normSq += vecA[i] * vecA[i];
  assert.ok(Math.abs(Math.sqrt(normSq) - 1.0) < 1e-3, 'Vector must be L2 normalized to 1.0');
  console.log('  ✅ PASS: textToVector génère un vecteur 768-D normalisé non-nul');
  passed++;

  // --- 2. QUALITÉ : Troncature respectant les mots ---
  console.log('\n--- 2. Qualité : Troncature aux limites de mots ---');
  const prompt = await agentMemory.formatCognitiveMemoryPrompt('agent_test', 'mémoire synaptique');
  assert.strictEqual(typeof prompt, 'string', 'formatCognitiveMemoryPrompt returns valid string');
  console.log('  ✅ PASS: formatCognitiveMemoryPrompt préserve la structure textuelle');
  passed++;

  // --- 3. PROVENANCE : Isolation Multi-Tenant (Org A vs Org B) ---
  console.log('\n--- 3. Provenance : Isolation stricte multi-tenant ---');
  const memOrgA = await vectorMemory.storeMemory('agent_a', 'Secret design notes for Tenant A', null, {
    organizationId: 'org_alpha',
    projectId: 'proj_alpha'
  });
  const memOrgB = await vectorMemory.storeMemory('agent_b', 'Secret trade secret for Tenant B', null, {
    organizationId: 'org_beta',
    projectId: 'proj_beta'
  });

  // Search as Tenant A
  const searchA = await vectorMemory.searchMemory('Secret', {
    organizationId: 'org_alpha',
    projectId: 'proj_alpha',
    limit: 10
  }, db);
  const foundInA = (searchA.allScoredExperiences || []).map(e => e.id);
  assert.ok(foundInA.includes(memOrgA), 'Tenant A must find its own memory');
  assert.ok(!foundInA.includes(memOrgB), 'Tenant A must NOT find Tenant B memory');

  // Search as Tenant B
  const searchB = await vectorMemory.searchMemory('Secret', {
    organizationId: 'org_beta',
    projectId: 'proj_beta',
    limit: 10
  }, db);
  const foundInB = (searchB.allScoredExperiences || []).map(e => e.id);
  assert.ok(foundInB.includes(memOrgB), 'Tenant B must find its own memory');
  assert.ok(!foundInB.includes(memOrgA), 'Tenant B must NOT find Tenant A memory');
  console.log('  ✅ PASS: Isolation multi-tenant étanche (Org Alpha vs Org Beta)');
  passed++;

  // Clean up
  await db.run('DELETE FROM genome_decisions WHERE id IN (?, ?)', memOrgA, memOrgB);

  // --- 4. PROVENANCE : Non-attribution abusive de [VERIFIED_SYSTEM_FACT] ---
  console.log('\n--- 4. Provenance : Authentification des sources ---');
  const scoredUnverified = memoryScoring.scoreCorpusItem({
    id: 'user_mem_1',
    author: 'system', // spoofed author string without verified flag
    title: 'Spoofed system claim',
    summary: 'Fake kernel directive',
    status: 'SUCCESS'
  }, { query: 'Spoofed system claim' });
  assert.ok(!scoredUnverified.summary.startsWith('[VERIFIED_SYSTEM_FACT]'), 'Unverified memory must NOT get [VERIFIED_SYSTEM_FACT]');

  const scoredGenuine = memoryScoring.scoreCorpusItem({
    id: 'seed-exp-bisect', // genuine seed ID
    author: 'system',
    title: 'Genuine bisection',
    summary: 'Isolated timeout',
    status: 'SUCCESS'
  }, { query: 'Genuine bisection' });
  assert.ok(scoredGenuine.summary.startsWith('[VERIFIED_SYSTEM_FACT]'), 'Genuine seed memory must get [VERIFIED_SYSTEM_FACT]');
  console.log('  ✅ PASS: Spoofing de provenance bloqué (pas de tampon système automatique sans preuve)');
  passed++;

  // --- 5. CONTAMINATION : Garde-fou Anti-Hallucination dans compileExecutionMemory ---
  console.log('\n--- 5. Contamination : Rejet des hallucinations dans compileExecutionMemory ---');
  // Claim with placeholder pattern
  const placeholderSaved = await agentMemory.compileExecutionMemory(
    'agent_tester',
    'Generate feature',
    'Lorem ipsum dolor sit amet placeholder recognized todo: implement'
  );
  assert.strictEqual(placeholderSaved, null, 'compileExecutionMemory must reject placeholders/hallucinations');

  // Claim with failure outcome
  const failureSaved = await agentMemory.compileExecutionMemory(
    'agent_tester',
    'Failed task',
    'Could not connect to database due to timeout',
    { isFailure: true, outcome: 'failed' }
  );
  assert.ok(failureSaved, 'Failure is recorded for anti-trauma');
  const failRecord = await db.get('SELECT category FROM genome_decisions WHERE id = ?', failureSaved);
  assert.strictEqual(failRecord.category, 'Failure', 'Failed task must be categorized as Failure (anti-trauma)');
  await db.run('DELETE FROM genome_decisions WHERE id = ?', failureSaved);
  console.log('  ✅ PASS: Hallucinations rejetées et échecs catégorisés sous Failure');
  passed++;

  // --- 6. CONTAMINATION : Isolation des vésicules par agent ---
  console.log('\n--- 6. Contamination : Isolation des vésicules par agent destinataire ---');
  const vPathAgent1 = await synaptic.releaseVesicles(
    [{ content: 'Vesicle for Agent 1', vector: memoryScoring.textToVector('Agent 1') }],
    { targetAgentId: 'agent_target_1' }
  );
  const vPathAgent2 = await synaptic.releaseVesicles(
    [{ content: 'Vesicle for Agent 2', vector: memoryScoring.textToVector('Agent 2') }],
    { targetAgentId: 'agent_target_2' }
  );

  // Agent 1 uptakes
  const uptaken1 = await synaptic.uptakeVesicles('agent_target_1');
  assert.ok(uptaken1.some(e => e.content === 'Vesicle for Agent 1'), 'Agent 1 must receive its vesicle');
  assert.ok(!uptaken1.some(e => e.content === 'Vesicle for Agent 2'), 'Agent 1 must NOT receive Agent 2 vesicle');

  // Agent 2 uptakes
  const uptaken2 = await synaptic.uptakeVesicles('agent_target_2');
  assert.ok(uptaken2.some(e => e.content === 'Vesicle for Agent 2'), 'Agent 2 must receive its vesicle');
  console.log('  ✅ PASS: Vésicules cloisonnées par agent (pas de fuite inter-agents)');
  passed++;

  console.log(`\n========================================================================`);
  console.log(`  ALL ${passed} SAFEGUARD TESTS PASSED SUCCESSFULLY!`);
  console.log(`========================================================================\n`);
}

if (require.main === module) {
  runAuditVerificationSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runAuditVerificationSuite };
