const assert = require('assert');
const crypto = require('node:crypto');
const { executeBioTool } = require('../src/services/mcpBioTools');
const { listRelations } = require('../src/services/crossAgentRelationalService');
const { getDatabase } = require('../src/db');

async function seedRelationAgent(db, id) {
  await db.run(
    "INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode) VALUES (?, ?, 'worker', 'idle', 'worker')",
    id,
    `Chimeric test ${id}`
  );
}

async function runTest() {
  console.log('=== TESTING CHIMERIC TETRAGAMETIC MERGE & MOSAIC HERITAGE ===');
  const ids = {
    mosaic: `mosaic-test-${crypto.randomUUID()}`,
    genome: `genome-test-${crypto.randomUUID()}`,
    epigenome: `epigenome-test-${crypto.randomUUID()}`
  };
  const db = await getDatabase();
  await Promise.all(Object.values(ids).map((id) => seedRelationAgent(db, id)));

  const fuseRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'fuse_mosaic',
    mosaic_id: ids.mosaic,
    branch_genome: ids.genome,
    branch_epigenome: ids.epigenome,
    tools: ['tool_ast_visitor', 'tool_bisection_engine', 'tool_crypto_prover'],
    vaccines: ['vaccine_null_pointer_guard', 'vaccine_infinite_recursion_breaker'],
    reasoning_strategy: 'MONTE_CARLO_TREE_SEARCH'
  });

  assert.strictEqual(fuseRes.success, true);
  assert.strictEqual(fuseRes.status, 'mosaic_fused');
  assert.strictEqual(fuseRes.runtime_agent_created, false);
  assert.strictEqual(fuseRes.execution_scope, 'metadata_simulation');
  assert.strictEqual(fuseRes.functional_tools_count, 3);
  assert.strictEqual(fuseRes.immune_vaccines_count, 2);
  assert.ok(fuseRes.hybrid_dna_hash);
  const lineageEdges = await listRelations({ db, agentId: ids.mosaic });
  assert.ok(lineageEdges.filter((edge) => edge.relationType === 'chimera').length >= 2);
  console.log(`PASS: Fused mosaic metadata: ${fuseRes.hybrid_dna_hash.slice(0, 12)} (coherence ${fuseRes.coherence_score})`);

  const inspectRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'inspect_mosaic_heritage',
    mosaic_id: ids.mosaic
  });
  assert.strictEqual(inspectRes.success, true);
  assert.strictEqual(inspectRes.lineages.functional_genome_origin, ids.genome);
  assert.strictEqual(inspectRes.lineages.epigenetic_origin, ids.epigenome);

  const verifyRes = await executeBioTool('genos_biomimicry_chimeric_merge', {
    action: 'verify_mosaic_coherence',
    mosaic_id: ids.mosaic
  });
  assert.strictEqual(verifyRes.success, true);
  assert.strictEqual(verifyRes.status, 'coherence_verified');
  assert.strictEqual(verifyRes.validation_passed, true);
  console.log('PASS: Dual metadata lineage and coherence verified; no runtime agent was created.');
}

runTest().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});