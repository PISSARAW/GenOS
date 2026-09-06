const assert = require('assert');
const { getDatabase } = require('../src/db');
const genosCli = require('../src/services/genosCli');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');
const geneticsService = require('../src/services/geneticsService');

async function runTests() {
  console.log('=== Test Suite : Reconnexion de genos-reproduction & Moteur Génétique ===\n');
  assert.strictEqual(geneticsService.crossoverGenome({ genes: { role: 'a', strategy: 'a', tools: ['genos_inspect'], temp: 0.1, topP: 0.9 } }, { genes: { role: 'b', strategy: 'b', tools: ['genos_test'], temp: 0.2, topP: 0.8 } }, { mutationRate: 0 }).mutationRateApplied, 0);
  assert.throws(() => geneticsService.crossoverGenome({}, {}, { mutationRate: 1.01 }), /mutationRate must be between 0 and 1/);

  // --- 1. Test CLI Rust : Meiotic Crossover ---
  console.log('--- 1. Testing Rust Native Meiotic Crossover ---');
  const crossResult = await genosCli.runCrossover({
    parentA: 'AGENT_GENOME_ARCHITECT',
    parentB: 'AGENT_GENOME_CRITIC',
    swapProb: 0.5
  });
  assert(crossResult.ok, `CLI crossover failed: ${crossResult.stderr}`);
  assert.strictEqual(crossResult.json.operation, 'meiotic_crossover');
  assert.strictEqual(crossResult.json.status, 'recombined');
  assert(crossResult.json.child_genome_id, 'Child genome ID must be generated');
  assert(crossResult.json.maternal_sequence_length > 0, 'Chromosome sequence length must be > 0');
  const replayCrossResult = await genosCli.runCrossover({
    parentA: 'AGENT_GENOME_ARCHITECT',
    parentB: 'AGENT_GENOME_CRITIC',
    swapProb: 0.5
  });
  assert.strictEqual(replayCrossResult.json.reproducibility_key, crossResult.json.reproducibility_key);
  console.log(`  ✅ PASS: Meiotic crossover generated child ${crossResult.json.child_genome_id} (${crossResult.json.crossover_strategy})`);

  // --- 2. Test CLI Rust : Cell Division (Mitosis & Binary Fission) ---
  console.log('\n--- 2. Testing Rust Native Cell Division Modes ---');
  const mitosisResult = await genosCli.runCellDivision({
    agentId: 'cell_division_stem_01',
    mode: 'mitosis'
  });
  assert(mitosisResult.ok, `CLI mitosis failed: ${mitosisResult.stderr}`);
  assert.strictEqual(mitosisResult.json.division_mode, 'mitosis');
  assert.strictEqual(mitosisResult.json.status, 'mitosis_completed');
  assert.strictEqual(mitosisResult.json.progeny_count, 1);
  console.log(`  ✅ PASS: Mitosis produced identical daughter clone: ${mitosisResult.json.clone_genome_id}`);

  const fissionResult = await genosCli.runCellDivision({
    agentId: 'cell_fission_02',
    mode: 'binary_fission',
    mutationRate: 0.08
  });
  assert(fissionResult.ok, `CLI binary fission failed: ${fissionResult.stderr}`);
  assert.strictEqual(fissionResult.json.division_mode, 'binary_fission');
  assert.strictEqual(fissionResult.json.mutation_rate_applied, 0.08);
  console.log(`  ✅ PASS: Binary fission with point mutation completed: ${fissionResult.json.child_genome_id}`);

  const buddingResult = await genosCli.runCellDivision({
    agentId: 'cell_budding_mother_01',
    mode: 'budding',
    daughterVolume: 0.25,
    hayflickLimit: 5
  });
  assert(buddingResult.ok, `CLI budding failed: ${buddingResult.stderr}`);
  assert.strictEqual(buddingResult.json.division_mode, 'budding');
  assert.strictEqual(buddingResult.json.daughter_volume, 0.25);
  assert.strictEqual(buddingResult.json.mother_scars_count, 1);
  assert.strictEqual(buddingResult.json.hayflick_limit, 5);
  assert.strictEqual(buddingResult.json.remaining_buds, 4);
  assert.strictEqual(buddingResult.json.is_ephemeral, true);
  console.log(`  ✅ PASS: Asymmetric budding produced ephemeral bud ${buddingResult.json.daughter_genome_id} (scars: ${buddingResult.json.mother_scars_count})`);

  const meiosisResult = await genosCli.runCellDivision({
    agentId: 'cell_meiosis_mother_01',
    mode: 'meiosis'
  });
  assert(meiosisResult.ok, `CLI meiosis failed: ${meiosisResult.stderr}`);
  assert.strictEqual(meiosisResult.json.division_mode, 'meiosis');
  assert.strictEqual(meiosisResult.json.status, 'meiosis_completed');
  assert.strictEqual(meiosisResult.json.progeny_count, 4);
  assert.strictEqual(meiosisResult.json.reduction_completed, true);
  console.log(`  ✅ PASS: Meiosis produced 4 recombinant haploid gametes: ${meiosisResult.json.gamete_genome_ids.join(', ')}`);

  // --- 3. Test CLI Rust : Phylogenetic Tree & Molecular Clock ---
  console.log('\n--- 3. Testing Rust Native Phylogeny & Molecular Clock ---');
  const divResult = await genosCli.runPhylogeny({
    action: 'divergence',
    genomeA: 'AGENT_CLUSTER_A',
    genomeB: 'AGENT_CLUSTER_B'
  });
  assert(divResult.ok, `CLI phylogeny divergence failed: ${divResult.stderr}`);
  assert.strictEqual(divResult.json.action, 'divergence');
  assert(typeof divResult.json.divergence_million_years === 'number', 'Divergence time must be numeric');
  console.log(`  ✅ PASS: Divergence estimation: ${divResult.json.divergence_million_years} million years`);

  const clockResult = await genosCli.runPhylogeny({
    action: 'molecular_clock',
    genomeA: 'LINEAGE_ALPHA_2026',
    genomeB: 'LINEAGE_BETA_2026',
    mutationRate: 0.02
  });
  assert(clockResult.ok, `CLI molecular clock failed: ${clockResult.stderr}`);
  assert(typeof clockResult.json.estimated_generations_divergence === 'number');
  console.log(`  ✅ PASS: Molecular clock calculated: ${clockResult.json.estimated_generations_divergence} generations ago`);

  const hybResult = await genosCli.runPhylogeny({
    action: 'hybridize',
    genomeA: 'SPECIES_A',
    genomeB: 'SPECIES_B',
    isPlant: true
  });
  assert(hybResult.ok, `CLI hybridization failed: ${hybResult.stderr}`);
  assert(hybResult.json.hybridization_result, 'Hybridization result classification must exist');
  console.log(`  ✅ PASS: Hybridization attempt: ${hybResult.json.hybridization_result}`);

  // --- 4. Test Strategy Adapter : Breed Primitive with Real Genetics ---
  console.log('\n--- 4. Testing Strategy Primitive "breed" with Full Genetic Inheritance ---');
  const db = await getDatabase();
  const parent1Id = `parent_test_1_${Date.now()}`;
  const parent2Id = `parent_test_2_${Date.now()}`;

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task, model_tier) VALUES (?, 'Parent Architect', 'architect', 'idle', 'GenOS', 'worker', 'Build resilient state machine', 'standard')",
    parent1Id
  );
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task, model_tier) VALUES (?, 'Parent RedTeam', 'security_auditor', 'idle', 'GenOS', 'worker', 'Probe and fuzz invariants', 'standard')",
    parent2Id
  );

  const breedRes = await strategyAdapter.executePrimitive('breed', {
    parentA: parent1Id,
    parentB: parent2Id,
    strategy: 'uniform',
    swapProb: 0.5
  });

  assert(breedRes.success, `Primitive breed failed: ${breedRes.error}`);
  assert(breedRes.childId, 'Offspring child ID must exist');
  assert(breedRes.childGenes, 'Inherited child genes must exist');
  assert(breedRes.childGenes.tools && breedRes.childGenes.tools.length > 0, 'Inherited tools must be non-empty');
  assert(breedRes.predictedFitnessScore > 0, 'Predicted fitness score must be calculated');
  assert.strictEqual(breedRes.fitnessStatus, 'unvalidated');
  assert(breedRes.nativeRecombination, 'Rust native meiotic crossover must be recorded in breed result');
    assert(breedRes.reproducibility?.seed, 'Breed must expose a replay seed');
    assert(breedRes.reproducibility?.genomeHash, 'Breed must expose a reproducible genome hash');

  // Verify DB insertion
  const childRow = await db.get("SELECT * FROM agents WHERE id = ?", breedRes.childId);
  assert(childRow, 'Child agent must be inserted in SQLite agents table');
  assert.strictEqual(childRow.lineage_relation, 'crossover');
  assert(childRow.current_task.includes('Strategy:'), 'Child task must contain recombined strategy description');
  console.log(`  ✅ PASS: Offspring ${breedRes.childId} bred with strategy ${breedRes.childGenes.strategy}, tools [${breedRes.childGenes.tools.join(', ')}], fitness score ${breedRes.fitnessScore}`);

  const isolatedParentA = `parent_isolated_a_${Date.now()}`;
  const isolatedParentB = `parent_isolated_b_${Date.now()}`;
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES ('workspace-a', 'Workspace A', ?)", __dirname);
  await db.run("INSERT OR IGNORE INTO workspaces (id, name, path) VALUES ('workspace-b', 'Workspace B', ?)", __dirname);
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task, model_tier, workspace_id) VALUES (?, 'Isolated A', 'worker', 'idle', 'GenOS', 'worker', 'A', 'standard', 'workspace-a')",
    isolatedParentA
  );
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task, model_tier, workspace_id) VALUES (?, 'Isolated B', 'worker', 'idle', 'GenOS', 'worker', 'B', 'standard', 'workspace-b')",
    isolatedParentB
  );
  const crossWorkspaceBreed = await strategyAdapter.executePrimitive('breed', {
    parentA: isolatedParentA, parentB: isolatedParentB, workspaceId: 'workspace-a'
  });
  assert.strictEqual(crossWorkspaceBreed.success, false, 'Cross-workspace breeding must be rejected');

  // --- 5. Test Strategy Primitive : Speciation with Phylogeny ---
  console.log('\n--- 5. Testing Strategy Primitive "speciation" with Niche Divergence ---');
  const orchId = `orch_spec_${Date.now()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, current_task) VALUES (?, 'Orchestrator Spec', 'orchestrator', 'running', 'GenOS', 'orchestrator', 'Orchestrate swarm')",
    orchId
  );
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, parent_agent_id) VALUES (?, 'Worker A', 'data_engineer', 'running', 'GenOS', 'worker', ?)",
    `worker_a_${Date.now()}`, orchId
  );
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, parent_agent_id) VALUES (?, 'Worker B', 'security_engineer', 'running', 'GenOS', 'worker', ?)",
    `worker_b_${Date.now()}`, orchId
  );

  const specRes = await strategyAdapter.executePrimitive('speciation', {
    orchestratorId: orchId
  });
  assert(specRes.success, 'Speciation primitive must succeed');
  assert(specRes.nicheCount >= 2, 'Should identify at least 2 niches');
  assert(specRes.phylogeneticDivergence, 'Phylogenetic divergence should be computed between niches');
  console.log(`  ✅ PASS: Speciation identified ${specRes.nicheCount} niches with phylogenetic divergence: ${specRes.phylogeneticDivergence?.divergence_million_years} My`);

  console.log('\n======================================================');
  console.log('ALL REPRODUCTION & EVOLUTIONARY GENETICS TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
